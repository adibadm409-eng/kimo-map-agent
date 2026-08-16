import { getMessages, getSettings, createSession, listUndo, activeConfig, updateSessionMeta, getPending, clearPending, addBrainOp, listBrain, clearBrain, type Message, type BrainOp, type AgentSettings } from './store'
import { saveAttachment } from '../database/workspace'
import { readAudioInput } from './files'
import { chatWithRetry, parseToolArgs, toWireToolCall, type ChatContentPart, type ChatMessage, type ToolCall } from './llm'
import { defaultProvider, providerCapabilities, type ProviderDef, type ProviderId } from './providers'
import { analyzeIntent, buildContextSummary } from './intent'
import { persistUser, persistAssistantText, persistAssistantToolCalls, mimeOf } from './persist'
import { buildSystemPrompt, getAgentFunctions } from './prompts'
import { assessSkill, getSkillById, planForSkill } from './skills'
import { completePlanStep, type AgentPlan, type AgentSkill } from './agentContract'
import { publishRuntimeEvent } from './runtimeEvents'
import { readModelHistory, messagesToLlm } from './history'
import { handleToolCall, deleteOne, deleteApproved, deleteRefused } from './invokeTools'
import { performUndo, toolSig } from './undo'
import { appendTaskEvidence, createTaskRun, getLatestTaskRun, transitionTaskRun } from './store'
import { emit, subscribeAgent, isAgentBusy, cancelAgent, markRunning, clearRunning, isCancelled, setAborter, clearAborter, type AgentEvent } from './agentRun'
import { MAX_AGENT_RUNTIME_MS, MAX_REPEATED_TOOL_CALLS, MAX_TOOL_CALLS, MAX_TOOL_ROUNDS } from './constants'
import * as FileSystem from 'expo-file-system/legacy'

function providerProxy(conn: { providerId: string; baseUrl: string; providerName: string }): ProviderDef {
  if (conn.providerId.startsWith('custom:')) {
    return { id: 'custom', name: conn.providerName, color: '#888888', baseUrl: conn.baseUrl, defaultModels: [], modelsKind: 'openai' }
  }
  const def = defaultProvider(conn.providerId as ProviderId)
  return { ...def, baseUrl: conn.baseUrl || def.baseUrl }
}

function hashOf(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return String(h)
}

function truncate(s: string, n: number): string {
  const t = String(s ?? '')
  return t.length > n ? t.slice(0, n) + '…' : t
}

// ---------- الحلقة الرئيسية ----------

