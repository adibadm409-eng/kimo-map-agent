import { ENTITY_LABELS } from '../agent'

/**
 * تسميات عربية لأدوات الوكيل تُعرض للمستخدم في الواجهة بدل الأسماء التقنية
 * الإنجليزية، وعبارات مراحل التنفيذ بلغة يفهمها المستخدم (يتم الآن... → تم...)
 * بدل إظهار الرموز والأكواد الداخلية.
 */

export const TOOL_ARABIC: Record<string, string> = {
  execute: 'تنفيذ عملية',
  ask_user: 'سؤال المستخدم',
  request_confirmation: 'طلب موافقة',
  generate_file: 'توليد ملف',
  search_sessions: 'البحث في المحادثات',
  undo_last: 'التراجع عن آخر عملية',
  catalog: 'مراجعة دليل الأقسام',

  list_entities: 'استعراض الكيانات',
  query: 'البحث في البيانات',
  get: 'جلب سجل',
  create: 'إنشاء سجل',
  update: 'تعديل سجل',
  delete: 'حذف سجل',
  project_tree: 'تحليل شجرة المشروع',
  project_financials: 'التحليل المالي للمشروع',
  installment_schedule: 'جدولة التقسيط',
  buyer_summary: 'ملخص المشترين',
  payment_ledger: 'دفتر الأقساط',
  dashboard_kpis: 'لوحة المؤشرات',
  search_everything: 'البحث الشامل',
  custom_field_set: 'تعيين حقل مخصص',

  list_workspaces: 'قائمة مساحات العمل',
  workspace_get: 'عرض مساحة العمل',
  workspace_create: 'إنشاء مساحة عمل',
  workspace_update: 'تحديث مساحة العمل',
  workspace_delete: 'حذف مساحة العمل',
  workspace_add_table: 'إضافة جدول',
  workspace_rename_table: 'إعادة تسمية جدول',
  workspace_delete_table: 'حذف جدول',
  workspace_add_column: 'إضافة عمود',
  workspace_rename_column: 'إعادة تسمية عمود',
  workspace_remove_column: 'حذف عمود',
  workspace_add_row: 'إضافة صف',
  workspace_update_row: 'تعديل صف',
  workspace_delete_row: 'حذف صف',
  workspace_import_rows: 'استيراد صفوف',
  workspace_add_columns: 'إضافة أعمدة',
  workspace_alter_column: 'تعديل عمود',
  workspace_create_full_table: 'إنشاء جدول متكامل',
  workspace_duplicate_table: 'نسخ جدول',
  workspace_duplicate_workspace: 'نسخ مساحة عمل',
  list_attachments: 'قائمة المرفقات',
  read_uploaded_file: 'معاينة الملف',
  import_project_file: 'استيراد المشروع',
  remove_attachment: 'حذف مرفق',

  list_generated_files: 'قائمة الملفات المولّدة',
  review_generated_file: 'مراجعة الملف المولّد',

  audit_log_query: 'سجل التدقيق',
  audit_log_summary: 'إحصائيات التدقيق',
}

const WRITE_TOOLS = new Set([
  'create',
  'update',
  'delete',
  'custom_field_set',
  'workspace_create',
  'workspace_update',
  'workspace_add_table',
  'workspace_rename_table',
  'workspace_delete_table',
  'workspace_add_column',
  'workspace_rename_column',
  'workspace_remove_column',
  'workspace_add_row',
  'workspace_update_row',
  'workspace_delete_row',
  'workspace_import_rows',
  'import_project_file',
  'remove_attachment',
])

/** تسمية أداة بالعربية (بدون "جاري..."). */
export function toolLabel(name: string): string {
  return TOOL_ARABIC[name] ?? 'خطوة مساعدة'
}

/** اسم الكيان بالعربية من وسائط الأداة (entity أو entity_type). */
function entityLabelOfArgs(args?: Record<string, any>): string {
  if (!args || typeof args !== 'object') return ''
  const e = typeof args.entity === 'string' && args.entity ? args.entity : undefined
  if (e) return (ENTITY_LABELS as Record<string, string>)[e] || e
  const et = typeof args.entity_type === 'string' && args.entity_type ? args.entity_type : undefined
  if (et) return (ENTITY_LABELS as Record<string, string>)[et] || et
  return ''
}

