import { getMessages, getSettings, createSession, listUndo, activeConfig, updateSessionMeta, getPending, clearPending, addBrainOp, listBrain, clearBrain, type Message, type BrainOp, type AgentSettings } from './store'
import { saveAsset } from './assetStore'
import { createUserTurn, hasPayload, summarizeAssetForModel, type InputAssetKind } from './inputEnvelope'
import {
  findDurableTaskStep,
  ensureDurablePlanSteps,
  getDurableOperationSummary,
  markLatestPendingWriteVerified,
  recordDurableOperation,
  recordDurableUserTurn,
  updateDurableOperation,
  updateDurableTaskStep,
} from './durableStore'
import { readAudioInput } from './files'
import { chatWithRetry, parseToolArgs, toWireToolCall, type ChatMessage, type ToolCall } from './llm'
import { transcribeAudio, TranscribeError } from './transcribe'
import { parseToolArgumentsStrict } from './toolValidation'
import { defaultProvider, type ProviderDef, type ProviderId } from './providers'
import { resolveModelProfile } from './modelProfiles'
import { validateToolCallAgainstDefinitions, validateToolCallBatch } from './toolValidation'
import { analyzeIntent, buildContextSummary } from './intent'
import { persistUser, persistAssistantText, persistAssistantToolCalls, persistToolResult } from './persist'
import { sanitizeAssistantText } from './sanitize'
import { buildSystemPrompt, buildMinimalPrompt, getAgentFunctions } from './prompts'
import { assessSkill, getSkillById, planForSkill } from './skills'
import { completePlanStep, type AgentPlan, type AgentSkill } from './agentContract'
import { publishRuntimeEvent } from './runtimeEvents'
import { readModelHistory, messagesToLlm, collapseParallelToolRounds } from './history'
import { handleToolCall, deleteOne, deleteApproved, deleteRefused } from './invokeTools'
import { performUndo, toolSig } from './undo'
import { appendTaskEvidence, createTaskRun, getLatestTaskRun, transitionTaskRun } from './store'
import { emitForSession, subscribeAgent, isAgentBusy, cancelAgent, markRunning, clearRunning, isCancelled, setAborter, clearAborter, deriveAgentOutcome, type AgentEvent, type AgentOutcome } from './agentRun'
import { MAX_AGENT_RUNTIME_MS, MAX_REPEATED_TOOL_CALLS, MAX_TOOL_CALLS, MAX_TOOL_ROUNDS } from './constants'
import { classifyIntent, getLocalResponse, type ClassifiedIntent } from './intentRouter'
import { toolCache } from './toolCache'
import { recordPattern } from './learning'
import { buildDynamicPrompt } from './dynamicPrompt'

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

const NON_EVIDENCE_PLAN_STEPS = new Set(['understand', 'plan', 'answer', 'present', 'decide'])

function isVerificationToolName(toolName: string, skill?: AgentSkill | null): boolean {
  if (skill?.verificationTools.includes(toolName)) return true
  if (['preview_update', 'property_change_preview', 'project_import_preview', 'inspect_asset', 'file_preview', 'read_uploaded_file'].includes(toolName)) return true
  return /(?:^|_)(?:get|query|list|read|inspect|search|review|verify|integrity|snapshot|summary|tree|schedule|cashflow|financial|schema)(?:$|_)/i.test(toolName)
}

function advanceNonEvidencePlan(plan: AgentPlan): AgentPlan {
  let current = plan
  while (current.currentStepId) {
    const active = current.steps.find((step) => step.id === current.currentStepId)
    if (!active || !NON_EVIDENCE_PLAN_STEPS.has(active.id) || active.status === 'done') break
    current = completePlanStep(current, active.id, 'تم تحديد هذه المرحلة ضمن قرار الوكيل، وتبقى مراحل التنفيذ مرتبطة بالأدلة.')
  }
  return current
}

// ---------- الحلقة الرئيسية ----------

