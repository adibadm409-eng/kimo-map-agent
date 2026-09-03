import { TOOLS, queryEntityById, agentDelete, ENTITY_LABELS } from '../agent'
import {
  getRow as getWsRow,
  getTable as getWsTable,
  getWorkspace as getWsWorkspace,
  deleteWorkspace as deleteWsWorkspace,
  deleteTable as deleteWsTable,
  deleteRow as deleteWsRow,
  addProjectMemory,
  projectMemorySummary,
  registerGeneratedFile,
  listGeneratedFiles,
  reviewGeneratedFile,
} from '../database/workspace'
import { withAuditCtx } from '../database/audit'
import type { AgentSettings, PendingState, UndoEntry, PendingDeleteItem } from './store'
import { getPending, setPending, peekUndo, removeUndo, pushUndo, searchSessions as storeSearch } from './store'
import { adaptToolArgs, runToolWithFeedback } from './toolSchemas'
import { persistPair, persistAssistantText } from './persist'
import { captureBefore, captureToolUndoBefore, recordUndo, performUndo } from './undo'
import { emitForSession } from './agentRun'
import { DELETE_CONFIRM_TOOLS } from './prompts'
import type { ToolCall } from './llm'
import { parseToolArgumentsStrict } from './toolValidation'
import { generateExcelFile, generateWordFile, generatePdfFile, buildHtml, type ExcelFileSpec, type WordFileSpec } from './files'
import { runSubAgents, reviewSubAgentResults, undoLastSubAgent, type SubAgentTask } from './orchestrator'

export type OpenLink = { kind: 'workspace' | 'project' | 'block' | 'plot' | 'client' | 'property'; id: string; label?: string }

/**
 * بطاقة "افتح" تُثبَّت في المحادثة بعد نجاح أي إنشاء/استيراد/نسخ:
 * تسمح للمستخدم بلمسة واحدة بالانتقال إلى مكان البيانات الجديدة (مشروع/مساحة عمل/قطعة...)
 * ليرى أثر الوكيل ويديرها بنفسه — لا بيانات في أماكن مجهولة.
 */
export async function persistOpenLink(sessionId: string, link: OpenLink): Promise<void> {
  try {
    await persistAssistantText(sessionId, '', 'link', link as any)
    emitForSession(sessionId, { type: 'link', ...link })
  } catch {}
}

/** استنتاج بطاقة الفتح من أداة كتابة ناجحة: أين وُضعت البيانات الجديدة. */
export function openLinkFor(tool: string, args: Record<string, any>, result: any): OpenLink | null {
  if (!result || typeof result !== 'object' || result.duplicate) return null
  const id = typeof result.id === 'string' && result.id ? result.id : ''
  const data = (args?.data && typeof args.data === 'object' ? args.data : {}) as Record<string, any>
  const label =
    (typeof args?.name === 'string' && args.name.trim() ? args.name.trim() : '') ||
    (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : '') ||
    undefined

  switch (tool) {
    case 'workspace_create':
      return id ? { kind: 'workspace', id, label: label || undefined } : null
    case 'workspace_add_table':
    case 'workspace_create_full_table': {
      const wsId = String(args?.workspace_id ?? '')
      return wsId ? { kind: 'workspace', id: wsId } : null
    }
    case 'workspace_duplicate_workspace': {
      const rid = id || String(result.workspace_id ?? '')
      return rid ? { kind: 'workspace', id: rid } : null
    }
    case 'import_project_file': {
      const wsId = String(result.workspaceId ?? '')
      return wsId ? { kind: 'workspace', id: wsId, label: String(result.workspaceName ?? '') || undefined } : null
    }
    case 'create': {
      const entity = String(args?.entity ?? '')
      if (entity === 'projects') return id ? { kind: 'project', id, label } : null
      if (entity === 'blocks') {
        const projectId = String(data.project_id ?? '')
        // عند إضافة بلوك داخل مشروع: تفتح البطاقة المشروعَ كاملاً ليرى المستخدم كل بلوكاته
        // وقطعها وعدّاداتها، لا شاشة البلوك الواحد فقط.
        if (projectId) return { kind: 'project', id: projectId }
        return id ? { kind: 'block', id } : null
      }
      if (entity === 'plots') {
        if (Array.isArray(result.plot_ids) && result.plot_ids.length > 1 && String(data.block_id ?? '')) {
          return { kind: 'block', id: String(data.block_id) }
        }
        return id ? { kind: 'plot', id } : null
      }
      if (entity === 'clients') return id ? { kind: 'client', id, label } : null
      if (entity === 'properties') return id ? { kind: 'property', id, label } : null
      return null
    }
    default:
      return null
  }
}