async function runLoop(
  sessionId: string,
  s: AgentSettings,
  conn: { providerId: string; baseUrl: string; apiKey: string; providerName: string; model: string },
  emitEvents: boolean,
  initialContent?: ChatMessage['content']
): Promise<void> {
  const aborter = new AbortController()
  setAborter(sessionId, aborter)
  try {
    const callCounts = new Map<string, number>()
    const lastObsBySig = new Map<string, string>()
    const startedAt = Date.now()
    let totalCalls = 0
    const lastObsHashForSig = new Map<string, string>()
    const lastUserMsg = (await getMessages(sessionId)).filter((m) => m.role === 'user').pop()
    const previousTask = await getLatestTaskRun(sessionId).catch(() => null)
    let runtimePlan: AgentPlan | null = null
    let runtimeSkill: AgentSkill | null = null
    let runtimeTaskId: string | undefined
    let runtimeEvidenceCount = 0
    let runtimeSuccessfulEvidenceCount = 0
    let runtimeLastEvidenceOk = true
    if (lastUserMsg) {
      const goal = String(lastUserMsg.content ?? '').trim()
      const assessment = assessSkill(goal)
      const match = assessment.match
      const continuationMessage = goal.startsWith('[إجابة المستخدم على سؤالك]') || goal.startsWith('[موافقة المستخدم على') || goal.startsWith('[رفض المستخدم للإجراء]')
      const resumed = previousTask && continuationMessage && ['proposed', 'awaiting_user', 'running', 'verifying'].includes(previousTask.status)
      if (resumed) {
        runtimeTaskId = previousTask.id
        runtimeSkill = getSkillById(previousTask.skillId ?? '') ?? match.skill
        runtimePlan = (previousTask.plan as AgentPlan | undefined) ?? planForSkill(runtimeSkill, goal)
        await transitionTaskRun(runtimeTaskId, 'running', { plan: runtimePlan })
      } else {
        runtimeSkill = match.skill
        // لا تُعدّ كل رسالة مهمة تنفيذية: الخطة تأتي من بوابة النية المركزية
        // التي تميز المحادثة والسؤال العام والغموض عن طلب تنفيذ فعلي.
        const shouldPlan = assessment.shouldPlan
        runtimePlan = shouldPlan ? planForSkill(runtimeSkill, goal) : null
        if (shouldPlan && runtimePlan) {
          const task = await createTaskRun({ sessionId, userRequest: goal, skillId: runtimeSkill.id, intent: assessment.intent, confidence: assessment.confidence, plan: runtimePlan })
          runtimeTaskId = task.id
          await transitionTaskRun(runtimeTaskId, 'running', { plan: runtimePlan })
        }
      }
      const shouldPlan = !!runtimeTaskId && !!runtimePlan
      if (emitEvents && shouldPlan && runtimePlan) {
        publishRuntimeEvent(sessionId, { type: 'phase', phase: 'understand', label: 'أفهم طلبك', detail: match.reasons.join(' ') || 'أحدد نوع المهمة قبل اختيار المسار.' })
        publishRuntimeEvent(sessionId, { type: 'skill', skill: { id: runtimeSkill.id, label: runtimeSkill.label, description: runtimeSkill.description } })
        publishRuntimeEvent(sessionId, { type: 'plan', plan: runtimePlan })
        publishRuntimeEvent(sessionId, { type: 'phase', phase: 'plan', label: 'أبني الخطة', detail: runtimeSkill.systemGuidance })
      }
      await addBrainOp(sessionId, 'skill', `المهارة المختارة: ${runtimeSkill.id} — ${runtimeSkill.label}`).catch(() => {})
      if (runtimePlan) await addBrainOp(sessionId, 'plan', runtimePlan.steps.map((step) => step.title).join(' ← ')).catch(() => {})
    }
    if (lastUserMsg) await addBrainOp(sessionId, 'task', `مهمة المستخدم: ${String(lastUserMsg.content ?? '').slice(0, 300)}`).catch(() => {})
    // تحليل النية وسياق المحادثة: يُحقنان في سطر النظام ليتكيف الوكيل ويستمر من حيث توقف المستخدم
    if (lastUserMsg) {
      const intent = analyzeIntent(String(lastUserMsg.content ?? ''))
      if (intent) await addBrainOp(sessionId, 'intent', `نية المستخدم الحالية: ${intent}`).catch(() => {})
      const ctx = buildContextSummary(await getMessages(sessionId).catch(() => [] as Message[]))
      if (ctx) await addBrainOp(sessionId, 'context', ctx).catch(() => {})
    }
    // مسار تفكير ReAct داخل الذاكرة: محادثة المستخدم فقط كبذرة، ثم نلحق بها
    // كل أداة+ملاحظتها في الخيط الخاص (لا تدخل محادثة المستخدم الظاهرة).
    const thread: ChatMessage[] = messagesToLlm(await readModelHistory(sessionId))
    if (initialContent !== undefined) {
      // استبدال آخر رسالة مستخدم بالحمولة متعددة الوسائط نفسها؛ لا نحفظ Base64
      // في SQLite ولا نضيف رسالة وصفية ثانية إلى سياق الموديل.
      for (let i = thread.length - 1; i >= 0; i--) {
        if (thread[i].role === 'user') {
          thread[i] = { role: 'user', content: initialContent }
          break
        }
      }
    }
    try {
      let finished = false
      for (let round = 0; round < MAX_TOOL_ROUNDS && Date.now() - startedAt < MAX_AGENT_RUNTIME_MS; round++) {
        if (isCancelled(sessionId)) return
        const brainOps = await listBrain(sessionId, 12).catch(() => [] as BrainOp[])
        const system: ChatMessage = {
          role: 'system',
                      content: buildSystemPrompt(
              s,
              conn.providerName,
              conn.model,
              runtimeSkill ? [runtimeSkill.systemGuidance, `المهارة الحالية: ${runtimeSkill.label}. اتبع ترتيب الخطة الظاهر للمستخدم، واطلب المعلومات الناقصة بدلاً من التخمين.`] : [],
              brainOps,
            ),

        }
        if (emitEvents) emit({ type: 'thinking' })

        let result
        try {
          let liveText = ''
          result = await chatWithRetry(
            {
              provider: providerProxy(conn),
              baseUrl: conn.baseUrl,
              apiKey: conn.apiKey,
              model: conn.model,
              messages: [system, ...thread],
              functions: getAgentFunctions(runtimeSkill),
              maxTokens: 4000,
              onDelta: (d) => {
                liveText = d.content || liveText
                if (emitEvents && liveText && (!d.toolCalls || !d.toolCalls.length)) {
                  emit({ type: 'stream', content: liveText })
                }
              },
            },
            (attempt, delayMs) => {
              emit({
                type: 'error',
                message: `تعذر الوصول للمزود (محاولة ${attempt + 1}) — إعادة المحاولة خلال ${Math.round(delayMs / 1000)} ثانية...`,
              })
            },
            aborter.signal
          )
        } catch (e: any) {
          if (isCancelled(sessionId)) {
            if (runtimeTaskId) await transitionTaskRun(runtimeTaskId, 'cancelled', { lastError: 'أوقف المستخدم التنفيذ' })
            await persistAssistantText(sessionId, 'تم إيقاف الطلب.', 'system')
            if (emitEvents) emit({ type: 'text', content: 'تم إيقاف الطلب.' })
            return
          }
          // تثبيت الخطأ في السجل حتى يراه المستخدم ويعرف السبب — لا صمت ولا إخفاء
          const errMsg = e?.message ?? String(e)
          const errIsRetry = typeof e?.kind === 'string' && ['network', 'timeout', 'rate_limit', 'server'].includes(e.kind)
          const finalMsg = errIsRetry
            ? `تعذر الوصول للمزود مؤقتاً بعد سياسة التعافي (3/5/10/30 ثانية): ${errMsg}. تحقق من الاتصال أو جرّب لاحقاً.`
            : e?.kind === 'invalid_request'
              ? `رفض المزود صيغة الطلب؛ لم أكررها عشوائياً. راجع الموديل أو قدراته: ${errMsg}`
              : e?.kind === 'auth'
                ? `رفض المزود بيانات الاعتماد؛ تحقق من المفتاح والرابط والموديل: ${errMsg}`
                : `تعذّر إكمال الرد: ${errMsg}`
          if (runtimeTaskId) await transitionTaskRun(runtimeTaskId, 'failed', { lastError: finalMsg })
          await persistAssistantText(sessionId, finalMsg, 'error').catch(() => {})
          if (emitEvents) emit({ type: 'error', message: finalMsg })
          return
        }

        if (isCancelled(sessionId)) return

        if (result.toolCalls.length) {
          // احفظ كل نداءات الجولة في assistant واحدة قبل تنفيذ أي أداة.
          // هذا يحافظ على عقد parallel tool calls عند إعادة فتح الجلسة أو استئنافها.
          const persistedCalls = result.toolCalls.map((call) => ({
            ...call,
            extra: { ...(call.extra ?? {}), __assistantPersisted: true },
          }))
          await persistAssistantToolCalls(sessionId, persistedCalls)
          result.toolCalls = persistedCalls
        }

        if (result.content && result.toolCalls.length) {
          // نص مصاحب لنداء أداة = نشاط الوكيل أثناء التنفيذ (تفكير/تخطيط/شرح ما يفعله) —
          // يُخزَّن كنوع progress منفصل عن الرد النهائي، ويُبث live للشاشة
          const tail = String(result.content).trim()
          if (tail) {
            await persistAssistantText(sessionId, tail, 'progress')
            if (emitEvents) emit({ type: 'progress', text: tail })
          }
          thread.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls.map((call) => toWireToolCall(call, { includeProviderMetadata: providerCapabilities(providerProxy(conn), conn.model).preservesThoughtSignatures })) })
        } else if (result.toolCalls.length) {
          thread.push({ role: 'assistant', content: null, tool_calls: result.toolCalls.map((call) => toWireToolCall(call, { includeProviderMetadata: providerCapabilities(providerProxy(conn), conn.model).preservesThoughtSignatures })) })
        }

        if (!result.toolCalls.length) {
          // رد نصي من الوكيل = نهاية الرد مباشرة: يُعرض فوراً دون أي إجبار على الاستمرار
          // أو اختلاق شارة اكتمال. الوكيل وحده يقرر أنهى الرد أو طلب توضيحاً.
          const finalText = result.content ? String(result.content).trim() : ''
          if (finalText) {
            await persistAssistantText(sessionId, finalText, 'text')
            if (emitEvents) {
              emit({ type: 'stream', content: finalText })
              emit({ type: 'stream', content: '', done: true })
              emit({ type: 'text', content: finalText })
            }
          }
          const taskHasEvidence = !runtimeTaskId || (runtimeEvidenceCount > 0 && runtimeSuccessfulEvidenceCount > 0 && runtimeLastEvidenceOk)
          if (runtimeTaskId && !taskHasEvidence) {
            const noEvidence = 'وصل رد نصي، لكن لم تُثبت خطوة تنفيذ ناجحة؛ لذلك لن أعلِن اكتمال المهمة. راجع الطلب أو أعد المحاولة.'
            await transitionTaskRun(runtimeTaskId, 'failed', { lastError: noEvidence })
            if (emitEvents) publishRuntimeEvent(sessionId, { type: 'phase', phase: 'error', label: 'تحتاج المهمة إلى معالجة', detail: noEvidence })
          } else {
            if (runtimeTaskId) await transitionTaskRun(runtimeTaskId, 'verifying', { plan: runtimePlan ?? undefined })
            if (runtimePlan) runtimePlan = runtimePlan.steps.reduce((current, step) => completePlanStep(current, step.id), runtimePlan)
            if (emitEvents) {
              publishRuntimeEvent(sessionId, { type: 'phase', phase: 'complete', label: 'اكتملت المهمة', detail: 'وصلت إلى رد نهائي بعد تنفيذ الخطوات المتاحة.' })
              if (runtimePlan) publishRuntimeEvent(sessionId, { type: 'plan', plan: runtimePlan })
            }
            if (runtimeTaskId) await transitionTaskRun(runtimeTaskId, 'completed', { plan: runtimePlan ?? undefined, evidence: [{ type: 'assistant_response', summary: finalText.slice(0, 500) }] })
          }
          finished = true
          break
        }

        let paused = false
        for (const call of result.toolCalls) {
          if (isCancelled(sessionId)) return
          const sig = toolSig(call)
          totalCalls++
          if (totalCalls > MAX_TOOL_CALLS) {
            const limitMsg = `أوقفت التنفيذ الوقائي بعد ${MAX_TOOL_CALLS} استدعاء أداة في مهمة واحدة. راجع النتيجة الحالية ثم أكملها بطلب منفصل.`
            await persistAssistantText(sessionId, limitMsg, 'system').catch(() => {})
            if (emitEvents) emit({ type: 'text', content: limitMsg })
            return
          }
          const nextCount = (callCounts.get(sig) ?? 0) + 1
          callCounts.set(sig, nextCount)

          const callArgs0 = parseToolArgs(call.arguments)
          const innerTool = call.name === 'execute' ? String(callArgs0.tool ?? 'execute') : call.name
          const universalTools = new Set(['ask_user', 'request_confirmation', 'catalog', 'app_screen_catalog', 'list_entities', 'query', 'get', 'search_everything', 'data_snapshot', 'audit_log_query', 'review_my_work', 'generate_file', 'preview_update', 'undo_last', 'project_memory_save', 'project_memory_read', 'list_generated_files', 'review_generated_file', 'current_local_time'])
          const skillAllowsTool = !runtimeSkill || universalTools.has(innerTool) || runtimeSkill.readTools.includes(innerTool) || runtimeSkill.writeTools.includes(innerTool) || runtimeSkill.preferredTools.includes(innerTool)
          if (!skillAllowsTool) {
            const denied = `[فشل] المهارة «${runtimeSkill?.label ?? 'الحالية'}» لا تستخدم الأداة «${innerTool}» في هذا المسار. سأعود إلى أدوات القراءة أو أسأل عن تغيير الهدف بدلاً من تنفيذ مسار غير مناسب.`
            await persistAssistantText(sessionId, denied, 'system').catch(() => {})
            thread.push({ role: 'tool', tool_call_id: call.id, content: denied })
            if (emitEvents) {
              publishRuntimeEvent(sessionId, { type: 'observation', title: 'حُجبت أداة خارج نطاق المهارة', detail: denied, status: 'warning' })
              publishRuntimeEvent(sessionId, { type: 'recovery', title: 'أعيد توجيه التنفيذ إلى المهارة الحالية', detail: 'لم أسمح بتغيير مسار المهمة دون مبرر واضح.', strategy: 'replan' })
            }
            continue
          }

          // ملاحظة التكرار: نقارن آخر نتيجة لنفس البصمة.
          // إذا تكرر نفس النداء بنفس النتيجة
          // فوفّر عجزاً توجيهياً في سياق الوكيل — لكن القرار يبقى بيد الوكيل وحده: قد يكرر
          // بحق (إحضار بيانات متجددة/مواصلة) أو يغير الأسلوب. لا عائق ولا إيقاف منهي.
          const lastObsForSig = lastObsBySig.get(sig)
          const lastHash = hashOf(lastObsForSig ?? '')
          const repeatedSameResult = nextCount >= 2 && lastHash === lastObsHashForSig.get(sig)
          lastObsHashForSig.set(sig, lastHash)
          // عند تكرار النداء بنفس النتيجة نعدّ ملاحظة توجيهية تُدمج لاحقاً في نص
          // observation (وليس رسالة system في منتصف الخيط — البوابة ترفض ذلك).
          const repetitionNote = repeatedSameResult
            ? `[ملاحظة] نُفِّذ «${innerTool}» بـ ${nextCount} مرة متتالية بنفس الوسائط، وآخر نتيجة: ${truncate(lastObsForSig ?? '', 400)}. ` +
              `الأمر لك وحدك: إن كانت المهمة قد اكتملت بهذه النتيجة فانتقل للإجابة على المستخدم مباشرة دون أدوات إضافية، وإن كانت تحتاج مواصلة أو أسوأ من ذلك (فشل) فاحكم بنفسك — كرر إن كان مبرراً، أو غيّر الوسائط/الأداة/المنهج، أو اسأل المستخدم. لا قيد عليك في الاستمرار طالما ترى تقدماً أو حاجة حقيقية.`
            : null
          if (repeatedSameResult && emitEvents) emit({ type: 'thinking' })
          if (repeatedSameResult && nextCount > MAX_REPEATED_TOOL_CALLS) {
            const stopMsg = `أوقفت تكرار «${innerTool}» بعد ${MAX_REPEATED_TOOL_CALLS} محاولات متطابقة بلا تقدم. سأحافظ على البيانات كما هي.`
            await persistAssistantText(sessionId, stopMsg, 'system').catch(() => {})
            if (emitEvents) emit({ type: 'text', content: stopMsg })
            return
          }

          if (emitEvents) {
            const verifyTools = runtimeSkill?.verificationTools ?? ['review_my_work', 'project_integrity_check']
            const phase = verifyTools.includes(innerTool) ? 'verify' : innerTool === 'ask_user' || innerTool === 'request_confirmation' ? 'ask' : 'execute'
            publishRuntimeEvent(sessionId, { type: 'phase', phase, label: phase === 'verify' ? 'أراجع النتيجة' : phase === 'ask' ? 'أحتاج قرارك' : 'أنفذ الآن', detail: `أتعامل مع ${innerTool === 'project_import_preview' ? 'معاينة البيانات' : innerTool === 'project_import_commit' ? 'اعتماد الإدخال' : innerTool}` })
            if (phase === 'ask') {
              publishRuntimeEvent(sessionId, {
                type: 'decision',
                decision: {
                  id: `decision-${Date.now().toString(36)}`,
                  kind: innerTool === 'request_confirmation' ? 'approval' : 'question',
                  title: innerTool === 'request_confirmation' ? 'أحتاج موافقتك قبل المتابعة' : 'أحتاج معلومة منك قبل المتابعة',
                  detail: 'لن أخمّن هذه المعلومة ولن أكتب بيانات قبل أن يصبح القرار واضحاً.',
                  reversible: true,
                  createdAt: Date.now(),
                },
              })
            }
            if (runtimePlan) {
              const active = runtimePlan.steps.find((step) => step.status === 'active')
              if (active) publishRuntimeEvent(sessionId, { type: 'plan_step', step: { ...active, detail: `جار تنفيذ المرحلة عبر ${innerTool}` } })
            }
          }
          const cont = await handleToolCall(sessionId, s, call, emitEvents)
          if (cont) {
            const callArgs = parseToolArgs(call.arguments)
            const innerTool = call.name === 'execute' ? String(callArgs.tool ?? 'execute') : call.name
            const innerArgs = call.name === 'execute' ? (callArgs.args ?? {}) : callArgs
            await addBrainOp(sessionId, 'op', `${innerTool}: ${JSON.stringify(innerArgs).slice(0, 160)}`).catch(() => {})
            // إعادة الملاحظة (Observation) إلى مسار تفكير ReAct بعد التنفيذ
            const toolMsgs = (await getMessages(sessionId)).filter((m) => m.role === 'tool')
            const lastObs = toolMsgs[toolMsgs.length - 1]
            const obsText = lastObs && lastObs.meta
              ? String(lastObs.meta.observation ?? lastObs.meta.result ?? '')
              : ''
            if (lastObs && lastObs.meta) {
              const evidenceOk = lastObs.meta.ok !== false
              runtimeEvidenceCount++
              runtimeLastEvidenceOk = evidenceOk
              if (evidenceOk) runtimeSuccessfulEvidenceCount++
              if (runtimeTaskId) await appendTaskEvidence(runtimeTaskId, { tool: innerTool, ok: evidenceOk, summary: String(lastObs.meta.observation ?? lastObs.meta.result ?? '').slice(0, 600) })
              if (emitEvents) {
                const ok = lastObs.meta.ok !== false
                const observationDetail = String(lastObs.meta.observation ?? lastObs.meta.result ?? '').slice(0, 600)
                publishRuntimeEvent(sessionId, { type: 'observation', title: ok ? 'وصلت نتيجة من التطبيق' : 'توقفت خطوة بسبب نتيجة غير صالحة', detail: observationDetail, status: ok ? 'success' : 'error' })
                if (!ok) {
                  const strategy = runtimeSkill?.recoveryPolicy ?? 'ask_user'
                  publishRuntimeEvent(sessionId, { type: 'recovery', title: 'أعيد تقييم المسار بدلاً من تكرار الخطأ', detail: `${observationDetail} — الاستراتيجية: ${strategy === 'replan' ? 'إعادة التخطيط' : strategy === 'rollback' ? 'التراجع الآمن' : strategy === 'retry' ? 'إعادة المحاولة بضوابط' : 'سؤال المستخدم'}.`, strategy })
                  publishRuntimeEvent(sessionId, { type: 'phase', phase: 'recover', label: 'أعالج تعثراً', detail: 'أحلل سبب النتيجة قبل اختيار الخطوة التالية.' })
                }
              }
              thread.push({
                role: 'tool',
                tool_call_id: call.id,
                content: repetitionNote ? `${repetitionNote}\n${obsText}` : obsText,
              })
            }
            // تسجيل آخر نتيجة لهذه البصمة للمقارنة عند التكرار القادم
            lastObsBySig.set(sig, obsText)
            lastObsHashForSig.set(sig, hashOf(obsText))
          }
          if (!cont) {
            if (runtimeTaskId) await transitionTaskRun(runtimeTaskId, 'awaiting_user', { plan: runtimePlan ?? undefined })
            paused = true
            break
          }
        }
        if (paused) break
      }
      // إذا استُنفدت جولات هذه المهمة دون أن يختم الوكيل إجابته، نُسلم العنان للمستخدم
      // ليكمل برسالة جديدة — لا نعلن فشلاً ولا نتهم الوكيل بالتكرار.
      if (!finished && !isCancelled(sessionId)) {
        if (runtimeTaskId) await transitionTaskRun(runtimeTaskId, 'failed', { lastError: 'انتهت الجولة قبل إغلاق المهمة' })
        await persistAssistantText(
          sessionId,
          'أنجزت ما أمكن تنفيذه ضمن هذه الجولة من الأدوات. أخبرني ما تريد إكماله أو تعديله وسأكمل من حيث توقفت.',
          'system'
        )
        if (emitEvents) emit({ type: 'text', content: 'أنجزت ما أمكن تنفيذه ضمن هذه الجولة. أرسل رسالة للمتابعة.' })
      }
    } finally {
      await clearBrain(sessionId).catch(() => {})
    }
  } finally {
    clearAborter(sessionId, aborter)
  }
}