const MAX_NO_EVIDENCE_RECOVERIES = 2

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
    let noEvidenceRecoveryAttempts = 0
    const lastObsHashForSig = new Map<string, string>()
    const lastUserMsg = (await getMessages(sessionId)).filter((m) => m.role === 'user').pop()
    const lastUserText = String(lastUserMsg?.content ?? '').trim()

    // تصنيف النية + رد محلي فوري
    const classifiedIntent = classifyIntent(lastUserText)
    const localResponse = getLocalResponse(lastUserText)
    if (localResponse && !classifiedIntent.needsLLM) {
      await persistAssistantText(sessionId, localResponse, 'text')
      if (emitEvents) {
        emitForSession(sessionId, { type: 'stream', content: localResponse })
        emitForSession(sessionId, { type: 'stream', content: '', done: true })
        emitForSession(sessionId, { type: 'text', content: localResponse })
      }
      return
    }
    // القراءة التي تطلب أرقاماً أو حالة محلية لا يجوز أن تنتهي بنص النموذج وحده.
    // هذا الحارس لا يقرر تشغيل الأدوات مسبقاً؛ لا يعمل إلا بعد أن يعيد المزود
    // رداً نهائياً بلا tool_calls، فيعيد الجولة إلى الوكيل أو يسجل فشلاً صريحاً.
    const readIntentRequiresEvidence = Boolean(
      lastUserMsg
      && /(?:اعرض|أظهر|اظهر|اقرأ|استكشف|ابحث|اعثر|كم|عدد|إجمالي|ملخص|جدول|شجرة|المؤشرات|التدفقات|الأقساط|المشروع|الوقت المحلي|تاريخ اليوم|البيانات المحلية|التنبيهات|التدقيق|من غيّر)/.test(lastUserText)
      && !/(?:أنشئ|انشئ|أضف|اضف|عدّل|عدل|حدّث|حدث|احذف|حذف|سجّل|سجل\s+(?:دفعة|دفع|مبلغ|قسط|إيصال|تحويل)|استورد|استيراد|ذكرني|تذكير)/.test(lastUserText),
    )
    const previousTask = await getLatestTaskRun(sessionId).catch(() => null)
    let runtimePlan: AgentPlan | null = null
    let runtimeSkill: AgentSkill | null = null
    let runtimeTaskId: string | undefined
    let runtimeEvidenceCount = 0
    let runtimeSuccessfulEvidenceCount = 0
    let runtimeLastEvidenceOk = true
    let runtimeCorrection = ''
    // الحوار الافتتاحي اختياري بالكامل: يقرر النموذج بنفسه إن كان سيشرح أو
    // يبدأ بأداة. لا تُحجب الأدوات ولا تُحقن رسالة ثابتة قبل قرار الوكيل.
    if (lastUserMsg) {
      const goal = String(lastUserMsg.content ?? '').trim()
      const assessment = assessSkill(goal)
      const match = assessment.match
      const continuationMessage = goal.startsWith('[إجابة المستخدم على سؤالك]') || goal.startsWith('[موافقة المستخدم على') || goal.startsWith('[رفض المستخدم للإجراء]')
      const resumed = Boolean(previousTask && continuationMessage && ['proposed', 'awaiting_user', 'running', 'verifying'].includes(previousTask.status))
      if (resumed && previousTask) {
        runtimeTaskId = previousTask.id
        const storedSkill = getSkillById(previousTask.skillId ?? '')
        // لا نُبقي مهمة مستأنفة على general_assistant إذا كشفت رسالة المتابعة
        // مساراً تنفيذياً محدداً؛ marker الموافقة على حذف العملاء يجب أن يعيد
        // اختيار client_relationship حتى تمر قراءة ما بعد الحذف بأدواته الآمنة.
        runtimeSkill = storedSkill?.id === 'general_assistant' && match.skill.id !== 'general_assistant'
          ? match.skill
          : storedSkill ?? match.skill
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
      if (runtimeTaskId && runtimePlan) {
        await ensureDurablePlanSteps(runtimeTaskId, runtimePlan.steps).catch(() => {})
        const advancedPlan = advanceNonEvidencePlan(runtimePlan)
        if (advancedPlan !== runtimePlan) {
          runtimePlan = advancedPlan
          await transitionTaskRun(runtimeTaskId, 'running', { plan: runtimePlan, currentStepId: runtimePlan.currentStepId })
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
    const threadProfile = resolveModelProfile(providerProxy(conn), conn.model)
    const rawThread = messagesToLlm(await readModelHistory(sessionId))
    const thread: ChatMessage[] = threadProfile.supports.parallelTools ? rawThread : collapseParallelToolRounds(rawThread)
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
        // حارس دورة المزود: قد يعيد Mistral نداء الأداة كنص عادي بدلاً من
        // tool_calls. إذا طلبنا جولة تصحيح والخيط ينتهي بـassistant، يرفضه
        // endpoint قبل الوصول للوكيل. نفتح الدور داخلياً دون حفظه أو عرضه.
        const wireProfile = resolveModelProfile(providerProxy(conn), conn.model)
        const lastThreadMessage = thread[thread.length - 1]
        if (wireProfile.wireFamily === 'mistral-chat' && lastThreadMessage?.role === 'assistant' && !lastThreadMessage.tool_calls?.length) {
          thread.push({ role: 'user', content: 'تابع المهمة من آخر نتيجة، واستخدم الواجهة المنظمة للأدوات عند الحاجة بدلاً من كتابة نداء الأداة كنص.' })
        }
        const system: ChatMessage = {
          role: 'system',
          content: buildDynamicPrompt(
            classifiedIntent.kind,
            classifiedIntent.entity,
            s,
            conn.providerName,
            conn.model,
            runtimeSkill ? [
              runtimeSkill.systemGuidance,
              `المهارة الحالية: ${runtimeSkill.label}. اتبع الخطة داخلياً، وشارك المستخدم منها فقط ما تراه مفيداً للسياق أو القرار، واطلب المعلومات الناقصة بدلاً من التخمين.`,
            ] : [],
            brainOps,
          ) + runtimeCorrection,
        }
        if (emitEvents) emitForSession(sessionId, { type: 'thinking' })

        const agentFunctions = getAgentFunctions(runtimeSkill)

        // تحديد ما إذا كانت الرسالة تحتاج أدوات
        // الرسائل البسيطة (تحية/سؤال عام) → بدون أدوات = استجابة سريعة
        // الرسائل المعقدة (تعديل/بحث/إجراء) → مع أدوات
        const userText = String(lastUserMsg?.content ?? '').trim()
        const isSimpleMessage = /^(مرحبا|السلام عليكم|اهلا|صباح الخير|مساء الخير|شكرا|كيف حالك|من انت|ما اسمك|اهلا بك|hello|hi|hey|thanks|thank you|كيف يمكنني|ساعدني|ما هي|ماذا يعمل)/i.test(userText)
        const hasActionIntent = /(?:أنشئ|انشئ|أضف|اضف|عدّل|عدل|احذف|حذف|سجّل|سجل|ابحث|اعرض|أظهر|اظهر|اقرأ|استكشف|كم|عدد|إجمالي|ملخص|جدول|شجرة|المؤشرات|التدفقات|الأقساط|المشروع|الوقت|تقرير|ملف)/i.test(userText)
        const needsTools = !isSimpleMessage || hasActionIntent || runtimePlan || runtimeTaskId
        const functionsToSend = needsTools ? agentFunctions : []

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
              functions: functionsToSend.length ? functionsToSend : undefined,
              maxTokens: 4000,
              onDelta: (d) => {
                liveText = d.content || liveText
                // في طلبات القراءة التي تتطلب دليلاً، لا نبث نص النموذج قبل
                // اعتماد نتيجة أداة ناجحة؛ وإلا قد يرى المستخدم أرقاماً هلوسية
                // أثناء البث ثم تُرفض لاحقاً. الرد النهائي سيُبث دفعة واحدة
                // بعد اجتياز بوابة الإثبات.
                 if (emitEvents && !readIntentRequiresEvidence && liveText && (!d.toolCalls || !d.toolCalls.length)) {
                  emitForSession(sessionId, { type: 'stream', content: sanitizeAssistantText(liveText) })
                }
              },
            },
            (attempt, delayMs) => {
              emitForSession(sessionId, {
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
            if (emitEvents) emitForSession(sessionId, { type: 'text', content: 'تم إيقاف الطلب.' })
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
          if (emitEvents) emitForSession(sessionId, { type: 'error', message: finalMsg })
          return
        }

        if (isCancelled(sessionId)) return

        let deferredNonParallelCalls = 0
        if (result.toolCalls.length) {
          const profile = resolveModelProfile(providerProxy(conn), conn.model)
          if (!profile.supports.parallelTools && result.toolCalls.length > 1) {
            deferredNonParallelCalls = result.toolCalls.length - 1
            result.toolCalls = result.toolCalls.slice(0, 1)
            const detail = `الموديل الحالي لا يثبت تنفيذ الأدوات بالتوازي؛ سأتابع ${deferredNonParallelCalls} نداءً مؤجلاً في جولات متتابعة بعد التحقق من نتيجة النداء الحالي.`
            await persistAssistantText(sessionId, detail, 'progress').catch(() => {})
            if (emitEvents) emitForSession(sessionId, { type: 'progress', text: detail })
          }
          // احفظ فقط النداءات التي ستنفذ في هذه الجولة؛ لا نسجل النداءات المؤجلة
          // داخل assistant واحدة لأن ذلك يخالف عقد الموديلات ذات التنفيذ التسلسلي.
          const persistedCalls = result.toolCalls.map((call) => ({
            ...call,
            extra: { ...(call.extra ?? {}), __assistantPersisted: true },
          }))
          await persistAssistantToolCalls(sessionId, persistedCalls)
          result.toolCalls = persistedCalls
        }

                  if (result.content && result.toolCalls.length) {
            // في طلبات القراءة لا نعرض محتوى مصاحباً إذا كان قد يحتوي أرقاماً
            // قبل الملاحظة؛ نحتفظ به داخلياً فقط، وتبقى بطاقة المرحلة هي الإشارة
            // المرئية حتى تصل نتيجة الأداة المنظمة.
            const tail = String(result.content).trim()
            if (tail && !readIntentRequiresEvidence) {
              await persistAssistantText(sessionId, tail, 'progress')
              if (emitEvents) emitForSession(sessionId, { type: 'progress', text: tail })
            }
            thread.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls.map((call) => toWireToolCall(call, { includeProviderMetadata: resolveModelProfile(providerProxy(conn), conn.model).wireFamily === 'gemini-openai' })) })

        } else if (result.toolCalls.length) {
          thread.push({ role: 'assistant', content: null, tool_calls: result.toolCalls.map((call) => toWireToolCall(call, { includeProviderMetadata: resolveModelProfile(providerProxy(conn), conn.model).wireFamily === 'gemini-openai' })) })
        }

        if (result.toolCalls.length) {
          const profile = resolveModelProfile(providerProxy(conn), conn.model)
          const turnIssues = validateToolCallBatch(result.toolCalls, agentFunctions, profile.supports.parallelTools)
          if (turnIssues.length) {
            const issueText = turnIssues.map((issue) => issue.message).join(' ')
            const isParallelIssueOnly = turnIssues.length === 1 && turnIssues[0]?.code === 'parallel_not_allowed'
            if (isParallelIssueOnly) {
              if (emitEvents) publishRuntimeEvent(sessionId, { type: 'observation', title: 'مؤشر ثقة: توازٍ غير مؤكد', detail: `${issueText} — سأعالج النداءات بالتسلسل مع ثقة متوسطة.`, status: 'success' })
              await addBrainOp(sessionId, 'confidence', `مؤشر ثقة متوسطة (55%): ${issueText} — أتابع التنفيذ بالتسلسل.`).catch(() => {})
            } else {
              let softFixable = 0
              for (const c of result.toolCalls) if (!validateToolCallAgainstDefinitions(c, agentFunctions).length) softFixable++
              const conf = softFixable === result.toolCalls.length ? 65 : softFixable > 0 ? 35 : 15
              await addBrainOp(sessionId, 'confidence', `مؤشر ثقة ${conf}%: ${issueText} — أتابع محاولة التنفيذ مع تصحيح الأسماء تلقائياً، لا أتوقف.`).catch(() => {})
              if (emitEvents) publishRuntimeEvent(sessionId, { type: 'observation', title: `مؤشر ثقة ${conf}%`, detail: issueText, status: conf >= 50 ? 'success' : 'error' })
            }
          }
        }

        if (!result.toolCalls.length) {
          const finalText = result.content ? String(result.content).trim() : ''
          if (readIntentRequiresEvidence && finalText && !runtimeSuccessfulEvidenceCount) {
            noEvidenceRecoveryAttempts++
            const conf = Math.max(10, 60 - noEvidenceRecoveryAttempts * 15)
            await addBrainOp(sessionId, 'confidence', `مؤشر ثقة ${conf}%: إجابة عن بيانات محلية بلا دليل موثَّق بعد (المحاولة ${noEvidenceRecoveryAttempts}). أذكر المستخدم بمستوى الثقة ولا أتوقف.`).catch(() => {})
            if (emitEvents) publishRuntimeEvent(sessionId, { type: 'observation', title: `مؤشر ثقة ${conf}% — بلا دليل محلي`, detail: 'أجيب لكن أذكر أن هذه الإجابة بلا تحقق من قاعدة البيانات؛ يُفضَّل التحقق بأداة قراءة.', status: 'success' })
          }
          // الوكيل الحر: أي إجابة نهائية تُعتمد مباشرة دون بوابة إثبات قسرية.
          // نثق بالنموذج ونتائج أدواته الفعلية، وندعه يجيب مباشرة على الأسئلة
          // العامة والمحادثة دون إجباره على أداة أو فرض "دليل" قبل الكلام.
          if (finalText) {
            const safeFinal = sanitizeAssistantText(finalText)
            await persistAssistantText(sessionId, safeFinal, 'text')
            if (emitEvents) {
              emitForSession(sessionId, { type: 'stream', content: safeFinal })
              emitForSession(sessionId, { type: 'stream', content: '', done: true })
              emitForSession(sessionId, { type: 'text', content: safeFinal })
            }
          } else {
            const soft = 'أنجزت ما أمكنني في هذه الجولة. أخبرني إن أردت تفصيلاً أو خطوة تالية محددة.'
            await persistAssistantText(sessionId, soft, 'system').catch(() => {})
            if (emitEvents) emitForSession(sessionId, { type: 'text', content: soft })
          }
          if (runtimeTaskId) {
            await transitionTaskRun(runtimeTaskId, 'completed', {
              plan: runtimePlan ?? undefined,
              currentStepId: runtimePlan?.currentStepId,
              evidence: [{ type: 'assistant_response', summary: finalText.slice(0, 500) || 'اكتملت المهمة.' }],
            }).catch(() => {})
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
            if (emitEvents) emitForSession(sessionId, { type: 'text', content: limitMsg })
            return
          }
          const nextCount = (callCounts.get(sig) ?? 0) + 1
          callCounts.set(sig, nextCount)

          const callArgs0 = parseToolArgs(call.arguments)
          const innerTool = call.name === 'execute' ? String(callArgs0.tool ?? 'execute') : call.name

          // execute هو envelope؛ يجب التحقق من الأداة الداخلية بنفس تعريفها قبل
          // التنفيذ، وإلا يستطيع الموديل تجاوز required/types عبر wrapper صالح شكلياً.
          if (call.name === 'execute') {
            const outer = parseToolArgumentsStrict(call.arguments)
            const innerArgs = outer.ok && outer.value.args && typeof outer.value.args === 'object' && !Array.isArray(outer.value.args) ? outer.value.args : null
            const innerCall: ToolCall = { id: call.id, name: innerTool, arguments: innerArgs ? JSON.stringify(innerArgs) : '' }
            const innerIssues = validateToolCallAgainstDefinitions(innerCall, agentFunctions)
            if (!outer.ok || !innerArgs || innerIssues.length) {
              const detail = !outer.ok ? outer.message : !innerArgs ? 'execute يحتاج args ككائن JSON.' : innerIssues.map((issue) => issue.message).join(' ')
              const observation = `[فشل التحقق قبل التنفيذ] ${detail}`
              await persistToolResult(sessionId, call, { ok: false, error: 'inner_tool_validation', detail }, { name: innerTool, args: innerArgs ?? {}, ok: false, observation }).catch(() => {})
              thread.push({ role: 'tool', tool_call_id: call.id, name: innerTool, content: observation, tool_error: true })
              if (emitEvents) publishRuntimeEvent(sessionId, { type: 'observation', title: 'حُجبت الأداة الداخلية قبل التنفيذ', detail, status: 'error' })
              continue
            }
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
          if (repeatedSameResult && emitEvents) emitForSession(sessionId, { type: 'thinking' })
          if (repeatedSameResult && nextCount > MAX_REPEATED_TOOL_CALLS) {
            const stopMsg = `أوقفت تكرار «${innerTool}» بعد ${MAX_REPEATED_TOOL_CALLS} محاولات متطابقة بلا تقدم. سأحافظ على البيانات كما هي.`
            await persistAssistantText(sessionId, stopMsg, 'system').catch(() => {})
            if (emitEvents) emitForSession(sessionId, { type: 'text', content: stopMsg })
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
          const activePlanStep = runtimeTaskId && runtimePlan?.currentStepId
            ? await findDurableTaskStep(runtimeTaskId, runtimePlan.currentStepId).catch(() => null)
            : null
          const operationId = call.id
          const idempotencyKey = `${runtimeTaskId ?? sessionId}:${call.id}`
          if (runtimeTaskId) {
            await recordDurableOperation({
              operationId,
              taskId: runtimeTaskId,
              stepId: activePlanStep?.id,
              idempotencyKey,
              toolName: innerTool,
              argsHash: hashOf(call.arguments),
              status: 'started',
            }).catch(() => {})
            if (activePlanStep) {
              await updateDurableTaskStep(activePlanStep.id, {
                status: 'running',
                toolCallId: call.id,
                attempt: activePlanStep.attempt + 1,
              }).catch(() => {})
            }
          }
          let cont = true
          try {
            cont = await handleToolCall(sessionId, s, call, emitEvents)
          } catch (error: any) {
            const detail = error?.message ?? String(error)
            const observation = `[فشل/غير مؤكد] تعذر إغلاق دورة تنفيذ «${innerTool}»: ${detail}. قد تكون العملية لم تُنفذ أو نُفذت قبل الخطأ؛ لا تعِدها تلقائياً، استخدم أداة تحقق أولاً.`
            await persistToolResult(sessionId, call, { ok: false, error: 'tool_execution_exception', detail }, { name: innerTool, args: callArgs0, result: 'tool_execution_exception', observation, ok: false }).catch(() => {})
            thread.push({ role: 'tool', tool_call_id: call.id, name: innerTool, content: observation, tool_error: true })
            if (emitEvents) {
              publishRuntimeEvent(sessionId, { type: 'observation', title: 'استثناء أثناء دورة الأداة', detail: observation, status: 'error' })
              publishRuntimeEvent(sessionId, { type: 'recovery', title: 'أوقفْت إعادة التنفيذ التلقائي', detail: 'يجب التحقق من الحالة الحالية قبل أي محاولة جديدة لتجنب أثر مكرر.', strategy: 'retry' })
            }
            cont = true
            if (runtimeTaskId) {
              await updateDurableOperation(operationId, { status: 'failed', errorCode: 'tool_execution_exception', errorMessage: detail }).catch(() => {})
              if (activePlanStep) {
                await updateDurableTaskStep(activePlanStep.id, {
                  status: 'failed',
                  verificationStatus: 'failed',
                  lastError: detail,
                  resultRef: `operation:${operationId}`,
                }).catch(() => {})
              }
            }
          }
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
              if (runtimeTaskId) {
                const operationIsVerification = isVerificationToolName(innerTool, runtimeSkill)
                const operationVerified = lastObs.meta.verified === true
                const operationHasPostconditionEvidence = operationIsVerification || operationVerified
                await updateDurableOperation(operationId, {
                  status: evidenceOk ? (operationHasPostconditionEvidence ? 'verified' : 'succeeded') : 'failed',
                  resultRef: `tool:${call.id}`,
                  affected: lastObs.meta.result,
                  errorCode: evidenceOk ? undefined : String(lastObs.meta.error ?? 'tool_failed'),
                  errorMessage: evidenceOk ? undefined : obsText,
                }).catch(() => {})
                await appendTaskEvidence(runtimeTaskId, { tool: innerTool, ok: evidenceOk, summary: String(lastObs.meta.observation ?? lastObs.meta.result ?? '').slice(0, 600) })
                if (activePlanStep) {
                  await updateDurableTaskStep(activePlanStep.id, {
                    status: evidenceOk && operationHasPostconditionEvidence ? 'verified' : evidenceOk ? 'running' : 'failed',
                    verificationStatus: evidenceOk && operationHasPostconditionEvidence ? 'verified' : evidenceOk ? 'pending' : 'failed',
                    resultRef: `tool:${call.id}`,
                    lastError: evidenceOk ? undefined : obsText,
                  }).catch(() => {})
                }
                if (evidenceOk && operationHasPostconditionEvidence) {
                  const planStepId = activePlanStep?.operation && typeof activePlanStep.operation === 'object'
                    ? String((activePlanStep.operation as Record<string, unknown>).planStepId ?? '')
                    : ''
                  if (planStepId && runtimePlan) {
                    runtimePlan = completePlanStep(runtimePlan, planStepId, obsText.slice(0, 500))
                    runtimePlan = advanceNonEvidencePlan(runtimePlan)
                    await transitionTaskRun(runtimeTaskId, 'running', { plan: runtimePlan, currentStepId: runtimePlan.currentStepId })
                  }
                  await markLatestPendingWriteVerified(runtimeTaskId, `verified-by:${call.id}`).catch(() => null)
                }
                const operationSummary = await getDurableOperationSummary(runtimeTaskId).catch(() => null)
                if (operationSummary?.pendingWrites && operationHasPostconditionEvidence) {
                  await markLatestPendingWriteVerified(runtimeTaskId, `verified-by:${call.id}`).catch(() => null)
                }
              }
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
        if (emitEvents) emitForSession(sessionId, { type: 'text', content: 'أنجزت ما أمكن تنفيذه ضمن هذه الجولة. أرسل رسالة للمتابعة.' })
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
  attachments?: { uri: string; name?: string; mime?: string; size?: number; kind?: InputAssetKind }[]
  audio?: { uri: string; format?: 'm4a' | 'wav' | 'mp3' | 'webm'; name?: string; mime?: string; size?: number }
}

async function withConfig<T>(fn: (conn: ConnConfig) => Promise<T>): Promise<T> {
  const config = await resolveConfig()
  if (!config.model || !config.apiKey) {
    throw new Error('لم يُعدَّ المزود بعد: أضف مفتاح API واختر موديلاً من إعدادات المساعد.')
  }
  return fn(config)
}

async function runGuarded(sessionId: string, conn: ConnConfig, emitEvents = true, initialContent?: ChatMessage['content']): Promise<AgentOutcome> {
  const startedAt = Date.now()
  markRunning(sessionId)
  try {
    await runLoop(sessionId, conn.settings, conn, emitEvents, initialContent)
    const task = await getLatestTaskRun(sessionId).catch(() => null)
    if (task && task.updatedAt >= startedAt - 1000) return deriveAgentOutcome(task.status)
    const recent = await getMessages(sessionId).catch(() => [])
    const latestAssistant = [...recent].reverse().find((message) => message.role === 'assistant' && message.createdAt >= startedAt - 1000)
    return deriveAgentOutcome(undefined, latestAssistant?.kind)
  } catch {
    return 'failed'
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
    emitForSession(sessionId, { type: 'error', message: e?.message ?? 'إعداد ناقص' })
    return
  }

  let content = text.trim()
  let initialContent: ChatMessage['content'] | undefined
  const assets: Awaited<ReturnType<typeof saveAsset>>[] = []
  const assetErrors: string[] = []

  if (opts?.audio) {
    try {
      assets.push(await saveAsset(sessionId, {
        uri: opts.audio.uri,
        name: opts.audio.name ?? `voice-${Date.now()}.${opts.audio.format ?? 'm4a'}`,
        mime: opts.audio.mime,
        size: opts.audio.size,
        kind: 'audio',
        source: 'microphone',
      }))
    } catch (error: any) {
      assetErrors.push(error?.message ?? 'تعذر حفظ التسجيل الصوتي محلياً.')
    }
  }

  for (const att of opts?.attachments ?? []) {
    try {
      assets.push(await saveAsset(sessionId, {
        uri: att.uri,
        name: att.name,
        mime: att.mime,
        size: att.size,
        kind: att.kind,
        source: 'document_picker',
      }))
    } catch (error: any) {
      assetErrors.push(error?.message ?? `تعذر حفظ المرفق «${att.name ?? 'ملف'}».`)
    }
  }

  const turn = createUserTurn(sessionId, text, assets)
  const assetText = assets.map((asset) => {
    const summary = summarizeAssetForModel(asset)
    return `\n\n[أصل محلي موجود في المحادثة: ${JSON.stringify(summary)} — لا تحلله ولا تفحصه ولا تربطه بعقار/عرض إلا بطلب واضح وصريح من المستخدم. بدون طلب واضح أبقِه في المحادثة دون أي عمل عليه، وانتظر توجيه المستخدم.]`
  }).join('')
  content = `${content}${assetText}`.trim()
  if (!content && assets.length) content = `أرسل المستخدم ${assets.length} مرفقاً في هذه المحادثة (لم يحدد طلباً واضحاً عليها). اسأله ماذا يريد أن تفعل بها دون تحليل أو ربط مسبق.`
  if (assetErrors.length) content += `\n\n[فشل حفظ بعض الأصول: ${assetErrors.join(' | ')}]`

  await recordDurableUserTurn({
    id: turn.id,
    sessionId,
    text: turn.text,
    assetIds: assets.map((asset) => asset.id),
    state: assetErrors.length ? 'failed' : 'ready',
  })

  const audioAsset = assets.find((asset) => asset.kind === 'audio')
  if (opts?.audio && audioAsset) {
    const voiceLabel = audioAsset?.name ?? opts.audio.name ?? 'تسجيل صوتي'
    try {
      const audio = await readAudioInput(opts.audio.uri, opts.audio.format ?? 'm4a')
      const profile = resolveModelProfile(providerProxy(conn), conn.model)
      // المسار الموثّق الأبسط: نرسل الصوت مباشرة فقط للصيغ التي يثبت المزود
      // قبولها في chat (wav/mp3 عند جيميني ومسترال)، وإلا (m4a وهو افتراضي
      // تسجيل الجهاز) نحوّله نصاً عبر نقطة التفريغ الموثّقة ثم نكمل نصياً.
      const CHAT_AUDIO_FORMATS: Record<string, string[]> = {
        gemini: ['wav', 'mp3'],
        mistral: ['wav', 'mp3'],
        openai: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
      }
      const acceptedChatAudio = CHAT_AUDIO_FORMATS[conn.providerId]
      const directAudio =
        profile.supports.inputAudio && (acceptedChatAudio ? acceptedChatAudio.includes(audio.format) : true)
      if (directAudio) {
        const spoken = text.trim() || 'أرسل المستخدم تسجيلاً صوتياً. استمع إليه وفهم المطلوب واستجب له.'
        content = `${content ? content + '\n\n' : ''}[رسالة صوتية مباشرة] ${spoken}`.trim()
        initialContent = [
          { type: 'text', text: content },
          { type: 'input_audio', input_audio: { data: audio.base64, format: audio.format } },
        ]
      } else {
        // الموديل/الصيغة لا يدعم chat مباشرة : نحوّل إلى نص ثم نكمل بالمسار النصي الثابت.
        let voiceText = text.trim()
        try {
          // نحوّل الصوت إلى نص عبر نقطة التفريغ الموثّقة (تتعامل مع m4a بنجاح).
          const transcript = await transcribeAudio({
            providerId: conn.providerId,
            baseUrl: conn.baseUrl,
            apiKey: conn.apiKey,
            model: conn.model,
            audioUri: opts.audio.uri,
            audioBase64: audio.base64,
            format: audio.format,
          })
          voiceText = transcript || voiceText
        } catch (err: any) {
          const note =
            err instanceof TranscribeError && err.supported
              ? ' (تعذّر فهم التسجيل الصوتي تلقائياً هذه المرة)'
              : ' (المزوّد الحالي لا يدعم فهم الصوت تلقائياً)'
          voiceText = (voiceText ? voiceText + ' ' : '') + note
        }
        const spoken = voiceText.trim() || 'أرسل المستخدم تسجيلاً صوتياً. استمع إليه وفهم المطلوب ثم تعامل معه.'
        content = `${content ? content + '\n\n' : ''}[رسالة صوتية محوّلة إلى نص] ${spoken}`.trim()
        initialContent = content
      }
    } catch (error: any) {
      const message = error?.message ?? 'تعذر تجهيز التسجيل الصوتي محلياً.'
      await persistUser(sessionId, content || `رسالة صوتية: ${voiceLabel}`)
      await persistAssistantText(sessionId, message, 'error')
      emitForSession(sessionId, { type: 'error', message })
      return
    }
  }

  await updateSessionMeta(sessionId, { providerLabel: conn.providerName, model: conn.model })
  const first = await getMessages(sessionId).catch(() => [])
  if (!first.length) {
    const title = text.replace(/\s+/g, ' ').slice(0, 40) || (assets[0]?.name ?? 'محادثة جديدة')
    await updateSessionMeta(sessionId, { title })
  }

  if (!hasPayload(turn) && !assetErrors.length) return
  const userImages = assets.filter((a) => a.kind === 'image' && a.localUri).map((a) => a.localUri)
  // الحمولة النهائية المحوّلة إلى نص (صور تُعرض في الشاشة عبر meta.images، وصوت
  // يُنسخ نصاً) تمر عبر عقد initialContent لتُستبدل بها آخر رسالة مستخدم نظيفة.
  if (initialContent === undefined) initialContent = content
  await persistUser(sessionId, content, userImages.length ? { images: userImages } : undefined)
  // لا رسائل تقدم ثابتة — المساعد نفسه يخاطب المستخدم بما يقرره هو.
  const outcome = await runGuarded(sessionId, conn, true, initialContent)
  emitForSession(sessionId, { type: 'done', outcome })
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
    emitForSession(sessionId, { type: 'error', message: e?.message ?? 'إعداد ناقص' })
    return
  }
  await clearPending(sessionId)
  await persistUser(sessionId, `[إجابة المستخدم على سؤالك] ${answer}`)
  const outcome = await runGuarded(sessionId, conn)
  emitForSession(sessionId, { type: 'done', outcome })
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
    emitForSession(sessionId, { type: 'error', message: e?.message ?? 'إعداد ناقص' })
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
          emitForSession(sessionId, { type: 'tool', name: it.tool, args: { ...(it.entity ? { entity: it.entity } : {}), id: it.id }, result: outcome })
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
  const outcome = await runGuarded(sessionId, conn)
  emitForSession(sessionId, { type: 'done', outcome })
}

export { createSession as newSession, listUndo }
export type { PendingState } from './store'
export type { AgentEvent }
export { subscribeAgent, cancelAgent, isAgentBusy, performUndo }