/**
 * منفّذ موحّد لأدوات السجل: حارس وضع القراءة وحذف الحذف، ثم طبقة التكيُّف
 * (adaptToolArgs) والتنفيذ مع حالة صريحة [نجاح]/[فشل] وتحقق من وجود البيانات
 * فعلاً في قاعدة البيانات قبل إعلان النجاح للمستخدم.
 */
export async function runRegistryTool(
  sessionId: string,
  s: AgentSettings,
  call: ToolCall,
  tool: string,
  rawArgs: Record<string, any>,
  emitEvents: boolean
): Promise<boolean> {
  const args = adaptToolArgs(tool, rawArgs ?? {})
  // يدعم مزودي النماذج الذين يغلّفون الأدوات العامة داخل execute؛ لا تمرّر
  // request_confirmation إلى سجل CRUD حتى لا يظهر كأداة غير معروفة.
  if (tool === 'request_confirmation') {
    return await handleRequestConfirmation(sessionId, args, emitEvents, call)
  }
  const mutationOperation = tool === 'mutate_record' ? String(args.operation ?? '').toLowerCase() : ''
  const mutationInnerTool = mutationOperation === 'create' || mutationOperation === 'update' || mutationOperation === 'delete' ? mutationOperation : ''
  const mutationInnerArgs = tool === 'mutate_record'
    ? { entity: args.entity, id: args.id, data: args.data }
    : args
  if (tool === 'mutate_record' && !mutationInnerTool) {
    const obs = '[فشل] بوابة البيانات الموحدة تحتاج operation يساوي create أو update أو delete.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'invalid_mutation_operation', ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'invalid_mutation_operation' })
    return true
  }
  if (tool === 'mutate_record' && mutationInnerTool !== 'delete' && mutationInnerTool === 'create' && !args.data) {
    const obs = '[فشل] operation=create تحتاج data تحتوي حقول السجل.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'missing_mutation_data', ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'missing_mutation_data' })
    return true
  }
  if (tool === 'mutate_record' && mutationInnerTool !== 'create' && !args.id) {
    const obs = `[فشل] operation=${mutationInnerTool} تحتاج id صالحاً للسجل.`
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'missing_mutation_id', ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'missing_mutation_id' })
    return true
  }

  if (tool === 'update' && String(args.entity ?? '') === 'plots' && args.data && (Object.prototype.hasOwnProperty.call(args.data, 'paid_amount') || Object.prototype.hasOwnProperty.call(args.data, 'remaining_amount'))) {
    const obs = '[فشل] لا تعدل paid_amount أو remaining_amount مباشرة؛ استخدم مسار دفتر النقد لتسجيل دفعة أو عكسها حتى تبقى الأرقام قابلة للمراجعة.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'financial_columns_protected', ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'financial_columns_protected' })
    return true
  }
  if (tool === 'create' && String(args.entity ?? '') === 'plot_payments') {
    const obs = '[فشل] تسجيل الأقساط لا يتم عبر إنشاء سجل خام؛ استخدم دفتر النقد الموحّد مع المشروع والأصل والتاريخ والمبلغ.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'ledger_required', ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'ledger_required' })
    return true
  }
  if (tool === 'project_import_commit') {
    if (!Array.isArray(args.rows) || args.rows.length === 0) {
      const obs = '[فشل] اعتماد المشروع يتطلب صفوفاً بعد المعاينة؛ لا أستطيع إنشاء مشروع فارغ من هذا المسار.'
      await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'rows_required', ok: false })
      if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'rows_required' })
      return true
    }
    if (args.rows.length > 10000) {
      const obs = '[فشل] الدفعة أكبر من الحد المحلي 10000 صف؛ قسّمها إلى دفعات بعد التأكد من مفاتيح التكرار.'
      await persistPair(sessionId, call, obs, undefined, { name: tool, args: { ...args, rows: `[${args.rows.length} صف]` }, result: 'batch_too_large', ok: false })
      if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'batch_too_large' })
      return true
    }
  }
  if (tool === 'ledger_record_payment' && (!(Number(args.amount) > 0) || !args.project_id || (!args.node_id && !args.plot_id) || (args.node_id && args.plot_id))) {
    const obs = '[فشل] الدفعة تحتاج مشروعاً وأصلاً واحداً ومبلغاً موجباً وتاريخاً واضحاً؛ اختر node_id أو plot_id وليس الاثنين.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'payment_contract_invalid', ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: 'payment_contract_invalid' })
    return true
  }

  if ((tool === 'ledger_reverse_payment' || tool === 'unlink_entity_media') && !args.__confirmed) {
    const label = tool === 'ledger_reverse_payment' ? `عكس الدفعة ${String(args.payment_id ?? '')}` : `فك ربط الوسيط ${String(args.link_id ?? '')}`
    const current = await getPending(sessionId).catch(() => null)
    const items = current?.kind === 'confirmation' && Array.isArray(current.items) ? [...current.items] : []
    const item = { tool, id: String(args.payment_id ?? args.link_id ?? ''), entity: tool, preview: label, args: { ...args } }
    if (!items.some((it: PendingDeleteItem) => it.tool === item.tool && it.id === item.id)) items.push(item)
    await setPending({ sessionId, kind: 'confirmation', question: `تأكيد ${label}. اختر ثم وافق للتنفيذ.`, title: 'تأكيد عملية حساسة', items, action: { type: 'delete', tool, id: item.id, args: { ...args, __confirmed: true } as any } })
    const pendingObservation = `[معلّق] لم تُنفَّذ ${label} بعد؛ أنتظر موافقة المستخدم الصريحة.`
    await persistPair(sessionId, call, pendingObservation, undefined, { name: tool, args, result: 'awaiting_confirmation', observation: pendingObservation, ok: false })
    if (emitEvents) emitForSession(sessionId, { type: 'confirmation', title: 'تأكيد عملية حساسة', message: label, items })
    return false
  }
  if (DELETE_CONFIRM_TOOLS.has(tool) && (tool !== 'mutate_record' || mutationInnerTool === 'delete') && tool !== 'ledger_reverse_payment' && tool !== 'unlink_entity_media' && tool !== 'bulk_mutate') {
    const delId = String(args.id ?? args.row_id ?? args.table_id ?? args.workspace_id ?? '')
    if (!delId) {
      const msg = 'خطأ: العملية تتطلب معرّف عنصر صالحاً للحذف'
      await persistPair(sessionId, call, msg, undefined, { name: tool, args })
      if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: msg })
      return true
    }
    // معاينة بشرية للمحتوى المراد حذفه (بلا معرفات ولا رموز تقنية)
    const preview = await deletePreview(tool, { ...args, id: delId })
    const entityLabel =
              tool === 'delete' || tool === 'mutate_record'
          ? (ENTITY_LABELS as Record<string, string>)[String(args.entity ?? '')] ?? String(args.entity ?? '')
          : tool === 'workspace_delete'

          ? 'مساحة عمل'
          : tool === 'workspace_delete_table'
            ? 'جدول'
            : 'صف'
    const item = { tool, id: delId, entity: String(args.entity ?? ''), preview: `${entityLabel}: ${preview}`.replace(/:+\s*$/, ''), args: { ...args } }
    // تراكم في قائمة واحدة (تحديد متعدد) بدل الموافقة المكررة
    const current = await getPending(sessionId).catch(() => null)
    const items = current?.kind === 'confirmation' && Array.isArray(current.items) ? [...current.items] : []
    if (!items.some((it: PendingDeleteItem) => it.tool === item.tool && it.id === item.id)) items.push(item)
    const title = 'تأكيد الحذف'
    const message = `سيتم حذف ${items.length} عنصر${items.length > 1 ? 'ات' : ''}. اختر ما تريد حذفه ثم وافق.`
    await setPending({
      sessionId,
      kind: 'confirmation',
      question: message,
      title,
      details: items.length > 1 ? 'يمكنك تحديد العناصر المراد حذفها بالضغط عليها ثم الموافقة مرة واحدة.' : undefined,
      items,
      action: { type: 'delete', tool, id: delId, args: args as any },
    })
    await persistAssistantText(sessionId, `${message} ${items.map((it) => it.preview).join('؛ ')}`, 'confirmation', { title, message })
    const pendingObservation = `[معلّق] لم يُنفّذ حذف ${entityLabel} بعد. أعددت معاينة للمستخدم وأنتظر موافقته الصريحة؛ لا تعلن نجاح الحذف ولا تتابع بأداة أخرى قبل القرار.`
    await persistPair(sessionId, call, pendingObservation, undefined, {
      name: tool,
      args,
      result: 'awaiting_confirmation',
      observation: pendingObservation,
      ok: false,
    })
    if (emitEvents) emitForSession(sessionId, { type: 'confirmation', title, message, items })
    // توقف دورة ReAct فعلياً حتى تصبح الموافقة متاحة في الواجهة. إبقاء true
    // كان يسمح للموديل بمتابعة السرد والاستعلام ثم إعلان حذف غير منفّذ.
    return false
  }

  const effectiveTool = tool === 'mutate_record' ? mutationInnerTool : tool
  const effectiveArgs = tool === 'mutate_record' ? mutationInnerArgs : args
  const undoBefore = await captureToolUndoBefore(effectiveTool, effectiveArgs)
  // لا ينبغي للمستخدم أو النموذج كتابة معرف جلسة تقني في طلب تدقيقي طبيعي.
  // نضيفه داخلياً فقط عندما تكون النية هي مراجعة هذه الجلسة ولم يحدد المستخدم نطاقاً آخر.
  const executionArgs = tool === 'audit_log_query' && args.current_session === true && !args.session_id
    ? { ...args, session_id: sessionId }
    : args
  const { ok, observation, result, verified, verification } = await withAuditCtx({ actor: 'agent', sessionId, tool }, () =>
    runToolWithFeedback(tool, executionArgs)
  )
  // الملاحظة التي تعود للموديل: نص عربي واضح الحالة [نجاح]/[فشل] + سطر [تحقق].
  // verified حقل آلي مستقل؛ لا يعتمد verifier على مطابقة النص المعروض للمستخدم.
  await persistPair(sessionId, call, observation, undefined, { name: tool, args, result, observation, ok, verified, verification })
  if (emitEvents) emitForSession(sessionId, { type: 'tool', name: tool, args, result: ok ? result : result })

  if (ok) {
    await recordUndo(sessionId, effectiveTool, effectiveArgs, result, undoBefore)
    // أثر مرئي: بطاقة "افتح" بعد إنشاء/استيراد/نسخ — تعيد المستخدم إلى مكان البيانات الجديدة
    const link = openLinkFor(effectiveTool, effectiveArgs, result)
    if (link) await persistOpenLink(sessionId, link)
  }
  return true
}