/** العنوان البشري لبطاقة خطوة دائمة: "إنشاء مشروع" / "إضافة جدول" / "استيراد صفوف"... */
export function stepCardTitle(tool: string, args?: Record<string, any>): string {
  const a = args && typeof args === 'object' ? args : {}
  switch (tool) {
    case 'create': {
      const label = entityLabelOfArgs(a)
      const isProject = label && /مشروع|بلوك|قطعة/.test(label)
      return isProject ? `إنشاء ${label}` : `إضافة ${label || 'سجل'}`
    }
    case 'update':
      return `تعديل ${entityLabelOfArgs(a) || 'سجل'}`
    case 'delete':
      return `حذف ${entityLabelOfArgs(a) || 'سجل'}`
    case 'query':
      return `البحث في ${entityLabelOfArgs(a) || 'البيانات'}`
    case 'get':
      return `جلب تفاصيل ${entityLabelOfArgs(a) || 'سجل'}`
    case 'custom_field_set':
      return 'حفظ حقل مخصص'
    case 'workspace_create':
      return 'إنشاء مشروع حر'
    case 'workspace_update':
      return 'تحديث مشروع حر'
    case 'workspace_delete':
      return 'حذف مشروع حر'
    case 'workspace_get':
      return 'فتح مشروع حر'
    case 'workspace_add_table':
      return 'إضافة جدول'
    case 'workspace_rename_table':
      return 'إعادة تسمية جدول'
    case 'workspace_delete_table':
      return 'حذف جدول'
    case 'workspace_add_column':
    case 'workspace_add_columns':
      return 'إضافة عمود'
    case 'workspace_rename_column':
      return 'إعادة تسمية عمود'
    case 'workspace_remove_column':
      return 'حذف عمود'
    case 'workspace_alter_column':
      return 'تعديل عمود'
    case 'workspace_add_row':
      return 'إدخال سجل'
    case 'workspace_update_row':
      return 'تعديل سجل'
    case 'workspace_delete_row':
      return 'حذف سجل'
    case 'workspace_import_rows':
      return 'استيراد صفوف'
    case 'workspace_create_full_table':
      return 'إنشاء جدول متكامل'
    case 'workspace_duplicate_table':
      return 'نسخ جدول'
    case 'workspace_duplicate_workspace':
      return 'نسخ مشروع حر'
    case 'import_project_file':
      return 'تحويل الملف إلى مشروع'
    case 'read_uploaded_file':
      return 'معاينة ملف مرفوع'
    case 'generate_file':
      return 'توليد ملف'
    case 'project_tree':
      return 'تحليل شجرة المشروع'
    case 'project_financials':
      return 'التحليل المالي للمشروع'
    case 'installment_schedule':
      return 'جدولة التقسيط'
    case 'buyer_summary':
      return 'ملخص المشترين'
    case 'payment_ledger':
      return 'دفتر الأقساط'
    case 'dashboard_kpis':
      return 'لوحة المؤشرات'
    case 'data_snapshot':
      return 'قراءة لقطة البيانات'
    case 'search_everything':
      return 'بحث شامل'
    case 'search_sessions':
      return 'البحث في المحادثات'
    case 'audit_log_query':
      return 'سجل التدقيق'
    case 'audit_log_summary':
      return 'إحصائيات التدقيق'
    case 'list_workspaces':
      return 'استعراض المشاريع الحرة'
    case 'list_attachments':
      return 'استعراض المرفقات'
    case 'remove_attachment':
      return 'حذف مرفق'
    case 'undo_last':
      return 'التراجع عن آخر عملية'
    case 'catalog':
    case 'list_entities':
      return 'مراجعة دليل الأقسام'
    default:
      return TOOL_ARABIC[tool] ?? 'خطوة مساعدة'
  }
}