// ---------- الواجهة العامة ----------

interface ConnConfig {
  settings: AgentSettings
  providerId: string
  providerName: string
  model: string
  baseUrl: string
  apiKey: string
}

async function resolveConfig(): Promise<ConnConfig> {
  const settings = await getSettings()
  const cfg = await activeConfig(settings)
  return {
    settings,
    providerId: cfg.providerId,
    providerName: cfg.providerName,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
  }
}

export interface SendOptions {
  attachments?: { uri: string; name?: string }[]
  audio?: { uri: string; format?: 'm4a' | 'wav' | 'mp3' | 'webm'; name?: string }
}

async function withConfig<T>(fn: (conn: ConnConfig) => Promise<T>): Promise<T> {
  const config = await resolveConfig()
  if (!config.model || !config.apiKey) {
    throw new Error('لم يُعدَّ المزود بعد: أضف مفتاح API واختر موديلاً من إعدادات المساعد.')
  }
  return fn(config)
}

async function runGuarded(sessionId: string, conn: ConnConfig, emitEvents = true, initialContent?: ChatMessage['content']): Promise<void> {
  markRunning(sessionId)
  try {
    await runLoop(sessionId, conn.settings, conn, emitEvents, initialContent)
  } finally {
    clearRunning(sessionId)
  }
}

