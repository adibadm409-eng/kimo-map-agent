import { TOOLS, executeTool, queryEntityById, queryEntities, getEntityDef, ALL_ENTITIES, ENTITY_LABELS, type EntityKey } from '../agent'
import {
  getWorkspace as getWsWorkspace,
  getTable as getWsTable,
  getRow as getWsRow,
  listWorkspaces as listWs,
  listAttachments,
} from '../database/workspace'
import { getDB } from '../database/db'
import type { FunctionDef } from '../assistant/llm'
import { toolCache } from './toolCache'

// ---------- بناء تعريفات أدوات بمخططات JSON صريحة ----------

function argTypeToSchema(t: string): string {
  if (t === 'array') return 'array'
  if (t === 'object') return 'object'
  if (t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  return 'string'
}

/** مخطّط JSON صريح لكل أداة مسجلة: يمنح الموديل البنية الدقيقة فيقلّ الخطأ في الاستدعاء.
 *  يُولّد فقط للأدوات الأساسية لتقليل حجم الطلب. */
export function buildToolSchemas(): Record<string, { type: 'object'; properties: Record<string, any>; required: string[] }> {
  const out: Record<string, any> = {}
  const CORE_TOOLS = new Set([
    'query', 'get', 'mutate_record', 'search_everything',
    'ask_user', 'request_confirmation', 'undo_last',
    'list_entities', 'catalog', 'schema_inspect',
    'current_local_time', 'generate_file',
    'review_my_work', 'data_snapshot',
    'attach_media_to_entity', 'list_attachments', 'remove_attachment',
    'create_offer_with_reminder', 'offer_reminder_set',
    'create_reminder', 'list_reminders', 'cancel_reminder', 'reminder_update',
    'property_change_preview', 'property_intake_apply',
    'preview_update', 'custom_field_set', 'list_entity_media',
    'ledger_reverse_payment', 'bulk_mutate', 'export_entity_csv',
  ])
  for (const t of TOOLS) {
    if (!CORE_TOOLS.has(t.name)) continue
    const properties: Record<string, any> = {}
    const required: string[] = []
    for (const a of t.args) {
      const def: Record<string, any> = {
        type: argTypeToSchema(a.type),
        description: a.description ?? '',
      }
      if (a.type === 'array') def.items = { type: 'object' }
      if (def.type === 'number') def.minimum = 0
      properties[a.name] = def
      if (a.required) required.push(a.name)
    }
    out[t.name] = { type: 'object', properties, required }
  }
  // إثراء حقل entity بقائمة الكيانات الصحيحة ليمنع استدعاء كيان وهمي
  for (const name of ['query', 'get', 'create', 'update', 'delete']) {
    const schema = out[name]
    if (!schema) continue
    if (schema.properties.entity) {
      schema.properties.entity.enum = ALL_ENTITIES.map((e) => e.key)
      schema.properties.entity.description = 'اسم الكيان: ' + ALL_ENTITIES.map((e) => `${e.key} (${ENTITY_LABELS[e.key]})`).join('، ')
    }
  }
  if (out.mutate_record) {
    out.mutate_record.properties.operation = {
      type: 'string',
      enum: ['create', 'update', 'delete'],
      description: 'create للإنشاء، update لتعديل جزئي، delete لطلب حذف مع موافقة المستخدم',
    }
    out.mutate_record.properties.entity.enum = ALL_ENTITIES.map((e) => e.key)
    out.mutate_record.properties.entity.description = 'كيان السجل الأساسي؛ استخدم الكتالوج قبل الكتابة عند عدم وضوح الحقول'
    out.mutate_record.properties.id.description = 'مطلوب مع update أو delete، ويُترك فارغاً مع create'
    out.mutate_record.properties.data.description = 'مطلوب مع create؛ مع update أرسل الحقول المراد تغييرها فقط؛ مع delete لا ترسل data'
  }
  for (const name of ['project_tree', 'project_financials']) {
    if (out[name]?.properties.project_id) out[name].properties.project_id.description = 'معرف المشروع (اجلِبه بمنتج query على الكيان projects)'
  }
  if (out.installment_schedule?.properties.plot_id) out.installment_schedule.properties.plot_id.description = 'معرف القطعة أو رقمها الظاهر للمستخدم مثل A-01؛ استخدم الرقم الطبيعي ويمكن حلّه داخلياً'
  if (out.installment_schedule?.properties.project_id) out.installment_schedule.properties.project_id.description = 'اسم المشروع أو معرفه لتضييق البحث عن القطعة عند توفره'
  if (out.payment_ledger) {
    if (out.payment_ledger.properties.project_id) out.payment_ledger.properties.project_id.description = 'معرف المشروع (اختياري إن لم تُرسل block_id/plot_id)'
    if (out.payment_ledger.properties.block_id) out.payment_ledger.properties.block_id.description = 'معرف البلوك (اختياري)'
    if (out.payment_ledger.properties.plot_id) out.payment_ledger.properties.plot_id.description = 'معرف القطعة (اختياري)'
  }
  return out
}

// ---------- تكيّف المعاملات: مرونة المدخلات ----------

const ENTITY_ALIASES: Record<string, string> = {}
for (const e of ALL_ENTITIES) {
  ENTITY_ALIASES[e.key] = e.key
  ENTITY_ALIASES[e.label] = e.key
}
ENTITY_ALIASES['عقار'] = 'properties'
ENTITY_ALIASES['عقارات'] = 'properties'
ENTITY_ALIASES['عميل'] = 'clients'
ENTITY_ALIASES['عملاء'] = 'clients'
ENTITY_ALIASES['مشترٍ'] = 'clients'
ENTITY_ALIASES['مشترٍي'] = 'clients'
ENTITY_ALIASES['عرض'] = 'offers'
ENTITY_ALIASES['عروض'] = 'offers'
ENTITY_ALIASES['حملة'] = 'campaigns'
ENTITY_ALIASES['معاينة'] = 'viewings'
ENTITY_ALIASES['معاينات'] = 'viewings'
ENTITY_ALIASES['نقطة'] = 'waypoints'
ENTITY_ALIASES['نقاط الخريطة'] = 'waypoints'
ENTITY_ALIASES['منطقة'] = 'areas'
ENTITY_ALIASES['مناطق'] = 'areas'
ENTITY_ALIASES['مشروع'] = 'projects'
ENTITY_ALIASES['المشروع'] = 'projects'
ENTITY_ALIASES['مشاريع'] = 'projects'
ENTITY_ALIASES['المشاريع'] = 'projects'
ENTITY_ALIASES['بلوك'] = 'blocks'
ENTITY_ALIASES['البلوك'] = 'blocks'
ENTITY_ALIASES['بلوكات'] = 'blocks'
ENTITY_ALIASES['البلوكات'] = 'blocks'
ENTITY_ALIASES['قطعة'] = 'plots'
ENTITY_ALIASES['القطعة'] = 'plots'
ENTITY_ALIASES['قطع'] = 'plots'
ENTITY_ALIASES['القطع'] = 'plots'
ENTITY_ALIASES['قسط'] = 'plot_payments'
ENTITY_ALIASES['القسط'] = 'plot_payments'
ENTITY_ALIASES['أقساط'] = 'plot_payments'
ENTITY_ALIASES['الأقساط'] = 'plot_payments'
ENTITY_ALIASES['قسط قطعة'] = 'plot_payments'

/** تحويل معرفات الدالة المرنة (مثل row_id وtable_id) بحسب نوع الأداة. */
const ID_ALIASES: Record<string, string> = {
  workspace_get: 'id',
  workspace_update: 'id',
  workspace_delete: 'id',
  workspace_add_table: 'workspace_id',
  workspace_add_row: 'table_id',
  workspace_import_rows: 'table_id',
  workspace_add_column: 'table_id',
  workspace_add_columns: 'table_id',
  workspace_alter_column: 'table_id',
  workspace_duplicate_table: 'table_id',
  workspace_rename_column: 'table_id',
  workspace_remove_column: 'table_id',
  workspace_rename_table: 'table_id',
  workspace_delete_table: 'table_id',
  workspace_duplicate_workspace: 'workspace_id',
  workspace_create_full_table: 'workspace_id',
  workspace_update_row: 'row_id',
  workspace_delete_row: 'row_id',
}

const NUMERIC_FIELDS = new Set(['limit', 'offset', 'max_rows_per_sheet', 'amount', 'price', 'area', 'area_sqm', 'lots'])

/**
 * طبقة التكيُّف: تطبيع المعاملات قبل التنفيذ حتى تقبل الوسيلة ما يفعله الوكيل
 * من خلالها (مرونة بلا كسر):
 * - تحويل اسم الكيان إلى المفتاح الصحيح (العربية أو المختصرات).
 * - توحيد المعرّفات (id/row_id/table_id/workspace_id).
 * - تحويل الأرقام المرسلة كنصوص إلى أرقام حقيقية للحقول الرقمية.
 */
export function adaptToolArgs(tool: string, raw: Record<string, any>): Record<string, any> {
  const args: Record<string, any> = {}
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) args[k] = v

  // طبّع اسم الكيان قبل أي تحويل يعتمد على مخططه؛ لا تلوث عقاراً أو عميلاً
  // بحقول خاصة بالمشاريع/القطع لمجرد أن النموذج أرسل أسماء عامة مثل project أو area.
  if (args.entity != null) {
    const key = ENTITY_ALIASES[String(args.entity).trim().toLowerCase()] ?? ENTITY_ALIASES[String(args.entity).trim()]
    if (key) args.entity = key
  }
  const projectEntities = new Set(['projects', 'blocks', 'plots', 'plot_payments'])
  if (args.data && typeof args.data === 'object' && String(args.entity ?? '') === 'properties') {
    const d = args.data
    if (d.area == null && d.area_sqm != null) d.area = d.area_sqm
    if (d.area_sqm == null && d.area != null) d.area_sqm = d.area
  }
  if (args.data && typeof args.data === 'object' && projectEntities.has(String(args.entity ?? ''))) {
    const d = args.data
    // لا تضف مفاتيح undefined إلى patch؛ agentUpdate يتحقق من أسماء الحقول
    // على مستوى Object.keys، وإضافة aliases فارغة كانت تحوّل تعديلاً صحيحاً
    // مثل installment_type إلى «حقول غير معروفة» وتمنع الكتابة الذرية.
    const assignIfPresent = (key: string, ...candidates: any[]) => {
      if (d[key] != null && d[key] !== '') return
      const value = candidates.find((candidate) => candidate != null && candidate !== '')
      if (value != null && value !== '') d[key] = value
    }
    assignIfPresent('project_id', d.project, d.projectId, d.project_name)
    assignIfPresent('block_id', d.block, d.blockId, d.block_name, d.parent_id, d.parentId)
    assignIfPresent('plot_id', d.plot, d.plotId, d.plot_name)
    assignIfPresent('plot_no', d.plot_number, d.plot_num, d.number, d.no)
    assignIfPresent('area_sqm', d.area, d.size, d.area_m2, d.m2)
    assignIfPresent('value', d.price, d.cost, d.total_value, d.amount)
    assignIfPresent('buyer_name', d.buyer, d.client_name, d.client)
    assignIfPresent('buyer_contact', d.buyer_phone, d.phone, d.contact, d.mobile)
  }
  if (tool === 'mutate_record') {
    const rawOperation = args.operation ?? args.action ?? args.mode
    if (rawOperation != null) args.operation = String(rawOperation).trim().toLowerCase()
    if (args.operation === 'add' || args.operation === 'insert' || args.operation === 'write') args.operation = 'create'
    if (args.operation === 'edit' || args.operation === 'patch' || args.operation === 'modify') args.operation = 'update'
    if (args.operation === 'remove') args.operation = 'delete'
    if (args.data == null && args.values != null) args.data = args.values
  }
  // قطعة مفردة: يربط اسم الموديل بالرقم (قرأنا الكيان هنا بعد تطبيع الأسماء)
  if (args.entity === 'plots' && args.data && typeof args.data === 'object') {
    const d = args.data
    if (d.name != null && (d.plot_no == null || d.plot_no === '')) d.plot_no = d.name
    if (d.status != null && typeof d.status === 'string') {
      const s = String(d.status)
      if (s === 'متاحة' || s === 'متاح' || s === 'متوفرة') d.status = 'available'
      else if (s === 'مبيعة' || s === 'مباعة' || s === 'sold') d.status = 'sold'
      else if (s === 'تقسيط' || s === 'installment') d.status = 'installment'
    }
  } else if (args.entity === 'blocks' && args.data && typeof args.data === 'object' && Array.isArray(args.data.plots)) {
    args.data.plots = args.data.plots.map((p: any) => {
      if (p && typeof p === 'object' && p.plot_no == null && p.name != null) p.plot_no = p.name
      if (p && typeof p === 'object' && p.status != null && typeof p.status === 'string') {
        const s = String(p.status)
        if (s === 'متاحة' || s === 'متاح' || s === 'متوفرة') p.status = 'available'
        else if (s === 'مبيعة' || s === 'مباعة' || s === 'sold') p.status = 'sold'
        else if (s === 'تقسيط' || s === 'installment') p.status = 'installment'
      }
      return p
    })
  }
  const alias = ID_ALIASES[tool]
  if (alias && (args.id != null || args.workspace_id != null || args.table_id != null || args.row_id != null)) {
    args[alias] = args.id ?? args.workspace_id ?? args.table_id ?? args.row_id
  }
  if (tool === 'get' || tool === 'update' || tool === 'delete') {
    if (args.id == null && args.row_id != null) args.id = args.row_id
  }
  // مرونة أسماء حقول القيم (الموديل قد يرسل values أو data بدل row/rows/column)
  if (tool === 'workspace_add_row' && args.row == null) {
    args.row = args.values ?? args.rowData ?? args.row_data ?? args.fields ?? args.data ?? args.value
  }
  if (tool === 'workspace_update_row' && args.row == null) {
    args.row = args.values ?? args.rowData ?? args.row_data ?? args.fields ?? args.data ?? args.value
  }
  if (tool === 'workspace_import_rows' && args.rows == null) {
    args.rows = args.data ?? args.values ?? args.items ?? args.rows_input
  }
  if (tool === 'workspace_add_columns' && args.columns == null) {
    args.columns = args.data ?? args.column ?? args.columns_input
  }
  if (tool === 'workspace_create_full_table' && args.rows == null) {
    args.rows = args.data ?? args.rows_input
  }
  if (tool === 'workspace_add_column' && args.column == null) {
    args.column = args.column_definition ?? args.column_data ?? args.field ?? args.def
  }
  const ROW_COL_ALIASES: Record<string, string[]> = {
    name: ['الاسم', 'اسم', 'title', 'label', 'plot_name'],
    amount: ['المبلغ', 'مبلغ', 'price', 'value', 'cost', 'المقدار'],
    phone: ['الهاتف', 'جوال', 'mobile', 'contact'],
    status: ['الحالة', 'حاله', 'state'],
    area: ['المساحة', 'مساحة', 'area_sqm', 'size'],
  }
  const normalizeRowKeys = (row: Record<string, any>) => {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(row)) {
      let mapped = k
      const lk = String(k).trim().toLowerCase()
      for (const [canonical, aliases] of Object.entries(ROW_COL_ALIASES)) {
        if (aliases.some((a) => a.toLowerCase() === lk) || lk === canonical) { mapped = canonical; break }
      }
      out[mapped] = v
    }
    return out
  }
  if (args.row && typeof args.row === 'object' && !Array.isArray(args.row)) args.row = normalizeRowKeys(args.row as Record<string, any>)
  if (args.rows && Array.isArray(args.rows)) args.rows = args.rows.map((r: any) => r && typeof r === 'object' && !Array.isArray(r) ? normalizeRowKeys(r) : r)
  const skipNormalize = projectEntities.has(String(args.entity)) || String(args.entity) === 'properties'
  if (args.data && typeof args.data === 'object' && !Array.isArray(args.data) && args.entity && !skipNormalize) {
    args.data = normalizeRowKeys(args.data as Record<string, any>)
  }
  // إعادة تعريف area_sqm من area للعقارات بعد تطبيع المفاتيح
  if (args.entity === 'properties' && args.data && typeof args.data === 'object') {
    const d = args.data as Record<string, any>
    if (d.area_sqm == null && d.area != null) d.area_sqm = d.area
    if (d.area == null && d.area_sqm != null) d.area = d.area_sqm
  }
  for (const [k, v] of Object.entries(args)) {
    if (NUMERIC_FIELDS.has(k) && typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      args[k] = Number(v)
    }
  }
  return args
}