/** تفاصيل بشرية مختصرة للبطاقة: اسم العنصر الذي تعامل معه الوكيل. */
export function stepCardDetail(tool: string, args?: Record<string, any>): string {
  const a = args && typeof args === 'object' ? args : {}
  const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : ''
  const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim() : ''
  const rowName = a.row && typeof a.row === 'object' ? Object.values(a.row as Record<string, any>).filter((v) => v != null && v !== '').join(' — ').slice(0, 60) : ''
  const tableName = typeof a.table_name === 'string' && a.table_name.trim() ? a.table_name.trim() : ''
  switch (tool) {
    case 'workspace_create':
    case 'import_project_file':
      return name ? `«${name.slice(0, 40)}»` : ''
    case 'workspace_add_table':
      return name ? `«${name.slice(0, 40)}»` : ''
    case 'workspace_add_row':
      return rowName ? `«${rowName}»` : ''
    case 'workspace_import_rows':
      return ''
    case 'workspace_add_columns':
      return Array.isArray(a.columns) && a.columns.length ? `${a.columns.length} أعمدة` : ''
    case 'create': {
      const label = entityLabelOfArgs(a)
      const n = typeof a.data?.name === 'string' && a.data.name.trim() ? a.data.name.trim() : name
      return label ? `${label}${n ? ` «${n.slice(0, 40)}»` : ''}` : n ? `«${n.slice(0, 40)}»` : ''
    }
    case 'query': {
      const label = entityLabelOfArgs(a)
      const q = typeof a.search === 'string' && a.search.trim() ? `بحث عن «${a.search.trim().slice(0, 40)}»` : ''
      return [label, q].filter(Boolean).join(' — ')
    }
    case 'generate_file':
      return name ? `«${name.slice(0, 40)}» (${a.format ?? ''})` : ''
    case 'custom_field_set':
      return ''
    case 'update': {
      const label = entityLabelOfArgs(a)
      return label || ''
    }
    default:
      return ''
  }
}

/** نص نتيجة مختصر بشري يعرض تحت عنوان البطاقة (بدون معرفات تقنية مكشوفة). */
export function stepCardResult(tool: string, result: any): string {
  if (result == null) return 'تم بنجاح.'
  if (typeof result === 'string') {
    const s = result.trim()
    if (s.includes('[فشل]')) {
      const rest = s.replace(/\[فشل\][\s:]*/, '').trim()
      return `تعذّر: ${(rest || 'حدث خطأ أثناء التنفيذ').slice(0, 90)}`
    }
    if (s.includes('[نجاح]')) return s.replace(/\[نجاح\][\s:]*/, '').trim().slice(0, 90)
    if (s.includes('[تحقق]')) return s.replace(/\[تحقق\][\s:]*/, '').trim().slice(0, 90)
    return s.length > 90 ? `${s.slice(0, 90)}…` : s
  }
  if (typeof result === 'number' || typeof result === 'boolean') return 'تم بنجاح.'
  if (typeof result === 'object') {
    if (result.ok === false || result.error) return `تعذّر: ${String(result.error ?? '').slice(0, 90)}`
    if (result.duplicate) return 'البيانات موجودة سلفاً — لم تُضف نسخة مكررة.'
    if (tool === 'workspace_import_rows') return `تم إدخال ${result.inserted ?? 0} سجل بنجاح${result.skipped ? `، وتجاهلت ${result.skipped} مكرراً` : ''}.`
    if (tool === 'workspace_add_columns') return `تمت إضافة ${result.added ?? 0} عمود.`
    if (tool === 'workspace_create_full_table') return `تم إنشاء الجدول ${result.inserted != null ? `مع ${result.inserted} سجل مبدئي` : ''}.`
    if (tool === 'query') {
      const rows = Array.isArray(result.rows) ? result.rows : []
      const total = result.total ?? rows.length
      return `تم العثور على ${total} نتيجة.`
    }
    if (tool === 'create') return 'تم الإنشاء بنجاح واعتماده في قاعدة البيانات.'
    if (tool === 'update') return 'تم التعديل وحفظه بنجاح.'
    if (tool === 'workspace_create' || tool === 'import_project_file') return 'تم الإنشاء — يمكنك فتحه من البطاقة أدناه.'
  }
  return 'تم بنجاح.'
}

/** ملصق بطاقة الفتح حسب نوع الهدف (مساحة عمل/مشروع/عميل...). */
export function linkCardLabel(kind: string): string {
  switch (kind) {
    case 'workspace':
      return 'فتح مشروع الحر'
    case 'project':
      return 'فتح المشروع'
    case 'block':
      return 'فتح البلوك'
    case 'plot':
      return 'فتح القطعة'
    case 'client':
      return 'فتح ملف العميل'
    case 'property':
      return 'فتح العقار'
    case 'offer':
      return 'فتح العرض'
    case 'waypoint':
      return 'فتح النقطة'
    default:
      return 'فتح'
  }
}