/** إرسال رسالة مستخدم وتشغيل حلقة الوكيل. */
export async function sendUserMessage(sessionId: string, text: string, opts?: SendOptions): Promise<void> {
  if (isAgentBusy(sessionId)) return
  let conn: ConnConfig
  try {
    conn = await withConfig(async (c) => c)
  } catch (e: any) {
    await persistAssistantText(sessionId, e?.message ?? 'إعداد ناقص', 'error')
    emit({ type: 'error', message: e?.message ?? 'إعداد ناقص' })
    return
  }

  let content = text
  let initialContent: ChatMessage['content'] | undefined
  if (opts?.audio) {
    const capabilities = providerCapabilities(providerProxy(conn), conn.model)
    const voiceLabel = opts.audio.name ?? 'تسجيل صوتي'
    if (!capabilities.supportsInputAudio) {
      const message = `الموديل ${conn.model} لا يثبت دعماً للإدخال الصوتي عبر ${conn.providerName}. اختر موديل صوتياً معلناً من إعدادات كيمو؛ لم أرسل طلباً غير متوافق.`
      await persistUser(sessionId, `رسالة صوتية: ${voiceLabel}`)
      await persistAssistantText(sessionId, message, 'error')
      emit({ type: 'error', message })
      return
    }
    try {
      const audio = await readAudioInput(opts.audio.uri, opts.audio.format ?? 'm4a')
      const name = opts.audio.name ?? audio.name
      await saveAttachment({
        sessionId,
        name,
        uri: audio.uri,
        size: audio.size,
        mime: audio.format === 'm4a' ? 'audio/mp4' : `audio/${audio.format}`,
      }).catch(() => {})
      const voiceText = text.trim() || 'أرسل المستخدم تسجيلاً صوتياً. استمع إليه وافهم المطلوب ثم تعامل معه وفق مهاراتك وأدواتك.'
      initialContent = [
        { type: 'text', text: voiceText },
        { type: 'input_audio', input_audio: { data: audio.base64, format: audio.format } },
      ] satisfies ChatContentPart[]
      content = `رسالة صوتية: ${name}`
    } catch (error: any) {
      const message = error?.message ?? 'تعذر تجهيز التسجيل الصوتي محلياً.'
      await persistUser(sessionId, `رسالة صوتية: ${voiceLabel}`)
      await persistAssistantText(sessionId, message, 'error')
      emit({ type: 'error', message })
      return
    }
  }
  if (opts?.attachments?.length) {
    for (const att of opts.attachments) {
      try {
        let size = 0
        let mime: string | undefined
        try {
          const fsInfo = await FileSystem.getInfoAsync(att.uri)
          if (fsInfo.exists && 'size' in fsInfo) size = fsInfo.size ?? 0
        } catch {}
        const name = att.name ?? (att.uri.split('/').pop() ?? 'ملف')
        mime = mimeOf(name)
        const attachmentId = await saveAttachment({ sessionId, name, uri: att.uri, size, mime })
        content += `\n\n[ملف مرفق من المستخدم: "${name}" — المعرف: ${attachmentId} — الحجم ${(size / 1024).toFixed(0)} كيلوبايت. يمكنك معاينته بـ read_uploaded_file أو فحصه ضمن property_change_preview ثم ربطه بـ attach_media_to_entity]`
      } catch {}
    }
  }

  await updateSessionMeta(sessionId, { providerLabel: conn.providerName, model: conn.model })
  const first = await getMessages(sessionId).catch(() => [])
  if (!first.length) {
    const title = text.replace(/\s+/g, ' ').slice(0, 40) || 'محادثة جديدة'
    await updateSessionMeta(sessionId, { title })
  }

  await persistUser(sessionId, content)
  // لا رسائل تقدم ثابتة — المساعد نفسه يخاطب المستخدم بما يقرره هو.
  await runGuarded(sessionId, conn, true, initialContent)
  emit({ type: 'done' })
}