// ---------- توليد الملفات ----------

/** توليد ملف فعلي (excel/word/pdf) داخل التطبيق — لا يعتمد على أي محول خارجي ولا يعدّل البيانات. */
export async function runGenerateFile(format: string, filename: string, spec: any): Promise<{ ok: boolean; name: string; uri: string; error?: string }> {
  try {
    if (format === 'excel') {
      const file = await generateExcelFile((spec ?? {}) as ExcelFileSpec, filename)
      return { ok: true, ...file }
    }
    if (format === 'word') {
      const file = await generateWordFile((spec ?? {}) as WordFileSpec, filename)
      return { ok: true, ...file }
    }
    if (format === 'pdf') {
      const html = spec?.html ? String(spec.html) : buildHtml(String(spec?.title ?? filename), spec?.columns ?? null, spec?.rows ?? [])
      const file = await generatePdfFile(html, filename)
      return { ok: true, ...file }
    }
    return { ok: false, name: filename, uri: '', error: 'صيغة غير مدعومة — استخدم excel أو word أو pdf' }
  } catch (e: any) {
    return { ok: false, name: filename, uri: '', error: e?.message ?? String(e) }
  }
}

async function handleRequestConfirmation(sessionId: string, args: Record<string, any>, emitEvents: boolean, call?: ToolCall): Promise<boolean> {
  const title = String(args.title ?? 'طلب موافقة')
  const message = String(args.message ?? '')
  const details = typeof args.details === 'string' ? args.details : undefined
  // ربط إجراء الحذف بالموافقة إن أرسله الموديل: يُنفَّذ بعد الموافقة فعلياً.
  let action: { type: 'delete'; tool: string; id: string; args: Record<string, any> } | undefined
  const act = args.action
  if (act && typeof act === 'object' && DELETE_CONFIRM_TOOLS.has(String(act.tool ?? ''))) {
    const id = String(act.id ?? act.row_id ?? act.table_id ?? act.workspace_id ?? act.entity_id ?? '')
    if (id) {
      action = {
        type: 'delete',
        tool: String(act.tool),
        id,
        args: (act.args && typeof act.args === 'object' ? act.args : {}) as Record<string, any>,
      }
    }
  }
  const current = await getPending(sessionId).catch(() => null)
  const keptItems = current?.kind === 'confirmation' && Array.isArray(current.items) ? current.items : undefined
  await setPending({ sessionId, kind: 'confirmation', question: message, title, details, action, items: keptItems })
  const observation = `[طلب موافقة] ${title}\\n${message}`
  await persistAssistantText(sessionId, observation, 'confirmation', { title, message, details })
  if (call) {
    await persistPair(sessionId, call, observation, undefined, {
      name: 'request_confirmation',
      args,
      result: 'awaiting_confirmation',
      observation,
      ok: false,
    })
  }
  if (emitEvents) emitForSession(sessionId, { type: 'confirmation', title, message, details })
  return false
}