/** رد فوري عند استلام طلب المستخدم — يبدد الصمت ويؤكد التفاعل قبل بدء التنفيذ. */
export function ackPhrase(raw: string): string {
  const t = String(raw ?? '').trim()
  const asksFile = /(ملف|إكسل|Excel|Word|ورود|PDF|تقرير|جدول)/i.test(t) && /(ولّد|أنشئ|اعمل|جهز|اكتب)/i.test(t)
  if (asksFile) return 'وصلني طلبك. سأجمع البيانات وأولّد الملف لك الآن — سيظهر كبطاقة في المحادثة، وتابعني لحظة إنجازه.'
  if (/استيراد|رفع|قراءة الملف|اقرأ/.test(t)) return 'وصلني طلبك. أفتح الملف الآن لأفهم محتواه ثم أنفّذ ما يلزم — سأعود إليك بالتفصيل.'
  if (/أنشئ|أنشأ|اعمل مشروع|أضف|سجّل|أدخل|جدول/.test(t)) return 'وصلني طلبك. أبدأ الآن بالتنفيذ خطوة بخطوة وأتحقق من كل خطوة — سأؤكد لك النتيجة فور اكتمالها.'
  if (/تحليل|ملخص|إحصاء|راجع|قارن|احسب/.test(t)) return 'وصلني طلبك. أجمع البيانات وأحلّلها الآن — سأعرض عليك النتيجة منظمة.'
  return 'وصلني طلبك. أبدأ الآن في تنفيذه خطوة بخطوة، وسأحدثك لحظة إنجاز كل مرحلة.'
}

function entityLabelOf(args?: Record<string, any>): string {
  const e = args && typeof args.entity === 'string' ? args.entity : undefined
  return (e && (ENTITY_LABELS as Record<string, string>)[e]) || e || ''
}

/** وصف جارٍ للتنفيذ بالعربية (متوافق مع الإصدار السابق). */
export function toolProgressLabel(name: string, args?: Record<string, any>): string {
  return beginPhrase(name, args)
}

/** عبارة بدء تنفيذ أداة بلغة يفهمها المستخدم — تُعرض كسطر تقدم حي أثناء التنفيذ. */
export function beginPhrase(name: string, args?: Record<string, any>): string {
  const label = entityLabelOf(args)
  switch (name) {
    case 'catalog':
    case 'list_entities':
      return 'أراجع الآن دليل أقسام التطبيق وبياناته...'
    case 'query':
      return label ? `يتم الآن فتح ${label} والبحث داخله...` : 'يتم الآن البحث في البيانات...'
    case 'get':
      return label ? `يتم الآن جلب تفاصيل ${label}...` : 'يتم الآن جلب التفاصيل...'
    case 'project_tree':
      return 'يتم الآن فتح المشروع وتحليل بنيته (بلوكات وقطع)...'
    case 'project_financials':
      return 'يتم الآن فتح التحليل المالي للمشروع...'
    case 'installment_schedule':
      return 'يتم الآن جدولة أقساط القطعة...'
    case 'buyer_summary':
      return 'يتم الآن تجميع ملخص المشترين...'
    case 'payment_ledger':
      return 'يتم الآن بناء دفتر الأقساط...'
    case 'dashboard_kpis':
      return 'يتم الآن حساب المؤشرات العامة...'
    case 'search_everything':
      return 'يتم الآن البحث الشامل في كل أقسام التطبيق...'
    case 'create':
      return label ? `يتم الآن إنشاء ${label} جديد...` : 'يتم الآن الإنشاء...'
    case 'update':
      return label ? `يتم الآن تعديل ${label}...` : 'يتم الآن التعديل...'
    case 'delete':
      return 'يتم الآن تجهيز الحذف...'
    case 'custom_field_set':
      return 'يتم الآن حفظ الحقل المخصص...'
    case 'list_workspaces':
      return 'يتم الآن استعراض مساحات العمل...'
    case 'workspace_get':
      return 'يتم الآن فتح مساحة العمل...'
    case 'workspace_create':
      return 'يتم الآن إنشاء مساحة العمل...'
    case 'workspace_update':
      return 'يتم الآن تحديث مساحة العمل...'
    case 'workspace_delete':
      return 'يتم الآن تجهيز حذف مساحة العمل...'
    case 'workspace_add_table':
      return 'يتم الآن إضافة جدول إلى مساحة العمل...'
    case 'workspace_rename_table':
      return 'يتم الآن إعادة تسمية الجدول...'
    case 'workspace_delete_table':
      return 'يتم الآن تجهيز حذف الجدول...'
    case 'workspace_add_column':
      return 'يتم الآن إضافة العمود...'
    case 'workspace_rename_column':
      return 'يتم الآن إعادة تسمية العمود...'
    case 'workspace_remove_column':
      return 'يتم الآن حذف العمود...'
    case 'workspace_add_row':
      return 'يتم الآن إدخال الصف...'
    case 'workspace_update_row':
      return 'يتم الآن تعديل الصف...'
    case 'workspace_delete_row':
      return 'يتم الآن تجهيز حذف الصف...'
    case 'workspace_import_rows':
      return 'يتم الآن استيراد الصفوف...'
    case 'workspace_add_columns':
      return 'يتم الآن إضافة الأعمدة...'
    case 'workspace_alter_column':
      return 'يتم الآن تعديل العمود...'
    case 'workspace_create_full_table':
      return 'يتم الآن إنشاء الجدول ببياناته...'
    case 'workspace_duplicate_table':
      return 'يتم الآن نسخ الجدول...'
    case 'workspace_duplicate_workspace':
      return 'يتم الآن نسخ مساحة العمل...'
    case 'list_attachments':
      return 'يتم الآن استعراض المرفقات...'
    case 'read_uploaded_file':
      return 'يتم الآن فتح الملف وقراءة محتواه...'
    case 'import_project_file':
      return 'يتم الآن تحويل الملف إلى مشروع منظم...'
    case 'remove_attachment':
      return 'يتم الآن حذف المرفق...'
    case 'audit_log_query':
      return 'يتم الآن فتح سجل التدقيق والبحث فيه...'
    case 'audit_log_summary':
      return 'يتم الآن حساب إحصائيات سجل التدقيق...'
    case 'generate_file':
      return 'يتم الآن توليد الملف داخل التطبيق...'
    case 'search_sessions':
      return 'يتم الآن البحث في المحادثات السابقة...'
    case 'undo_last':
      return 'يتم الآن التراجع عن آخر عملية...'
    case 'ask_user':
      return 'أحتاج توضيحاً منك قبل المتابعة...'
    case 'request_confirmation':
      return 'أحتاج موافقتك قبل تنفيذ هذا الإجراء...'
    default:
      return 'يتم الآن تنفيذ الخطوة التالية...'
  }
}

