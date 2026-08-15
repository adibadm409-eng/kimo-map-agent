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
import { getPending, setPending, popUndo, pushUndo, searchSessions as storeSearch } from './store'
import { adaptToolArgs, runToolWithFeedback } from './toolSchemas'
import { persistPair, persistAssistantText } from './persist'
import { captureBefore, recordUndo, performUndo } from './undo'
import { emit } from './agentRun'
import { WRITE_TOOLS, DELETE_CONFIRM_TOOLS } from './prompts'
import { parseToolArgs, type ToolCall } from './llm'
import { generateExcelFile, generateWordFile, generatePdfFile, buildHtml, type ExcelFileSpec, type WordFileSpec } from './files'

export type OpenLink = { kind: 'workspace' | 'project' | 'block' | 'plot' | 'client' | 'property'; id: string; label?: string }

/**
 * بطاقة "افتح" تُثبَّت في المحادثة بعد نجاح أي إنشاء/استيراد/نسخ:
 * تسمح للمستخدم بلمسة واحدة بالانتقال إلى مكان البيانات الجديدة (مشروع/مساحة عمل/قطعة...)
 * ليرى أثر الوكيل ويديرها بنفسه — لا بيانات في أماكن مجهولة.
 */
export async function persistOpenLink(sessionId: string, link: OpenLink): Promise<void> {
  try {
    await persistAssistantText(sessionId, '', 'link', link as any)
    emit({ type: 'link', ...link })
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

  if (tool === 'update' && String(args.entity ?? '') === 'plots' && args.data && (Object.prototype.hasOwnProperty.call(args.data, 'paid_amount') || Object.prototype.hasOwnProperty.call(args.data, 'remaining_amount'))) {
    const obs = '[فشل] لا تعدل paid_amount أو remaining_amount مباشرة؛ استخدم مسار دفتر النقد لتسجيل دفعة أو عكسها حتى تبقى الأرقام قابلة للمراجعة.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'financial_columns_protected', ok: false })
    if (emitEvents) emit({ type: 'tool', name: tool, args, result: 'financial_columns_protected' })
    return true
  }
  if (tool === 'create' && String(args.entity ?? '') === 'plot_payments') {
    const obs = '[فشل] تسجيل الأقساط لا يتم عبر إنشاء سجل خام؛ استخدم دفتر النقد الموحّد مع المشروع والأصل والتاريخ والمبلغ.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'ledger_required', ok: false })
    if (emitEvents) emit({ type: 'tool', name: tool, args, result: 'ledger_required' })
    return true
  }
  if (tool === 'project_import_commit') {
    if (!Array.isArray(args.rows) || args.rows.length === 0) {
      const obs = '[فشل] اعتماد المشروع يتطلب صفوفاً بعد المعاينة؛ لا أستطيع إنشاء مشروع فارغ من هذا المسار.'
      await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'rows_required', ok: false })
      if (emitEvents) emit({ type: 'tool', name: tool, args, result: 'rows_required' })
      return true
    }
    if (args.rows.length > 10000) {
      const obs = '[فشل] الدفعة أكبر من الحد المحلي 10000 صف؛ قسّمها إلى دفعات بعد التأكد من مفاتيح التكرار.'
      await persistPair(sessionId, call, obs, undefined, { name: tool, args: { ...args, rows: `[${args.rows.length} صف]` }, result: 'batch_too_large', ok: false })
      if (emitEvents) emit({ type: 'tool', name: tool, args, result: 'batch_too_large' })
      return true
    }
  }
  if (tool === 'ledger_record_payment' && (!(Number(args.amount) > 0) || !args.project_id || (!args.node_id && !args.plot_id) || (args.node_id && args.plot_id))) {
    const obs = '[فشل] الدفعة تحتاج مشروعاً وأصلاً واحداً ومبلغاً موجباً وتاريخاً واضحاً؛ اختر node_id أو plot_id وليس الاثنين.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'payment_contract_invalid', ok: false })
    if (emitEvents) emit({ type: 'tool', name: tool, args, result: 'payment_contract_invalid' })
    return true
  }

  if (WRITE_TOOLS.has(tool) && s.mode === 'read') {
    const obs = '[فشل] العملية تتطلب وضع التعديل، والوضع الحالي للقراءة فقط. فعّل وضع التعديل من إعدادات المساعد ثم أعد المحاولة.'
    await persistPair(sessionId, call, obs, undefined, { name: tool, args, result: 'محظور في وضع القراءة فقط', ok: false })
    if (emitEvents) emit({ type: 'tool', name: tool, args, result: 'محظور في وضع القراءة فقط' })
    return true
  }

  if (DELETE_CONFIRM_TOOLS.has(tool)) {
    const delId = String(args.id ?? args.row_id ?? args.table_id ?? args.workspace_id ?? '')
    if (!delId) {
      const msg = 'خطأ: العملية تتطلب معرّف عنصر صالحاً للحذف'
      await persistPair(sessionId, call, msg, undefined, { name: tool, args })
      if (emitEvents) emit({ type: 'tool', name: tool, args, result: msg })
      return true
    }
    // معاينة بشرية للمحتوى المراد حذفه (بلا معرفات ولا رموز تقنية)
    const preview = await deletePreview(tool, { ...args, id: delId })
    const entityLabel =
      tool === 'delete'
        ? (ENTITY_LABELS as Record<string, string>)[String(args.entity ?? '')] ?? String(args.entity ?? '')
        : tool === 'workspace_delete'
          ? 'مساحة عمل'
          : tool === 'workspace_delete_table'
            ? 'جدول'
            : 'صف'
    const item = { tool, id: delId, entity: String(args.entity ?? ''), preview: `${entityLabel}: ${preview}`.replace(/:+\s*$/, '') }
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
    if (emitEvents) emit({ type: 'confirmation', title, message, items })
    return true
  }

  const { ok, observation, result } = await withAuditCtx({ actor: 'agent', sessionId, tool }, () =>
    runToolWithFeedback(tool, args)
  )
  // الملاحظة التي تعود للموديل: نص عربي واضح الحالة [نجاح]/[فشل] + سطر [تحقق]
  await persistPair(sessionId, call, observation, undefined, { name: tool, args, result, observation, ok })
  if (emitEvents) emit({ type: 'tool', name: tool, args, result: ok ? result : result })

  if (ok) {
    await recordUndo(sessionId, tool, args, result)
    // أثر مرئي: بطاقة "افتح" بعد إنشاء/استيراد/نسخ — تعيد المستخدم إلى مكان البيانات الجديدة
    const link = openLinkFor(tool, args, result)
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

export async function handleToolCall(
  sessionId: string,
  s: AgentSettings,
  call: ToolCall,
  emitEvents: boolean
): Promise<boolean> {
  const args = parseToolArgs(call.arguments)
  const name = call.name

  if (s.mode === 'read' && name === 'undo_last') {
    await persistPair(sessionId, call, 'محظور: الوضع الحالي للقراءة فقط — التراجع يتطلب وضع التعديل')
    if (emitEvents) emit({ type: 'tool', name, args, result: 'محظور في وضع القراءة فقط' })
    return true
  }

  if (name === 'ask_user') {
    const question = String(args.question ?? '')
    const choices = Array.isArray(args.choices) ? args.choices.map(String) : undefined
    const allowFreeText = args.allow_free_text !== false
    await setPending({ sessionId, kind: 'ask_user', question, choices, allowFreeText })
    await persistAssistantText(sessionId, question, 'ask_user', { question, choices, allowFreeText })
    if (emitEvents) emit({ type: 'ask_user', question, choices, allowFreeText })
    return false
  }

  if (name === 'request_confirmation') {
    const title = String(args.title ?? 'طلب موافقة')
    const message = String(args.message ?? '')
    const details = typeof args.details === 'string' ? args.details : undefined
    // ربط إجراء الحذف بالموافقة إن أرسله الموديل: يُنفَّذ بعد الموافقة فعلياً
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
    await setPending({ sessionId, kind: 'confirmation', question: message, title, details, action })
    await persistAssistantText(sessionId, `[طلب موافقة] ${title}\n${message}`, 'confirmation', { title, message, details })
    if (emitEvents) emit({ type: 'confirmation', title, message, details })
    return false
  }

  if (name === 'execute') {
    const tool = String(args.tool ?? '')
    const toolArgs = (args.args ?? {}) as Record<string, any>
    return await runRegistryTool(sessionId, s, call, tool, toolArgs, emitEvents)
  }

  // الوكيل يدعو الأدوات مباشرة بأسمائها (query/get/create/...) — مخططات صريحة
  if (TOOLS.some((t) => t.name === name)) {
    return await runRegistryTool(sessionId, s, call, name, args, emitEvents)
  }

  if (name === 'undo_last') {
    const entry = await popUndo(sessionId)
    const result = entry
      ? await withAuditCtx({ actor: 'undo', sessionId, tool: 'undo_last' }, () => performUndo(entry))
      : 'لا توجد عمليات قابلة للتراجع في هذه الجلسة'
    await persistPair(sessionId, call, result)
    if (emitEvents) emit({ type: 'tool', name: 'undo_last', args, result })
    return true
  }

  if (name === 'search_sessions') {
    const q = String(args.query ?? '')
    const found = await storeSearch(q)
    const result = found.length
      ? found.map((f) => `• [${f.session.title}] ${f.snippet || 'بدون مقتطف'}`).slice(0, 10).join('\n')
      : 'لا توجد نتائج مطابقة'
    await persistPair(sessionId, call, result)
    if (emitEvents) emit({ type: 'tool', name: 'search_sessions', args: { query: q }, result })
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
      if (emitEvents) emit({ type: 'file', uri: file.uri, name: file.name, format })
    } else {
      const msg = `فشل توليد الملف: ${file.error}`
      await persistPair(sessionId, call, msg)
      if (emitEvents) emit({ type: 'error', message: msg })
    }
    return true
  }

  if (name === 'list_generated_files') {
    const files = await listGeneratedFiles()
    const result = files.length
      ? `الملفات المولّدة (${files.length}):\n` + files.map((f) => `- ${f.name} (${f.format}) — ${(f.size / 1024).toFixed(1)} كيلوبايت، ${new Date(f.createdAt).toLocaleTimeString('ar')}`).join('\n')
      : 'لا توجد ملفات مولّدة بعد. استخدم generate_file لإنشاء ملف ثم راجِعه بـ review_generated_file.'
    await persistPair(sessionId, call, result)
    if (emitEvents) emit({ type: 'tool', name: 'list_generated_files', args, result })
    return true
  }

  if (name === 'review_generated_file') {
    const fileName = String(args.name ?? '')
    const result = fileName
      ? await reviewGeneratedFile(fileName)
      : { ok: false, contentType: 'missing', text: 'يلزم اسم الملف (name) للمراجعة.' }
    const text = result.ok ? result.text : `[فشل التحقق] ${result.text}`
    await persistPair(sessionId, call, text)
    if (emitEvents) emit({ type: 'tool', name: 'review_generated_file', args: { name: fileName }, result })
    return true
  }

  if (name === 'project_memory_save') {
    const wsId = String(args.workspace_id ?? '')
    const note = String(args.note ?? '')
    const result = wsId && note
      ? ((await addProjectMemory(wsId, 'note', note)), 'حُفظت في ذاكرة المشروع الخفيّة')
      : 'فشل الحفظ: يلزم workspace_id و note'
    await persistPair(sessionId, call, result)
    if (emitEvents) emit({ type: 'tool', name: 'project_memory_save', args, result })
    return true
  }

  if (name === 'project_memory_read') {
    const wsId = String(args.workspace_id ?? '')
    const result = wsId
      ? (await projectMemorySummary(wsId)) || 'لا توجد ذاكرة محفوظة لهذا المشروع بعد'
      : 'فشل القراءة: يلزم workspace_id'
    await persistPair(sessionId, call, result)
    if (emitEvents) emit({ type: 'tool', name: 'project_memory_read', args, result })
    return true
  }

  await persistPair(sessionId, call, `أداة غير معروفة: ${name}. المتاح: execute، ask_user، request_confirmation، generate_file، list_generated_files، review_generated_file، search_sessions، undo_last، project_memory_save، project_memory_read`)
  if (emitEvents) emit({ type: 'tool', name, args, result: 'أداة غير معروفة' })
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
    if (tool === 'delete') {
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
  const action = pending.action
  if (!action || action.type !== 'delete') {
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
  emit({ type: 'tool', name: tool, args: { ...(action.args ?? {}), id }, result: outcome })
}

export async function deleteRefused(sessionId: string): Promise<void> {
  const call: ToolCall = { id: `synth_${Date.now().toString(36)}`, name: 'execute', arguments: '{"tool":"delete"}' }
  await persistPair(sessionId, call, 'المستخدم رفض تنفيذ الحذف')
}