export async function handleToolCall(
  sessionId: string,
  s: AgentSettings,
  call: ToolCall,
  emitEvents: boolean
): Promise<boolean> {
  const parsed = parseToolArgumentsStrict(call.arguments)
  const name = call.name
  if (!parsed.ok) {
    const message = `[فشل التحقق قبل التنفيذ] ${parsed.message}`
    await persistPair(sessionId, call, message, undefined, { name, ok: false, result: 'invalid_tool_arguments', observation: message })
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name, args: {}, result: 'invalid_tool_arguments' })
    return true
  }
  const args = parsed.value

  if (name === 'ask_user') {
    const question = String(args.question ?? '')
    const choices = Array.isArray(args.choices) ? args.choices.map(String) : undefined
    const allowFreeText = args.allow_free_text !== false
    await setPending({ sessionId, kind: 'ask_user', question, choices, allowFreeText })
    await persistAssistantText(sessionId, question, 'ask_user', { question, choices, allowFreeText })
    if (emitEvents) emitForSession(sessionId, { type: 'ask_user', question, choices, allowFreeText })
    return false
  }

  if (name === 'request_confirmation') {
    return await handleRequestConfirmation(sessionId, args, emitEvents, call)
  }

  if (name === 'execute') {
    const tool = String(args.tool ?? '')
    if (!tool || !args.args || typeof args.args !== 'object' || Array.isArray(args.args)) {
      const message = '[فشل التحقق قبل التنفيذ] execute يحتاج tool وargs ككائن JSON.'
      await persistPair(sessionId, call, message, undefined, { name, ok: false, result: 'invalid_execute_envelope', observation: message })
      if (emitEvents) emitForSession(sessionId, { type: 'tool', name, args, result: 'invalid_execute_envelope' })
      return true
    }
    return await runRegistryTool(sessionId, s, call, tool, args.args as Record<string, any>, emitEvents)
  }

  // الوكيل يدعو الأدوات مباشرة بأسمائها (query/get/create/...) — مخططات صريحة
  if (TOOLS.some((t) => t.name === name)) {
    return await runRegistryTool(sessionId, s, call, name, args, emitEvents)
  }

  if (name === 'orchestrate') {
    const tasks = Array.isArray(args.tasks) ? (args.tasks as SubAgentTask[]) : []
    const mode = String(args.mode ?? 'execute')
    try {
      if (mode === 'review') {
        const text = reviewSubAgentResults(await runSubAgents(sessionId, tasks).then((o) => ({ results: o.results, summary: o.summary })))
        await persistPair(sessionId, call, text)
        if (emitEvents) emitForSession(sessionId, { type: 'progress', text })
        return true
      }
      if (mode === 'undo') {
        const text = await undoLastSubAgent(sessionId)
        await persistPair(sessionId, call, text)
        if (emitEvents) emitForSession(sessionId, { type: 'progress', text })
        return true
      }
      const outcome = await runSubAgents(sessionId, tasks)
      const text = reviewSubAgentResults(outcome)
      if (emitEvents) {
        for (const r of outcome.results) {
          emitForSession(sessionId, { type: 'tool', name: r.tool, args: r.result ?? {}, result: r.observation })
        }
        emitForSession(sessionId, { type: 'progress', text })
      }
      await persistPair(sessionId, call, text, undefined, { name: 'orchestrate', args, result: outcome, observation: text, ok: outcome.summary.failed === 0, verified: outcome.summary.verified === outcome.summary.total })
      return true
    } catch (error: any) {
      const text = `[فشل] تعذر تنسيق الوكلاء الفرعيين: ${error?.message ?? String(error)}`
      await persistPair(sessionId, call, text)
      if (emitEvents) emitForSession(sessionId, { type: 'error', message: text })
      return true
    }
  }

  if (name === 'undo_last') {
    const entry = await peekUndo(sessionId)
    let result: string
    if (!entry) {
      result = 'لا توجد عمليات قابلة للتراجع في هذه الجلسة'
    } else {
      try {
        result = await withAuditCtx({ actor: 'undo', sessionId, tool: 'undo_last' }, () => performUndo(entry))
        await removeUndo(entry.id)
      } catch (error: any) {
        result = `فشل التراجع ولم يُحذف سجله: ${error?.message ?? String(error)}`
      }
    }
    await persistPair(sessionId, call, result)
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: 'undo_last', args, result })
    return true
  }

  if (name === 'search_sessions') {
    const q = String(args.query ?? '')
    const found = await storeSearch(q)
    const result = found.length
      ? found.map((f) => `• [${f.session.title}] ${f.snippet || 'بدون مقتطف'}`).slice(0, 10).join('\n')
      : 'لا توجد نتائج مطابقة'
    await persistPair(sessionId, call, result)
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: 'search_sessions', args: { query: q }, result })
    return true
  }

  if (name === 'generate_file') {
    const format = String(args.format ?? '')
    const filename = String(args.filename ?? 'تقرير')
    const spec = (args.spec ?? {}) as any
    const file = await runGenerateFile(format, filename, spec)
    if (file.ok) {
      await registerGeneratedFile({ sessionId, name: file.name, uri: file.uri, format })
      await persistPair(sessionId, call, { ok: true, name: file.name, uri: file.uri })
      await persistAssistantText(sessionId, `تم توليد الملف "${file.name}". افتحه أو شاركه من بطاقة الملف أدناه، ويمكنك مراجعته والتحقق منه بـ list_generated_files ثم review_generated_file.`, 'file', {
        name: file.name,
        uri: file.uri,
        format,
      })
      if (emitEvents) emitForSession(sessionId, { type: 'file', uri: file.uri, name: file.name, format })
    } else {
      const msg = `فشل توليد الملف: ${file.error}`
      await persistPair(sessionId, call, msg)
      if (emitEvents) emitForSession(sessionId, { type: 'error', message: msg })
    }
    return true
  }

  if (name === 'list_generated_files') {
    const files = await listGeneratedFiles()
    const result = files.length
      ? `الملفات المولّدة (${files.length}):\n` + files.map((f) => `- ${f.name} (${f.format}) — ${(f.size / 1024).toFixed(1)} كيلوبايت، ${new Date(f.createdAt).toLocaleTimeString('ar')}`).join('\n')
      : 'لا توجد ملفات مولّدة بعد. استخدم generate_file لإنشاء ملف ثم راجِعه بـ review_generated_file.'
    await persistPair(sessionId, call, result)
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: 'list_generated_files', args, result })
    return true
  }

  if (name === 'review_generated_file') {
    const fileName = String(args.name ?? '')
    const result = fileName
      ? await reviewGeneratedFile(fileName)
      : { ok: false, contentType: 'missing', text: 'يلزم اسم الملف (name) للمراجعة.' }
    const text = result.ok ? result.text : `[فشل التحقق] ${result.text}`
    await persistPair(sessionId, call, text)
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: 'review_generated_file', args: { name: fileName }, result })
    return true
  }

  if (name === 'project_memory_save') {
    const wsId = String(args.workspace_id ?? '')
    const note = String(args.note ?? '')
    const result = wsId && note
      ? ((await addProjectMemory(wsId, 'note', note)), 'حُفظت في ذاكرة المشروع الخفيّة')
      : 'فشل الحفظ: يلزم workspace_id و note'
    await persistPair(sessionId, call, result)
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: 'project_memory_save', args, result })
    return true
  }

  if (name === 'project_memory_read') {
    const wsId = String(args.workspace_id ?? '')
    const result = wsId
      ? (await projectMemorySummary(wsId)) || 'لا توجد ذاكرة محفوظة لهذا المشروع بعد'
      : 'فشل القراءة: يلزم workspace_id'
    await persistPair(sessionId, call, result)
    if (emitEvents) emitForSession(sessionId, { type: 'tool', name: 'project_memory_read', args, result })
    return true
  }

  await persistPair(sessionId, call, `أداة غير معروفة: ${name}. المتاح: execute، ask_user، request_confirmation، generate_file، list_generated_files، review_generated_file، search_sessions، undo_last، project_memory_save، project_memory_read`)
  if (emitEvents) emitForSession(sessionId, { type: 'tool', name, args, result: 'أداة غير معروفة' })
  return true
}