/**
 * تلخيص نتيجة أداة جاهز للعرض بالعربية — يمنع ظهور JSON خام/أكواد برمجية
 * في رسائل النشاط الخاصة بالوكيل.
 */
export function summarizeToolResult(tool: string, result: any): string {
  if (result == null) return 'تمت العملية بنجاح.'
  if (typeof result === 'string') return result
  if (typeof result === 'number' || typeof result === 'boolean') return String(result)

  if (typeof result === 'object') {
    if ('error' in result && result.error) return String(result.error)

    if (tool === 'query') {
      const rows = Array.isArray(result.rows) ? result.rows : []
      const total = result.total ?? rows.length
      const label = result.entity_label ?? (result.entity ? String(result.entity) : '')
      const scope = label ? ` في ${label}` : ''
      const shown = total !== rows.length ? ` (عرض ${rows.length})` : ''
      let firstRow = ''
      if (rows.length) {
        const titleKey = Object.keys(rows[0]).find((k) => k === 'name' || k === 'plot_no' || k === 'title' || k.endsWith('_name') || k === 'no') ?? Object.keys(rows[0])[0]
        if (titleKey && typeof rows[0][titleKey] === 'string' && rows[0][titleKey].trim()) {
          firstRow = ` — مثل: ${rows[0][titleKey].trim().slice(0, 60)}`
        }
      }
      return `تم البحث${scope}: ${total} نتيجة${shown}${firstRow}`
    }
    if (tool === 'workspace_import_rows') {
      return `تم استيراد ${result.inserted ?? 0} صف بنجاح`
    }
    if (tool === 'list_workspaces' || tool === 'list_attachments' || tool === 'list_entities') {
      const arr = Array.isArray(result) ? result : []
      return `تم جلب القائمة (${arr.length} عنصر)`
    }
    if (tool === 'read_uploaded_file' || tool === 'import_project_file') {
      const text = tool === 'read_uploaded_file' ? result.text : null
      if (typeof text === 'string') return text.length > 280 ? `${text.slice(0, 280)}...` : text
    }
    if (typeof result.id !== 'undefined' && result.id !== '') {
      return `تم بنجاح — المعرف: ${result.id}`
    }
    if ((result.rows && Array.isArray(result.rows)) || Array.isArray(result)) {
      const arr = Array.isArray(result) ? result : result.rows
      return `تم الحصول على ${arr.length} سجل`
    }
    const flat = JSON.stringify(result)
    if (flat && flat.length <= 90) return flat
  }
  return 'تمت العملية بنجاح.'
}