/** الرد على سؤال سابق (ask_user) ومواصلة عمل الوكيل. */
export async function answerAsk(sessionId: string, answer: string): Promise<void> {
  if (isAgentBusy(sessionId)) return
  const pending = await getPending(sessionId)
  if (!pending || pending.kind !== 'ask_user') return
  let conn: ConnConfig
  try {
    conn = await withConfig(async (c) => c)
  } catch (e: any) {
    await persistAssistantText(sessionId, e?.message ?? 'إعداد ناقص', 'error')
    emit({ type: 'error', message: e?.message ?? 'إعداد ناقص' })
    return
  }
  await clearPending(sessionId)
  await persistUser(sessionId, `[إجابة المستخدم على سؤالك] ${answer}`)
  await runGuarded(sessionId, conn)
  emit({ type: 'done' })
}

/** الموافقة أو الرفض على طلب تأكيد (حذف...) ومواصلة عمل الوكيل. */
export async function answerConfirmation(sessionId: string, approve: boolean, selected?: number[]): Promise<void> {
  if (isAgentBusy(sessionId)) return
  const pending = await getPending(sessionId)
  if (!pending || pending.kind !== 'confirmation') return
  let conn: ConnConfig
  try {
    conn = await withConfig(async (c) => c)
  } catch (e: any) {
    await persistAssistantText(sessionId, e?.message ?? 'إعداد ناقص', 'error')
    emit({ type: 'error', message: e?.message ?? 'إعداد ناقص' })
    return
  }

  await clearPending(sessionId)
  if (approve) {
    const items = Array.isArray(pending.items) && pending.items.length ? pending.items : null
    if (items) {
      const chosen = (selected ?? items.map((_, i) => i)).filter((i) => i >= 0 && i < items.length).map((i) => items[i])
      if (chosen.length) {
        const labels = chosen.map((it) => it.preview).join('، ')
        await persistUser(sessionId, `[موافقة المستخدم على حذف: ${labels}]`)
        await persistAssistantText(sessionId, `تمت الموافقة على حذف ${chosen.length} عنصر`, 'system')
        for (const it of chosen) {
          const outcome = await deleteOne(sessionId, it.tool, it.id, it.entity ? { entity: it.entity, id: it.id } : { id: it.id })
          emit({ type: 'tool', name: it.tool, args: { ...(it.entity ? { entity: it.entity } : {}), id: it.id }, result: outcome })
        }
      } else {
        await persistUser(sessionId, '[لم يُحدد المستخدم أي عنصر — رفض الحذف]')
      }
    } else {
      await persistUser(sessionId, '[موافقة المستخدم على الإجراء]')
      await deleteApproved(sessionId, pending)
    }
  } else {
    await persistUser(sessionId, '[رفض المستخدم للإجراء]')
    await deleteRefused(sessionId)
  }
  await runGuarded(sessionId, conn)
  emit({ type: 'done' })
}

export { createSession as newSession, listUndo }
export type { PendingState } from './store'
export type { AgentEvent }
export { subscribeAgent, cancelAgent, isAgentBusy, performUndo }