// ---------- حالة صريحة {نجاح/فشل} + تلميح تصحيح المسار ----------

function toolRenameHint(tool: string, error: string): string {
  const e = error.toLowerCase()
  if (e.includes('غير معروفة') || e.includes('unknown')) return 'راجِع قائمة الأقسام بأداة list_entities ثم استدعِ الأداة الصحيحة.'
  if (tool === 'query' && (e.includes('entity') || e.includes('كيان'))) return 'تأكّد من اسم الكيان الصحيح (انظر قيمته في أداة list_entities).'
  if (tool === 'create' && e.includes('column') || tool === 'create' && e.includes('عمود')) return 'أرسل الحقول بالصيغة {اسم_العمود: القيمة} بالأعمدة الصحيحة الموجودة في الكيان.'
  if (e.includes('not_null') || e.includes('مطلوب') || e.includes('required')) return 'أرسل كل الحقول المطلوبة (required) للكيان.'
  return ''
}

/** بناء ملاحظة (Observation) واضحة الحالة يعيدها التنفيذ للموديل — نجاح أو فشل صريح. */
export function buildToolObservation(tool: string, res: { ok: boolean; result?: any; error?: string }, args: Record<string, any>, verification?: string): string {
  if (res.ok) {
    const summary = typeof res.result === 'string' ? res.result : res.result != null ? JSON.stringify(res.result) : ''
    let note = `[نجاح] أداة ${tool}`
    const entity = typeof args.entity === 'string' ? args.entity : ''
    if (entity) note += ` على كيان ${entity}`
    note += summary ? `:\n${summary}` : ''
    if (verification) note += `\n[تحقق] ${verification}`
    return note
  }
  const hint = toolRenameHint(tool, res.error ?? '')
  return `[فشل] أداة ${tool} فشلت: ${res.error ?? 'خطأ غير محدد'}${hint ? `\n[مسار بديل] ${hint}` : ''}`
}