/** تنفيذ عملية حذف واحدة مع حفظ التراجع وإرجاع نتيجة بشرية. */
export async function deleteOne(sessionId: string, tool: string, id: string, args: Record<string, any>): Promise<string> {
  let outcome: string
  let undoKind: UndoEntry['kind'] = 'delete'
  let entity = ''
  let before: any = null
  try {
    if (tool === 'workspace_delete') {
      before = await getWsWorkspace(id, { includeRows: true })
      entity = 'workspace'
      await deleteWsWorkspace(id)
      outcome = 'تم حذف مساحة العمل'
    } else if (tool === 'workspace_delete_table') {
      before = await getWsTable(id, { includeRows: true })
      entity = 'workspace_table'
      await deleteWsTable(id)
      outcome = 'تم حذف الجدول'
    } else if (tool === 'workspace_delete_row') {
      before = await getWsRow(id)
      entity = 'workspace_row'
      await deleteWsRow(id)
      outcome = 'تم حذف الصف'
    } else if (tool === 'ledger_reverse_payment') {
      const { reverseLedgerPayment } = await import('../domain/projectDomain')
      const { withAuditCtx } = await import('../database/audit')
      const payId = String(args.payment_id ?? id)
      before = await captureBefore('plot_payments', payId).catch(() => null)
      undoKind = 'update'
      const r = await withAuditCtx({ actor: 'agent', sessionId, tool: 'ledger_reverse_payment' }, () =>
        reverseLedgerPayment(payId, args.plot_id ? String(args.plot_id) : undefined, 'موافقة المستخدم'))
      entity = 'plot_payments'
      before = before ?? { id: payId }
      outcome = `تم عكس الدفعة بمبلغ ${r.amount} (قيد العكس ${r.reversalId})`
    } else if (tool === 'unlink_entity_media') {
      const { unlinkEntityMedia } = await import('../database/workspace')
      const { withAuditCtx } = await import('../database/audit')
      const linkId = String(args.link_id ?? id)
      before = { linkId }
      undoKind = 'update'
      await withAuditCtx({ actor: 'agent', sessionId, tool: 'unlink_entity_media' }, () => unlinkEntityMedia(linkId))
      entity = 'entity_media'
      outcome = 'تم فك ربط الوسيط دون حذف المرفق الأصلي'
    } else {
      entity = String(args.entity ?? '')
      if (entity) before = await captureBefore(entity, id)
      await agentDelete({ entity: entity as any, id })
      const label = (ENTITY_LABELS as Record<string, string>)[entity] ?? entity
      outcome = `تم حذف ${label}`
    }
    await pushUndo({ sessionId, kind: undoKind, entity, entityId: id, before, summary: `${tool} (${id})` }).catch(() => {})
  } catch (e: any) {
    outcome = `فشل الحذف: ${e?.message ?? String(e)}`
  }
  const call: ToolCall = { id: `synth_${Date.now().toString(36)}`, name: 'execute', arguments: JSON.stringify({ tool, args: { ...args, id } }) }
  await persistPair(sessionId, call, outcome)
  return outcome
}