/** عبارة اكتمال أداة بلغة يفهمها المستخدم مع لمحة عن الخطوة التالية (بطاقة النشاط). */
export function toolDonePhrase(name: string, result: any, args?: Record<string, any>): string {
  const label = entityLabelOf(args)
  if (typeof result === 'string') return result

  const total =
    result && typeof result === 'object'
      ? (result.total ?? (Array.isArray(result.rows) ? result.rows.length : null))
      : null
  const listCount =
    result && typeof result === 'object'
      ? Array.isArray(result)
        ? result.length
        : Array.isArray(result.rows)
          ? result.rows.length
          : null
      : null

  switch (name) {
    case 'catalog':
      return 'تمت مراجعة دليل الأقسام — سأستخدم القسم المناسب الآن.'
    case 'list_entities':
      return `تم استعراض أقسام التطبيق (${listCount ?? 0} قسم) — أحدد الآن أين أبحث...`
    case 'project_tree':
      return 'تم فتح المشروع وتحليل بنيته — يتم الآن البحث داخله وتجميع ما يلزم...'
    case 'project_financials':
      return 'تم فتح التحليل المالي وجمع فروقات القطع.'
    case 'installment_schedule':
      return 'تمت جدولة أقساط القطعة.'
    case 'buyer_summary':
      return 'تم تجميع ملخص المشترين المطلوب.'
    case 'payment_ledger':
      return 'تم بناء دفتر الأقساط.'
    case 'dashboard_kpis':
      return 'تم حساب المؤشرات العامة.'
    case 'search_everything':
      return total != null ? `اكتمل البحث الشامل (${total} نتيجة) — أغربل النتائج الآن...` : 'اكتمل البحث الشامل — أغربل النتائج الآن...'
    case 'query':
      return label
        ? `تم فتح ${label} والبحث داخله (${total ?? 0} نتيجة) — أتابع الآن التحليل والجمع...`
        : summarizeToolResult('query', result)
    case 'get':
      return label ? `تم جلب تفاصيل ${label}.` : 'تم جلب التفاصيل.'
    case 'create':
      return label ? `تم إنشاء ${label} بنجاح.` : 'تم الإنشاء بنجاح.'
    case 'update':
      return label ? `تم تعديل ${label}.` : 'تم التعديل.'
    case 'generate_file':
      return 'تم توليد الملف — يظهر في المحادثة كبطاقة، يمكنك فتحه أو مشاركته أو حفظه.'
    case 'list_workspaces':
      return `تم استعراض مساحات العمل (${listCount ?? 0}) — أحدد ما يلزم...`
    case 'workspace_get':
      return 'تم فتح مساحة العمل وقراءة محتواها.'
    case 'workspace_create':
      return 'تم إنشاء مساحة العمل.'
    case 'workspace_add_table':
      return 'تمت إضافة الجدول إلى مساحة العمل.'
    case 'workspace_add_column':
      return 'تمت إضافة العمود.'
    case 'workspace_add_row':
      return 'تم إدخال الصف.'
    case 'workspace_update_row':
      return 'تم تعديل الصف.'
    case 'workspace_import_rows':
      return `تم استيراد ${result?.inserted ?? 0} صف بنجاح.`
    case 'workspace_add_columns':
      return `تمت إضافة ${result?.added ?? 0} عمود دفعة واحدة.`
    case 'workspace_alter_column':
      return 'تم تعديل تعريف العمود وقيم صفوفه.'
    case 'workspace_create_full_table':
      return `تم إنشاء الجدول متكاملاً (${result?.inserted ?? 0} صف مبدئي).`
    case 'workspace_duplicate_table':
      return 'تم نسخ الجدول بهيكله وصفوفه.'
    case 'workspace_duplicate_workspace':
      return `تم نسخ مساحة العمل بالكامل (${result?.tables ?? 0} جدول).`
    case 'list_attachments':
      return `تم استعراض المرفقات (${listCount ?? 0}) — أحدد ما يلزم...`
    case 'read_uploaded_file':
      return 'تم فتح الملف وقراءة محتواه — يتم الآن الاستفادة منه...'
    case 'import_project_file':
      return 'تم تحويل الملف إلى مشروع منظم.'
    case 'audit_log_query':
      return `تم فتح سجل التدقيق (${result?.count ?? 0} عملية).`
    case 'audit_log_summary':
      return 'تم حساب إحصائيات سجل التدقيق.'
    case 'search_sessions':
      return 'تم البحث في المحادثات السابقة.'
    case 'undo_last':
      return 'تم التراجع عن آخر عملية.'
    default:
      return summarizeToolResult(name, result)
  }
}