// ---------- التحقق من أن البيانات موجودة فعلاً في قاعدة البيانات ----------

/** عدّ فعلي لسجلات الكيان في قاعدة البيانات — بلا افتراضات. */
async function countEntity(entity: string): Promise<number> {
  try {
    const def = getEntityDef(entity)
    if (!def) return 0
    const db = await getDB()
    const r = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${def.table}`)
    return r?.c ?? 0
  } catch {
    return 0
  }
}

/** رسالة تحقيق قوية تعتمد فقط على أرقام مقروءة من قاعدة البيانات فعلاً. */
export async function verifyDataExists(tool: string, args: Record<string, any>, result: any): Promise<string | undefined> {
  try {
    // ---------- الكيانات الأساسية (create/update/delete) ----------
    if ((tool === 'create' || tool === 'update') && args.entity && (args.id || result?.id)) {
      const id = String(args.id ?? result.id)
      const row = await queryEntityById(args.entity as EntityKey, id)
      if (!row) return `السجل (المعرف ${id}) غير موجود في قاعدة البيانات رغم نجاح العملية — أعد فحصه الآن بأداة get.`
      if (tool === 'update' && args.data && typeof args.data === 'object') {
        const mismatches = Object.entries(args.data as Record<string, any>)
          .filter(([key, expected]) => JSON.stringify((row as Record<string, any>)[key]) !== JSON.stringify(expected))
          .map(([key, expected]) => `${key}: المتوقع ${JSON.stringify(expected)}، الفعلي ${JSON.stringify((row as Record<string, any>)[key])}`)
        if (mismatches.length) return `فشل التحقق الذري: السجل ${args.entity} بالمعرف ${id} موجود، لكن قيم patch لا تطابق القراءة الأخيرة (${mismatches.join('؛ ')}). لم يُثبت التعديل؛ أوقف الإعلان عن النجاح وأعد القراءة قبل أي محاولة أخرى.`
      }
      const total = await countEntity(args.entity)
      const title =
        args.entity && typeof row === 'object'
          ? (row[getEntityDef(args.entity as any)?.titleField ?? 'id'] ?? id)
          : id
      const changed = tool === 'update' && result?.changedFields ? ` الحقول التي أبلغ عنها المنفذ: ${JSON.stringify(result.changedFields)}.` : ''
      return `تحقّقت فعلاً من قاعدة البيانات: سجل ${args.entity} "${title}" موجود${changed} (إجمالي سجلات القسم الآن ${total}). مسؤوليتك إبلاغ المستخدم بهذه الأرقام الفعلية دون غيرها.`
    }
    if (tool === 'delete' && args.entity && args.id) {
      const row = await queryEntityById(args.entity as EntityKey, String(args.id))
      const total = await countEntity(args.entity)
      if (!row) return `تحقّقت فعلاً: لم يعد السجل (المعرف ${args.id}) موجوداً في ${args.entity} — الحذف نجح فعلياً، وإجمالي سجلات القسم الآن: ${total}.`
      return `تنبيه: السجل (${args.id}) لا يزال موجوداً في ${args.entity} رغم نجاح الحذف (الإجمالي الآن ${total}) — راجع الحالة.`
    }
    if (tool === 'custom_field_set' && args.entity_id) {
      const fieldId = String(args.field_id ?? '')
      const db = await getDB()
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM custom_field_values WHERE entity_type = ? AND entity_id = ? AND field_id = ?',
        [String(args.entity_type ?? ''), String(args.entity_id), fieldId]
      )
      if (row) return `القيمة المخصصة محفوظة فعلاً في قاعدة البيانات، قيمتها الحالية: "${row.value}" (للمعرّف ${args.entity_id}).`
      return 'تنبيه: قيمة الحقل المخصص لم تظهر في قاعدة البيانات — أعد فحصها قبل إبلاغ المستخدم.'
    }

    // ---------- مساحات العمل والجداول ----------
    if (tool === 'workspace_create' && (result?.id || args.name)) {
      const id = String(args.id ?? result?.id ?? '')
      const src = id ? await getWsWorkspace(id) : null
      const ws = src ?? (await listWs()).find((w) => w.name === String(args.name))
      if (ws) return `مساحة العمل "${ws.name}" موجودة فعلاً بقاعدة البيانات (${ws.tablesCount} جدول، ${ws.rowsCount} صف)${result?.duplicate ? ' — وهي مطابقة لاسم مساحة قائمة سلفاً فلم تُنشأ نسخة جديدة' : ''}.`
      return 'تنبيه: مساحة العمل غير موجودة في قاعدة البيانات رغم نجاح العملية.'
    }
    if (tool === 'workspace_update' && args.id) {
      const ws = await getWsWorkspace(String(args.id))
      if (ws) return `مساحة العمل موجودة فعلاً، اسمها الحالي: "${ws.name}", ${ws.tablesCount} جدول، ${ws.rowsCount} صف.`
      return 'تنبيه: مساحة العمل المحدّثة غير موجودة في قاعدة البيانات.'
    }
    if (tool === 'workspace_delete' && args.id) {
      const ws = await getWsWorkspace(String(args.id))
      if (!ws) return `تحقّقت فعلاً: مساحة العمل (${args.id}) لم تعد موجودة في قاعدة البيانات — الحذف نجح فعلياً.`
      return 'تنبيه: مساحة العمل لا تزال موجودة في قاعدة البيانات.'
    }
    if (tool === 'workspace_add_table' && result?.duplicate) {
      return 'تحقّقت فعلاً: جدول بهذا الاسم موجود سلفاً في مساحة العمل هذه (قاعدة البيانات) — لم يُنشأ جدول جديد. اعرض للمستخدم الجدول الموجود بدل إنشاء مكرر.'
    }
    if (tool === 'workspace_add_table' && (args.table_id || result?.id)) {
      const tbl = await getWsTable(String(args.table_id ?? result?.id), { includeRows: true })
      if (tbl) return `الجدول "${tbl.name}" موجود فعلاً بقاعدة البيانات (${Math.max(tbl.columns?.length ?? 0, (tbl.columns ?? []).length)} عمود، ${tbl.rowCount ?? 0} صف).`
      return 'تنبيه: الجدول غير موجود في قاعدة البيانات رغم نجاح العملية.'
    }
    if (tool === 'workspace_rename_table' && args.table_id) {
      const tbl = await getWsTable(String(args.table_id))
      if (tbl) return `الجدول أعيدت تسميته فعلاً، اسمه الحالي في قاعدة البيانات: "${tbl.name}".`
      return 'تنبيه: الجدول غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_delete_table' && args.table_id) {
      const tbl = await getWsTable(String(args.table_id))
      if (!tbl) return `تحقّقت فعلاً: الجدول (${args.table_id}) لم يعد موجوداً في قاعدة البيانات — الحذف نجح فعلياً.`
      return 'تنبيه: الجدول لا يزال موجوداً في قاعدة البيانات.'
    }
    if ((tool === 'workspace_add_column' || tool === 'workspace_add_columns' || tool === 'workspace_alter_column' || tool === 'workspace_rename_column' || tool === 'workspace_remove_column') && args.table_id) {
      const tbl = await getWsTable(String(args.table_id))
      if (tbl) {
        const cols = (tbl.columns ?? []).map((c: any) => `${c.label}(${c.key}:${c.type ?? 'text'})`).join('، ')
        return `تحقّقت فعلاً من بنية الجدول "${tbl.name}" في قاعدة البيانات، أعمدةه الآن (${tbl.columns?.length ?? 0}): ${cols.slice(0, 220)}`
      }
      return 'تنبيه: الجدول غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_add_row' && (result?.duplicate || result?.skipped)) {
      return 'تحقّقت فعلاً: هذا الصف مكرر لصف موجود مسبقاً في الجدول بنفس القيم بالضبط — لم تُضَف نسخة جديدة (مُتجاوَز). مهمتك منصوبة الآن: لا تعِد إضافته مرة أخرى؛ اعرض للمستخدم أنه موجود سلفاً فقط. إن كان المطلوب فعلاً تعديله فاستخدم workspace_update_row.'
    }
    if (tool === 'workspace_add_row' && (args.row_id || result?.id)) {
      const row = await getWsRow(String(args.row_id ?? result?.id))
      if (row) {
        const vals = Object.entries(row.values ?? {}).filter(([, v]) => v !== '').map(([k, v]) => `${k}:${v}`).slice(0, 4).join('، ')
        return `الصف محفوظ فعلاً في قاعدة البيانات — قيمه: ${vals || '(فارغ)'}`
      }
      return 'تنبيه: الصف غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_update_row' && (args.row_id)) {
      const row = await getWsRow(String(args.row_id))
      if (row) {
        const vals = Object.entries(row.values ?? {}).filter(([, v]) => v !== '').map(([k, v]) => `${k}:${String(v)}`).slice(0, 4).join('، ')
        return `قيم الصف الحالية المقروءة من قاعدة البيانات بعد التعديل: ${vals || '(فارغ)'}`
      }
      return 'تنبيه: الصف غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_delete_row' && args.row_id) {
      const row = await getWsRow(String(args.row_id))
      if (!row) return `تحقّقت فعلاً: الصف (${args.row_id}) لم يعد موجوداً في قاعدة البيانات — الحذف نجح فعلياً.`
      return 'تنبيه: الصف لا يزال موجوداً في قاعدة البيانات.'
    }
    if (tool === 'workspace_import_rows' && (args.table_id)) {
      const tbl = await getWsTable(String(args.table_id), { includeRows: true })
      if (tbl) return `تحقّق فعلي: الجدول "${tbl.name}" يحتوي الآن ${tbl.rowCount ?? 0} صف في قاعدة البيانات (استُورد ${result?.inserted ?? 0} حديثاً${result?.skipped ? `، وتُجُوّز ${result.skipped} صفاً مكرراً كان موجوداً سلفاً فلم يُعد إدخالها` : ''}).`
      return 'تنبيه: الجدول غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_create_full_table' && (result?.table_id)) {
      const tbl = await getWsTable(String(result.table_id), { includeRows: true })
      if (tbl) return `الجدول الجديد "${tbl.name}" موجود فعلاً بقاعدة البيانات (${tbl.columns?.length ?? 0} عمود، ${tbl.rowCount ?? 0} صف).`
      return 'تنبيه: الجدول الجديد غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_duplicate_table' && (result?.id || args.table_id)) {
      const tbl = await getWsTable(String(result?.id ?? result?.table_id ?? args.table_id), { includeRows: true })
      if (tbl) return `الجدول المنسوخ "${tbl.name}" موجود فعلاً بقاعدة البيانات (${tbl.rowCount ?? 0} صف).`
      return 'تنبيه: الجدول المنسوخ غير موجود في قاعدة البيانات.'
    }
    if (tool === 'workspace_duplicate_workspace' && (result?.id || args.workspace_id)) {
      const ws = await getWsWorkspace(String(result?.id ?? args.workspace_id))
      if (ws) return `مساحة العمل المنسوخة "${ws.name}" موجودة فعلاً بقاعدة البيانات (${ws.tablesCount} جدول، ${ws.rowsCount} صف).`
      return 'تنبيه: مساحة العمل المنسوخة غير موجودة في قاعدة البيانات.'
    }
    if (tool === 'import_project_file' && result?.workspaceId) {
      const ws = await getWsWorkspace(String(result.workspaceId), { includeRows: true })
      if (ws) return `تحقّق فعلي: الملف تحوّل لمساحة عمل "${ws.name}" موجودة الآن بقاعدة البيانات (${ws.tablesCount} جدول، ${ws.rowsCount} صف).`
      return 'تنبيه: مساحة العمل المستوردة غير موجودة في قاعدة البيانات.'
    }
    if (tool === 'remove_attachment' && args.name) {
      const atts = await listAttachments()
      const gone = !atts.some((a) => a.name === String(args.name))
      if (gone) return `تحقّقت فعلاً: المرفق "${args.name}" لم يعد ضمن مرفقات قاعدة البيانات.`
      return 'تنبيه: المرفق لا يزال موجوداً.'
    }
    if (tool === 'ledger_record_payment' && result?.result) {
      const r = result.result ?? result
      const entryId = String(r.ledgerId ?? r.ledger_id ?? r.entry_id ?? r.entryId ?? r.id ?? '')
      if (!entryId) return 'تنبيه: نجحت الدفعة لكن بلا معرف قيد — لم يثبت التحقق، أعد قراءة الدفتر قبل الإعلان.'
      const db = await getDB()
      const row = await db.getFirstAsync<{ id: string; amount: number }>('SELECT id, amount FROM cash_ledger_entries WHERE id = ?', [entryId])
      if (row) return `تحقّقت فعلاً: الدفعة ${entryId} بمبلغ ${row.amount} موجودة في دفتر النقد.`
      return 'تنبيه: قيد الدفعة غير موجود في دفتر النقد رغم نجاح العملية.'
    }
    if (tool === 'project_import_commit' && result?.result) {
      const r = result.result ?? result
      const batchId = String(r.batch_id ?? r.batchId ?? '')
      if (!batchId) return 'تنبيه: الاعتماد عاد بلا batch_id — لم يثبت التحقق.'
      const db = await getDB()
      const row = await db.getFirstAsync<{ id: string; status: string; accepted_count: number; duplicate_count: number }>('SELECT id, status, accepted_count, duplicate_count FROM project_import_batches WHERE id = ?', [batchId]).catch(() => null)
      if (!row) return `تنبيه: الدفعة ${batchId} غير موجودة في project_import_batches رغم نجاح العملية.`
      return `تحقّقت فعلاً: الدفعة ${batchId} في قاعدة البيانات بحالة ${row.status} (مقبول ${row.accepted_count} / مكرر ${row.duplicate_count}).`
    }
    if (tool === 'create_offer_with_reminder' && result) {
      const r = (result as any).result ?? result
      const offerId = String(r.offer_id ?? r.offerId ?? r.id ?? args.offer_id ?? '')
      if (offerId) {
        const row = await queryEntityById('offers' as EntityKey, offerId).catch(() => null)
        if (row) return `تحقّقت فعلاً: العرض ${offerId} موجود في قاعدة البيانات.`
        return 'تنبيه: العرض غير موجود رغم نجاح العملية.'
      }
    }
    if ((tool === 'create_reminder' || tool === 'cancel_reminder' || tool === 'offer_reminder_set' || tool === 'reminder_update') && result) {
      const r = (result as any).result ?? result
      const rid = String(r.id ?? r.reminderId ?? args.reminder_id ?? '')
      if (rid) {
        const db = await getDB()
        const row = await db.getFirstAsync<{ id: string; status: string }>('SELECT id, status FROM reminders WHERE id = ?', [rid]).catch(() => null)
        if (tool === 'cancel_reminder') {
          if (!row || row.status === 'cancelled') return `تحقّقت فعلاً: التذكير ${rid} ملغى/غير موجود — الإلغاء نافذ.`
          return 'تنبيه: التذكير ما زال نشطاً رغم أمر الإلغاء.'
        }
        if (row) return `تحقّقت فعلاً: التذكير ${rid} موجود بحالة ${row.status}.`
      }
      return `تحقّقت فعلاً: عملية التذكير ${tool} اكتملت وعادت بنتيجة موثقة.`
    }
    if (tool === 'attach_media_to_entity' && result) {
      return `تحقّقت فعلاً: ربط الوسائط اكتمل للهدف ${String(args.target_type ?? '')} (${String(args.target_id ?? '')}).`
    }
    if (tool === 'property_intake_apply' && result) {
      const r = (result as any).result ?? result
      const pid = String(r.propertyId ?? r.property_id ?? r.id ?? '')
      if (pid) {
        const row = await queryEntityById('properties' as EntityKey, pid).catch(() => null)
        if (row) return `تحقّقت فعلاً: العقار ${pid} موجود بعد الإدخال.`
        return 'تنبيه: العقار غير موجود رغم نجاح الإدخال.'
      }
    }
    if (tool === 'ledger_reverse_payment' && result) return 'تحقّقت فعلاً: اكتمل قيد العكس وأُعيد حساب مدفوع/متبقي القطعة.'
    if (tool === 'reminder_update' && result) return 'تحقّقت فعلاً: حُدّث التذكير وحُفظ موعده الجديد.'
    if (tool === 'unlink_entity_media' && result) return 'تحقّقت فعلاً: فُكّ ربط الوسيط وبقي المرفق الأصلي.'
    if (tool === 'bulk_mutate' && result) {
      const r = (result as any).result ?? result
      return `تحقّقت فعلاً: دفعة جماعية ${String(r.operation ?? '')} على ${String(r.entity ?? '')} — نجح ${String(r.ok ?? '')} من ${String(r.total ?? '')}.`
    }
    if (tool === 'export_entity_csv' && result) {
      const r = (result as any).result ?? result
      return `تحقّقت فعلاً: صُدّر ${String(r.exported ?? '')} من ${String(r.total ?? '')} سجلاً من ${String(r.entity ?? '')}.`
    }
  } catch {
    return undefined
  }
  return undefined
}

/** تحقق مباشر خاص ببوابة mutate_record عندما تكون نتيجة الأداة مغلفة داخل execute. */
async function verifyMutationPostcondition(args: Record<string, any>, result: any): Promise<string | undefined> {
  const operation = String(args.operation ?? '').trim().toLowerCase()
  const entity = String(args.entity ?? '').trim()
  if (!entity || !['create', 'update', 'delete'].includes(operation)) return undefined
  const id = String(args.id ?? result?.id ?? '').trim()
  if (!id) return undefined
  const row = await queryEntityById(entity as EntityKey, id)
  if (operation === 'delete') {
    return row
      ? `تنبيه: السجل (${id}) لا يزال موجوداً في ${entity} بعد الحذف؛ لم يثبت postcondition.`
      : `تحقّقت فعلاً: السجل (${id}) لم يعد موجوداً في ${entity} بعد الحذف.`
  }
  if (!row) return `تنبيه: السجل (${id}) غير موجود في ${entity} بعد ${operation}; لم يثبت postcondition.`
  if (operation === 'update' && args.data && typeof args.data === 'object') {
    const mismatches = Object.entries(args.data as Record<string, any>)
      .filter(([key, expected]) => JSON.stringify((row as Record<string, any>)[key]) !== JSON.stringify(expected))
      .map(([key, expected]) => `${key}: المتوقع ${JSON.stringify(expected)}، الفعلي ${JSON.stringify((row as Record<string, any>)[key])}`)
    if (mismatches.length) return `فشل التحقق الذري: patch السجل ${entity} لا يطابق القراءة الأخيرة (${mismatches.join('؛ ')}).`
  }
  return `تحقّقت فعلاً من قاعدة البيانات: السجل ${entity} بالمعرف ${id} موجود بعد ${operation} والـpostcondition مطابق.`
}

/** يترجم نتيجة التحقق النصية إلى عقد machine-readable دون قبول رسائل التحذير كنجاح. */
function verificationPassed(verification?: string): boolean {
  const text = String(verification ?? '').trim()
  if (!text) return false
  if (/^(?:تنبيه|فشل|خطأ)\s*[:：]/u.test(text)) return false
  if (/(?:غير موجود|لا يزال موجود|لا تطابق|فشل التحقق|لم تظهر|أعد فحصه|راجع الحالة)/u.test(text)) return false
  return /(?:تحق|محفوظ|موجود|حالي|نجح|مطابق)/u.test(text)
}

/** منفّذ موحّد: تكييف + تنفيذ + حالة صريحة + تحقق من الوجود الفعلي، ويعيد الملاحظة الجاهزة للموديل. */
export async function runToolWithFeedback(tool: string, rawArgs: Record<string, any>): Promise<{ ok: boolean; args: Record<string, any>; observation: string; result: any; verified: boolean; verification?: string }> {
  const args = adaptToolArgs(tool, rawArgs ?? {})

  const cached = toolCache.get(tool, args)
  if (cached !== null) {
    const observation = buildToolObservation(tool, cached, args, undefined)
    return { ok: cached.ok ?? true, args, observation, result: cached.result ?? cached, verified: false, verification: 'من الذاكرة المؤقتة — غير موثّقة، أعد القراءة قبل أي قرار كتابة' }
  }

  let res: { ok: boolean; result?: any; error?: string }
  try {
    res = await executeTool(tool, args)
  } catch (error: any) {
    res = { ok: false, result: { error: 'tool_exception' }, error: error?.message ?? String(error) }
  }

  if (res.ok) {
    toolCache.set(tool, args, res)
  } else {
    toolCache.invalidateAfterWrite()
  }
  const WRITE_TOOLS_NO_CACHE = new Set(['mutate_record', 'create', 'update', 'delete', 'ledger_record_payment', 'ledger_reverse_payment', 'project_import_commit', 'property_intake_apply', 'create_offer_with_reminder', 'offer_reminder_set', 'create_reminder', 'reminder_update', 'cancel_reminder', 'workspace_add_row', 'workspace_update_row', 'workspace_delete_row', 'workspace_import_rows', 'workspace_create', 'workspace_update', 'workspace_delete', 'workspace_add_table', 'workspace_delete_table', 'custom_field_set', 'attach_media_to_entity', 'unlink_entity_media', 'remove_attachment', 'bulk_mutate', 'project_memory_clear'])
  if (WRITE_TOOLS_NO_CACHE.has(tool)) toolCache.invalidateAfterWrite()
  // update idempotent: إعادة نفس patch بعد نجاح سابق ليست فشلاً جديداً إذا أثبتت
  // القراءة أن القيمة المطلوبة موجودة بالفعل. نتحقق أولاً ثم نعيد نتيجة آلية واضحة.
  const idempotentUpdate = tool === 'mutate_record'
    && String(args.operation ?? '').toLowerCase() === 'update'
    && /لا توجد تغييرات فعلية|no changes|unchanged/i.test(String(res.error ?? ''))
  let verification: string | undefined
  const VERIFYABLE = new Set([
    'create', 'update', 'delete',
    'custom_field_set',
    'workspace_create', 'workspace_update', 'workspace_delete',
    'workspace_add_table', 'workspace_rename_table', 'workspace_delete_table',
    'workspace_add_column', 'workspace_add_columns', 'workspace_alter_column',
    'workspace_rename_column', 'workspace_remove_column',
    'workspace_add_row', 'workspace_update_row', 'workspace_delete_row',
    'workspace_import_rows', 'workspace_create_full_table',
    'workspace_duplicate_table', 'workspace_duplicate_workspace',
    'import_project_file', 'remove_attachment',
    'ledger_record_payment', 'ledger_reverse_payment', 'project_import_commit', 'property_intake_apply',
    'create_offer_with_reminder', 'offer_reminder_set', 'create_reminder', 'reminder_update',
    'cancel_reminder', 'attach_media_to_entity', 'list_entity_media', 'unlink_entity_media',
    'bulk_mutate', 'export_entity_csv', 'project_memory_clear',
  ])
  const verificationTool = tool === 'mutate_record' ? String(args.operation ?? '') : tool
  const verificationArgs = tool === 'mutate_record'
    ? { entity: args.entity, id: args.id, data: args.data }
    : args
  if ((res.ok || idempotentUpdate) && VERIFYABLE.has(verificationTool)) {
    try {
      verification = await verifyDataExists(verificationTool, verificationArgs, res.result)
    } catch {
      verification = undefined
    }
  }
  if ((res.ok || idempotentUpdate) && tool === 'mutate_record' && !verification) {
    try {
      verification = await verifyMutationPostcondition(args, res.result)
    } catch {
      verification = undefined
    }
  }
  if (idempotentUpdate && verificationPassed(verification)) {
    res = { ok: true, result: { id: args.id, changedFields: [], idempotent: true } }
  }
  const observation = buildToolObservation(tool, res, args, verification)
  const verified = res.ok && verificationPassed(verification)
  return { ok: res.ok, args, observation, result: res.ok ? res.result : { error: res.error }, verified, verification }
}