/** معاينة بشرية لما سيُحذف (الاسم والبيانات) — بلا معرفات ولا رموز. */
const PREVIEW_SKIP = new Set(['id', '_id', 'created_at', 'updated_at', 'lat', 'lng', 'latitude', 'longitude', 'coordinates', 'geometry', 'is_deleted', 'workspace_id', 'table_id', 'row_id'])
function humanRowPreview(row: any, maxFields = 3): string {
  if (!row || typeof row !== 'object') return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(row)) {
    if (PREVIEW_SKIP.has(k)) continue
    if (v == null || v === '') continue
    parts.push(String(v))
    if (parts.length >= maxFields) break
  }
  return parts.join(' — ')
}

export async function deletePreview(tool: string, args: Record<string, any>): Promise<string> {
  try {
    const id = String(args.id ?? args.row_id ?? args.table_id ?? args.workspace_id ?? '')
    if (tool === 'delete' || tool === 'mutate_record') {
      const entity = String(args.entity ?? '')
      if (!entity || !id) return ''
      const row = await queryEntityById(entity as any, id)
      return row ? humanRowPreview(row) : ''
    }
    if (tool === 'workspace_delete') {
      const ws = await getWsWorkspace(id)
      if (!ws) return ''
      const name = String(ws.name ?? '').trim()
      const tables = (ws.tables ?? []).length
      return `${name}${tables ? ` — ${tables} جدول` : ''}`
    }
    if (tool === 'workspace_delete_table') {
      const t = await getWsTable(id)
      return t ? String(t.name ?? '').trim() : ''
    }
    if (tool === 'workspace_delete_row') {
      const r = await getWsRow(id)
      return r ? humanRowPreview((r as any)?.values ?? r) : ''
    }
  } catch {}
  return ''
}

export async function deleteApproved(sessionId: string, pending: PendingState): Promise<void> {
  const items = Array.isArray(pending.items) && pending.items.length ? pending.items : null
  const doneKeys = new Set<string>()
  if (items && items.length) {
    for (const it of items) {
      const iargs = it.args && typeof it.args === 'object' ? it.args : (it.entity ? { entity: it.entity, id: it.id } : { id: it.id })
      await deleteOne(sessionId, it.tool, it.id, iargs)
      doneKeys.add(`${it.tool}:${it.id}`)
    }
  }
  const action = pending.action
  if (items && items.length && (!action || action.type !== 'delete')) return
  if (action && action.type === 'delete' && doneKeys.has(`${action.tool}:${action.id}`)) return
    // وافق المستخدم لكن الموافقة لم تُربط بأي إجراء حذف (مسار request_confirmation بلا action)
    const call: ToolCall = { id: `synth_${Date.now().toString(36)}`, name: 'execute', arguments: '{"tool":"confirmation_note"}' }
    await persistAssistantText(sessionId, 'وافقت على الإجراء، لكنه لم يُحدد بدقة — لا شيء نُفِّذ بعد.', 'system')
    await persistPair(
      sessionId,
      call,
      '[فشل] وافق المستخدم على الإجراء لكن لم يُربط بإجراء حذف محدد (لا tool صالح ولا معرف). إذا كان المطلوب حذفاً فاستدعِ أداة الحذف المباشرة (delete مع entity و id) وسيعرض التطبيق طلب الموافقة تلقائياً.'
    )
    return
  }
  if (!action.id) {
    await persistPair(sessionId, { id: `synth_${Date.now().toString(36)}`, name: 'execute', arguments: '{"tool":"delete"}' }, '[فشل] وافق المستخدم لكن لم يُحدَّد معرّف العنصر المراد حذفه.')
    return
  }
  const tool = action.tool ?? 'delete'
  const id = action.id

  let outcome: string
  let undoKind: UndoEntry['kind'] = 'delete'
  let entity = ''
  let before: any = null

  try {
    if (tool === 'workspace_delete') {
      before = await getWsWorkspace(id, { includeRows: true })
      entity = 'workspace'
      await deleteWsWorkspace(id)
      outcome = `تم حذف مساحة العمل (${id}) بجداولها`
    } else if (tool === 'workspace_delete_table') {
      before = await getWsTable(id, { includeRows: true })
      entity = 'workspace_table'
      await deleteWsTable(id)
      outcome = `تم حذف الجدول (${id}) بصفوفه`
    } else if (tool === 'workspace_delete_row') {
      before = await getWsRow(id)
      entity = 'workspace_row'
      await deleteWsRow(id)
      outcome = `تم حذف الصف (${id})`
    } else if (tool === 'ledger_reverse_payment') {
      const { reverseLedgerPayment } = await import('../domain/projectDomain')
      const { withAuditCtx } = await import('../database/audit')
      const payId = String(action.args?.payment_id ?? id)
      const beforePay = await captureBefore('plot_payments', payId).catch(() => null)
      const r = await withAuditCtx({ actor: 'agent', sessionId, tool: 'ledger_reverse_payment' }, () =>
        reverseLedgerPayment(payId, action.args?.plot_id ? String(action.args.plot_id) : undefined, action.args?.reason ? String(action.args.reason) : 'موافقة المستخدم'))
      await pushUndo({ sessionId, kind: 'update', entity: 'plot_payments', entityId: payId, before: beforePay, after: { reversed: true, reversalId: r.reversalId }, summary: `عكس الدفعة ${payId}` }).catch(() => {})
      outcome = `تم عكس الدفعة بمبلغ ${r.amount} (قيد العكس ${r.reversalId})`
      entity = 'plot_payments'
    } else if (tool === 'unlink_entity_media') {
      const { unlinkEntityMedia } = await import('../database/workspace')
      const { withAuditCtx } = await import('../database/audit')
      await withAuditCtx({ actor: 'agent', sessionId, tool: 'unlink_entity_media' }, () => unlinkEntityMedia(String(action.args?.link_id ?? id)))
      outcome = 'تم فك ربط الوسيط دون حذف المرفق الأصلي'
      entity = 'entity_media'
    } else {
      entity = String(action.args?.entity ?? '')
      if (entity) before = await captureBefore(entity, id)
      await agentDelete({ entity: entity as any, id })
      outcome = `تم الحذف: ${entity} (${id})`
    }
    await pushUndo({ sessionId, kind: undoKind, entity, entityId: id, before, summary: `${tool} (${id})` }).catch(() => {})
  } catch (e: any) {
    outcome = `فشل الحذف: ${e?.message ?? String(e)}`
  }

  const call: ToolCall = {
    id: `synth_${Date.now().toString(36)}`,
    name: 'execute',
    arguments: JSON.stringify({ tool, args: { ...(action.args ?? {}), id } }),
  }
  await persistPair(sessionId, call, outcome)
  emitForSession(sessionId, { type: 'tool', name: tool, args: { ...(action.args ?? {}), id }, result: outcome })
}

export async function deleteRefused(sessionId: string): Promise<void> {
  const call: ToolCall = { id: `synth_${Date.now().toString(36)}`, name: 'execute', arguments: '{"tool":"delete"}' }
  await persistPair(sessionId, call, 'المستخدم رفض تنفيذ الحذف')
}