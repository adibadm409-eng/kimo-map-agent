import { ALL_ENTITIES, ENTITY_LABELS, getEntityDef, searchCatalog } from './catalog'
import { queryEntities, queryEntityById } from './query'
import { agentCreate, agentUpdate, agentDelete } from './crud'
import { getDB } from '../database/db'
import {
  projectTree,
  projectFinancials,
  installmentSchedule,
  buyerSummary,
  paymentLedger,
  dashboardKpis,
  reviewMyWork,
} from './analytics'
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createTable,
  renameTable,
  deleteTable,
  addColumn,
  renameColumn,
  removeColumn,
  createRow,
  updateRow,
  deleteRow,
  bulkInsertRows,
  findRowByValues,
  setColumnMeta,
  createFullTable,
  duplicateTable,
  duplicateWorkspace,
  listAttachments,
  filePreview,
  importProjectFile,
  removeAttachment,
} from '../database/workspace'
import { queryChangeLog, changeLogStats, dailyActorStats } from '../database/audit'
import { searchEntities, setCustomValue } from '../database/projects'
import { DOMAIN_TOOLS } from './domainTools'
import { getScreenCatalog } from './screenCatalog'
import type { EntityKey } from './catalog'

export interface ToolArg {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  description?: string
}

export interface ToolDef {
  name: string
  description: string
  args: ToolArg[]
  handler: (args: Record<string, any>) => Promise<Record<string, any> | Record<string, any>[] | null>
}

export const TOOLS: ToolDef[] = [
  ...DOMAIN_TOOLS,
  {
    name: 'app_screen_catalog',
    description: 'خريطة تشغيلية لكل شاشات التطبيق: الهدف، الكيانات، أدوات القراءة والكتابة، مستوى الخطر، سياسة التعديل الآمن، وأدوات التحقق. اقرأها قبل تنظيم أو تعديل بيانات شاشة غير معروفة.',
    args: [{ name: 'screen', type: 'string', description: 'معرف أو اسم الشاشة، أو اتركه فارغاً للدليل الكامل' }],
    handler: async (args) => ({ screens: getScreenCatalog(args.screen ? String(args.screen) : undefined) }),
  },
  {
    name: 'list_entities',
    description: 'قائمة بجميع الكيانات (الجداول) المدعومة في التطبيق مع وصفها بالعربية',
    args: [],
    handler: async () => {
      return ALL_ENTITIES.map((e) => ({
        entity: e.key,
        label: ENTITY_LABELS[e.key],
        table: e.table,
        title_field: e.titleField,
        has_custom_values: e.customFieldEntities ?? false,
        parent: e.parent ?? null,
        fields: e.fields.map((x) => ({
          name: x.name,
          label: x.label,
          type: x.type,
          searchable: x.searchable ?? false,
          filterable: x.filterable ?? false,
          sortable: x.sortable ?? false,
          values: x.values ?? null,
        })),
      }))
    },
  },
  {
    name: 'catalog',
    description:
      'دليل أقسام التطبيق: كل قسم (العقارات/العملاء/العروض/المشاهدات/الحملات/المشاريع/القطع/المالية/مساحات العمل/الملفات) مع بياناته وحقوله القابلة للبحث والفلاتر والقيم والعلاقات. اقرأه لتقرر ما إذا كان قسم يلزم مهمتك، أو لتتأكد من بنية كيان قبل الاستعلام عنه أو قبل الحفظ فيه.',
    args: [
      { name: 'section', type: 'string', description: 'اسم القسم أو الكيان (مثل: عقارات، عملاء، مشاريع، قطع، مالية، مساحات عمل، ملفات...) — أو اتركه فارغاً للدليل الكامل' },
      { name: 'query', type: 'string', description: 'بحث حر في الدليل بكلمة (اختياري)' },
    ],
    handler: async (args) => ({
      guide: searchCatalog(
        args.section ? String(args.section) : undefined,
        args.query ? String(args.query) : undefined
      ),
    }),
  },
  {
    name: 'preview_update',
    description: 'معاينة آمنة لتعديل سجل: تقرأ الحالة الحالية وتعرض الفرق المقترح دون أي كتابة. استخدمها قبل update في العقارات والعملاء والعروض والحملات وأي كيان غير مغطى بأداة مجال متخصصة.',
    args: [
      { name: 'entity', type: 'string', required: true },
      { name: 'id', type: 'string', required: true },
      { name: 'data', type: 'object', required: true, description: 'الحقول التي تريد تعديلها فقط' },
    ],
    handler: async (args) => {
      const entity = String(args.entity ?? '')
      const id = String(args.id ?? '')
      const data = args.data && typeof args.data === 'object' ? args.data as Record<string, any> : {}
      if (!entity || !id || Object.keys(data).length === 0) throw new Error('preview_update يتطلب كياناً ومعرفاً وحقول تعديل غير فارغة.')
      const current = await queryEntityById(entity as EntityKey, id)
      if (!current) throw new Error('السجل المطلوب غير موجود؛ لم تتم أي كتابة.')
      const before = current as Record<string, any>
      const changedFields = Object.keys(data).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(data[key]))
      return { entity, id, before, proposed: data, changedFields, noChanges: changedFields.length === 0 }
    },
  },
  {
    name: 'query',
    description: 'بحث متعدد الطبقات في أي كيان: فلاتر AND، نص حر، ترتيب، ترقيم صفحات، وقيم الحقول المخصصة',
    args: [
      { name: 'entity', type: 'string', required: true, description: 'اسم الكيان: properties|clients|offers|campaigns|viewings|waypoints|areas|projects|blocks|plots|plot_payments|custom_fields|custom_field_values' },
      { name: 'search', type: 'string', description: 'نص حر يبحث في الحقول القابلة للبحث (الاسم، الوصف، الحدود...) مثل: "قطعة 3"' },
      { name: 'filters', type: 'array', description: 'مصفوفة شروط: [{field, op, value, value2}] — op: eq|neq|contains|starts_with|ends_with|gt|gte|lt|lte|between|in|not_in|is_empty|not_empty' },
      { name: 'sort', type: 'object', description: 'مثال: {field:"created_at", dir:"desc"} — الحقل يجب أن يكون قابلاً للترتيب' },
      { name: 'limit', type: 'number', description: 'الحد الأقصى للنتائج (افتراضي 2000)' },
      { name: 'offset', type: 'number', description: 'إزاحة الترقيم' },
      { name: 'withCustomValues', type: 'boolean', description: 'اجلب قيم الحقول المخصصة للمشاريع/البلوكات/القطع (افتراضي true)' },
    ],
    handler: async (args) => {
      const spec = {
        entity: String(args.entity ?? ''),
        search: args.search ? String(args.search) : undefined,
        filters: args.filters as any,
        sort: args.sort as any,
        limit: args.limit ? Number(args.limit) : undefined,
        offset: args.offset ? Number(args.offset) : undefined,
        withCustomValues: args.withCustomValues !== false,
      }
      return await queryEntities(spec as any)
    },
  },
  {
    name: 'get',
    description: 'جلب سجل واحد بالمعرف مع قيم الحقول المخصصة وأسماء العلاقات المرتبطة',
    args: [
      { name: 'entity', type: 'string', required: true, description: 'اسم الكيان' },
      { name: 'id', type: 'string', required: true, description: 'معرف السجل' },
    ],
    handler: async (args) => {
      return await queryEntityById(args.entity as any, String(args.id))
    },
  },
  {
    name: 'create',
    description: 'إنشاء سجل جديد في أي كيان (يُعيد المعرف الجديد). لإنشاء بلوك وقطع: blocks.project_id+name (+ plots: قائمة قطع الاختيارية في data.plots). لإنشاء عدة قطع دفعة واحدة: plots.block_id+data.plots=[{plot_no,area_sqm,value,status}...] — تُنشأ كلها في استدعاء واحد، وإن وُجدت قطعة بنفس الرقم تُحدَّث بدل التكرار. إلزامي: كل قطعة ترسل بحقولها الكاملة حسب حالتها — plot_no + area_sqm + value + status (available/sold/installment)؛ وإن كانت مبيعة أو تقسيطاً فأضف buyer_name وbuyer_contact وsale_date وpaid_amount وremaining_amount و(للتقسيط) installment_type — لا تُرسل القيمة الإجمالية فقط، فالعدّادات (متاحة/مبيعة/تقسيط/المحصل/المتبقي) تُبنى من حقول كل قطعة',
    args: [
      { name: 'entity', type: 'string', required: true, description: 'اسم الكيان' },
      { name: 'data', type: 'object', description: 'القيم: {اسم_العمود: القيمة}. المطلوب: properties.name — clients.name — offers.property_id+client_id — projects.name — blocks.project_id+name (+data.plots لقطع فورية) — plots.block_id (+data.plots لعدة قطع دفعة) — plot_payments.plot_id+amount. إلزامي للقطع: كل عنصر في data.plots يُرسل كاملاً — plot_no, area_sqm, value, status (available|sold|installment) و(عند البيع/التقسيط) buyer_name, buyer_contact, sale_date, paid_amount, remaining_amount, installment_type' },
    ],
    handler: async (args) => {
      const data = (args.data && typeof args.data === 'object') ? { ...args.data } : {}
      for (const [k, v] of Object.entries(args)) {
        if (k !== 'entity' && k !== 'data' && v !== undefined) {
          if (data[k] === undefined) data[k] = v
        }
      }
      return await agentCreate({ entity: String(args.entity) as any, data })
    },
  },
  {
    name: 'update',
    description: 'تحديث سجل موجود (تعديل جزئي — أرسل الحقول المراد تغييرها فقط)',
    args: [
      { name: 'entity', type: 'string', required: true, description: 'اسم الكيان' },
      { name: 'id', type: 'string', required: true, description: 'معرف السجل' },
      { name: 'data', type: 'object', description: 'القيم الجديدة' },
    ],
    handler: async (args) => {
      const data = (args.data && typeof args.data === 'object') ? { ...args.data } : {}
      for (const [k, v] of Object.entries(args)) {
        if (k !== 'entity' && k !== 'id' && k !== 'data' && v !== undefined) {
          if (data[k] === undefined) data[k] = v
        }
      }
      return await agentUpdate({ entity: String(args.entity) as any, id: String(args.id), data })
    },
  },
  {
    name: 'delete',
    description: 'حذف سجل (حذف سلسلة للقطعة/البلوك/المشروع يمسح الأقساط والقيم المخصصة المرتبطة)',
    args: [
      { name: 'entity', type: 'string', required: true, description: 'اسم الكيان' },
      { name: 'id', type: 'string', required: true, description: 'معرف السجل' },
    ],
    handler: async (args) => {
      return await agentDelete({ entity: String(args.entity) as any, id: String(args.id) })
    },
  },
  {
    name: 'project_tree',
    description: 'شجرة مشروع كاملة: مشروع ← بلوكات ← قطع ← أقساط، مع إحصائيات (قيم، مدفوع، متبقي، فرق العمود عن السجل الفعلي)',
    args: [
      { name: 'project_id', type: 'string', required: true, description: 'معرف المشروع' },
    ],
    handler: async (args) => {
      return await projectTree(String(args.project_id))
    },
  },
  {
    name: 'project_financials',
    description: 'جدول مالي لكل قطعة في مشروع: القيمة، المدفوع (العمود)، المتبقي، مجموع الأقساط المسجلة، الفرق بين العمود والسجل، ونسبة التحصيل',
    args: [
      { name: 'project_id', type: 'string', required: true, description: 'معرف المشروع' },
    ],
    handler: async (args) => {
      return await projectFinancials(String(args.project_id))
    },
  },
  {
    name: 'installment_schedule',
    description: 'جدولة التقسيط لقطعة: دفعات متبقية مقسمة على نوع التقسيط (شهري/ربع سنوي/نصف سنوي/سنوي) مع مبلغ الدفعة التالية',
    args: [
      { name: 'plot_id', type: 'string', required: true, description: 'معرف القطعة' },
    ],
    handler: async (args) => {
      return await installmentSchedule(String(args.plot_id))
    },
  },
  {
    name: 'review_my_work',
    description: 'مراجعة تدقيقية ذاتية لأحدث ما نفّذه الوكيل: تقرأ آخر العمليات من سجل التدقيق للجلسة أو الفترة، وتتأكد من سلامة الروابط (منع البيانات اليتيمة)، وفروق عدّادات plot_count مع عدد القطع الفعلي، وفروق (مدفوع + متبقي) مع القيمة للقطع المبيعة/التقسيط، وتُرجع تقريراً منظماً بما تم وما تبقى أو يحتاج إصلاحاً — تُستدعى إلزامياً قبل إعلان إتمام أي مهمة كتابة متعددة الخطوات',
    args: [
      { name: 'session_id', type: 'string', required: false, description: 'معرف جلسة الوكيل (إن لم يُذكر يُراجع آخر 30 دقيقة)' },
      { name: 'project_id', type: 'string', required: false, description: 'معرف المشروع للتركيز على سلامة هذا المشروع فقط' },
      { name: 'minutes', type: 'number', required: false, description: 'نافذة الزمن بالدقائق لمراجعة آخر العمليات (افتراضي 30، أقصى 1440)' },
    ],
    handler: async (args) => {
      return await reviewMyWork({
        sessionId: args.session_id ? String(args.session_id) : undefined,
        projectId: args.project_id ? String(args.project_id) : undefined,
        minutes: args.minutes != null ? Number(args.minutes) : undefined,
      })
    },
  },
  {
    name: 'buyer_summary',
    description: 'ملخص لكل مشتري عبر كل المشاريع: عدد القطع، إجمالي القيمة، المدفوع، المتبقي — مرتبة بالأكثر متبقياً',
    args: [
      { name: 'buyer_query', type: 'string', description: 'اختياري: جزء من اسم المشتري للتصفية' },
    ],
    handler: async (args) => {
      return await buyerSummary(args.buyer_query ? String(args.buyer_query) : undefined)
    },
  },
  {
    name: 'payment_ledger',
    description: 'دفتر الأقساط: كل دفعة مع رقم القطعة والبلوك والمشروع — يمكن التصفية بالمشروع/البلوك/القطعة/الوسيلة/الفترة',
    args: [
      { name: 'project_id', type: 'string', description: 'تصفية بمشروع' },
      { name: 'block_id', type: 'string', description: 'تصفية ببلوك' },
      { name: 'plot_id', type: 'string', description: 'تصفية بقطعة' },
      { name: 'method', type: 'string', description: 'cash|bank' },
      { name: 'from_date', type: 'string', description: 'من تاريخ (YYYY-MM-DD)' },
      { name: 'to_date', type: 'string', description: 'إلى تاريخ (YYYY-MM-DD)' },
      { name: 'limit', type: 'number', description: 'الحد الأقصى (افتراضي 2000)' },
    ],
    handler: async (args) => {
      return await paymentLedger(args)
    },
  },
  {
    name: 'dashboard_kpis',
    description: 'لوحة مؤشرات شاملة: عدد السجلات في كل كيان + القيم المالية الإجمالية للقطع والأقساط',
    args: [],
    handler: async () => {
      return await dashboardKpis()
    },
  },
  {
    name: 'audit_log_query',
    description: 'الاستعلام في سجل التدقيق (التغييرات): كل عملية إنشاء/تعديل/حذف/استيراد/تراجع جرت على البيانات، مع من نفّذها (وكيل/مستخدم/نظام/تراجع)، والأداة، والملخص — تُستخدم للمراجعة وتقييم الأداء وتتبع من غيّر ماذا ومتى',
    args: [
      { name: 'action', type: 'string', description: 'create|update|delete|import|restore' },
      { name: 'scope', type: 'string', description: 'نطاق العملية: entity name (مثل projects/plots) أو workspace/workspace_table/workspace_row/attachment/custom_field_value' },
      { name: 'scope_id', type: 'string', description: 'معرف العنصر المتأثر' },
      { name: 'actor', type: 'string', description: 'من نفّذ: agent|user|system|undo' },
      { name: 'session_id', type: 'string', description: 'جلسة الوكيل' },
      { name: 'tool', type: 'string', description: 'الأداة المنفّذة (create/update/workspace_import_rows...)' },
      { name: 'from_date', type: 'number', description: 'من زمن (ميللي ثانية)' },
      { name: 'to_date', type: 'number', description: 'إلى زمن (ميللي ثانية)' },
      { name: 'search', type: 'string', description: 'بحث نصي في الملخص والنطاق والأداة' },
      { name: 'limit', type: 'number', description: 'الحد الأقصى (افتراضي 200، أقصى 2000)' },
      { name: 'offset', type: 'number', description: 'إزاحة الترقيم' },
    ],
    handler: async (args) => {
      const q: Record<string, any> = {}
      if (args.action) q.action = String(args.action)
      if (args.scope) q.scope = String(args.scope)
      if (args.scope_id) q.scopeId = String(args.scope_id)
      if (args.actor) q.actor = String(args.actor)
      if (args.session_id) q.sessionId = String(args.session_id)
      if (args.tool) q.tool = String(args.tool)
      if (args.from_date != null) q.fromDate = Number(args.from_date)
      if (args.to_date != null) q.toDate = Number(args.to_date)
      if (args.search) q.search = String(args.search)
      if (args.limit != null) q.limit = Number(args.limit)
      if (args.offset != null) q.offset = Number(args.offset)
      const entries = await queryChangeLog(q as any)
      return {
        count: entries.length,
        entries,
        stats: await changeLogStats({ fromDate: q.fromDate, toDate: q.toDate }),
        daily: await dailyActorStats(14),
      }
    },
  },
  {
    name: 'audit_log_summary',
    description: 'إحصائيات سجل التدقيق: عدد العمليات لكل نوع (إنشاء/تعديل/حذف/استيراد/تراجع) خلال فترة — لتقييم الأداء',
    args: [
      { name: 'from_date', type: 'number', description: 'من زمن (ميللي ثانية)' },
      { name: 'to_date', type: 'number', description: 'إلى زمن (ميللي ثانية)' },
    ],
    handler: async (args) => {
      const fromDate = args.from_date != null ? Number(args.from_date) : undefined
      const toDate = args.to_date != null ? Number(args.to_date) : undefined
      return {
        stats: await changeLogStats({ fromDate, toDate }),
        daily: await dailyActorStats(14),
      }
    },
  },
  {
    name: 'search_everything',
    description: 'بحث نصي شامل في مشاريع التطبيق (مشاريع+بلوكات+قطع) — يعيد تصنيفات منفصلة لكل نوع',
    args: [
      { name: 'query', type: 'string', required: true, description: 'النص المراد البحث عنه' },
    ],
    handler: async (args) => {
      return await searchEntities(String(args.query ?? ''))
    },
  },
  {
    name: 'custom_field_set',
    description: 'تعيين قيمة حقل مخصص لكيان (مشروع/بلوك/قطعة) — إضافة أو تحديث',
    args: [
      { name: 'entity_type', type: 'string', required: true, description: 'project|block|plot' },
      { name: 'entity_id', type: 'string', required: true, description: 'معرف الكيان' },
      { name: 'field_id', type: 'string', required: true, description: 'معرف الحقل المخصص' },
      { name: 'value', type: 'string', required: true, description: 'القيمة الجديدة' },
    ],
    handler: async (args) => {
      await setCustomValue(
        String(args.entity_type) as any,
        String(args.entity_id),
        String(args.field_id),
        String(args.value ?? '')
      )
      return { ok: true }
    },
  },
  {
    name: 'list_workspaces',
    description: 'قائمة مساحات العمل المرنة (مشاريع بجداول/أعمدة حرة) مع عدد الجداول والصفوف',
    args: [],
    handler: async () => listWorkspaces(),
  },
  {
    name: 'workspace_get',
    description: 'عرض مساحة عمل كاملة: جداولها وأعمدتها وصفوفها (include_rows: true يرسل كل الصفوف)',
    args: [
      { name: 'id', type: 'string', required: true, description: 'معرف مساحة العمل' },
      { name: 'include_rows', type: 'boolean', description: 'افتراضي false — يعيد القصات مع العمود row_counts فقط' },
    ],
    handler: async (args) => getWorkspace(String(args.id), { includeRows: args.include_rows === true }),
  },
  {
    name: 'workspace_create',
    description: 'إنشاء مساحة عمل مرنة من الصفر (مشروع حر) بجداول وأعمدة مخصصة غير محدودة. مثال: {name:"مشروع النخبة", tables:[{name:"القطع", columns:["رقم القطعة","المساحة","السعر","الحالة"]},{name:"المبيعات", columns:["القطعة","المشتري"]}]}',
    args: [
      { name: 'name', type: 'string', required: true, description: 'اسم المشروع/مساحة العمل' },
      { name: 'description', type: 'string', description: 'وصف مختصر' },
      { name: 'tables', type: 'array', description: 'جداول أولية: [{name, columns: ["رأس"] أو [{label, key?, type?: text|number|date|boolean|select}]}]' },
    ],
    handler: async (args) => {
      const name = String(args.name)
      const existing = await listWorkspaces()
      const dupWs = existing.find((w) => w.name.trim().toLowerCase() === name.trim().toLowerCase())
      if (dupWs) return { id: dupWs.id, name, duplicate: true }
      const id = await createWorkspace({ name, description: args.description ? String(args.description) : undefined })
      if (Array.isArray(args.tables)) {
        for (const t of args.tables) {
          const cols = Array.isArray(t?.columns) ? t.columns : []
          if (!t?.name) continue
          const tableId = await createTable(id, String(t.name), cols as any)
          void tableId
        }
      }
      return { id, name }
    },
  },
  {
    name: 'workspace_update',
    description: 'تحديث اسم/وصف مساحة عمل',
    args: [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    handler: async (args) => {
      await updateWorkspace(String(args.id), { name: args.name ? String(args.name) : undefined, description: args.description ? String(args.description) : undefined })
      return { ok: true, id: String(args.id) }
    },
  },
  {
    name: 'workspace_delete',
    description: 'حذف مساحة عمل كاملة بجداولها (يتطلب موافقة المستخدم قبل التنفيذ)',
    args: [{ name: 'id', type: 'string', required: true }],
    handler: async (args) => {
      await deleteWorkspace(String(args.id))
      return { ok: true, id: String(args.id) }
    },
  },
  {
    name: 'workspace_add_table',
    description: 'إضافة جدول داخل مساحة عمل بإنشاء أعمدة مرنة',
    args: [
      { name: 'workspace_id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true, description: 'اسم الجدول' },
      { name: 'columns', type: 'array', required: true, description: 'أسماء الأعمدة أو [{label, key, type}]' },
    ],
    handler: async (args) => {
      const workspaceId = String(args.workspace_id)
      const name = String(args.name)
      const ws = await getWorkspace(workspaceId)
      const dupTable = (ws?.tables ?? []).find((t: any) => t.name.trim().toLowerCase() === name.trim().toLowerCase())
      if (dupTable) return { id: dupTable.id, workspace_id: workspaceId, duplicate: true }
      const id = await createTable(workspaceId, name, args.columns as any)
      return { id, workspace_id: workspaceId }
    },
  },
  {
    name: 'workspace_rename_table',
    description: 'إعادة تسمية جدول',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
    ],
    handler: async (args) => {
      await renameTable(String(args.table_id), String(args.name))
      return { ok: true }
    },
  },
  {
    name: 'workspace_delete_table',
    description: 'حذف جدول بصفوفه (يتطلب موافقة المستخدم)',
    args: [{ name: 'table_id', type: 'string', required: true }],
    handler: async (args) => {
      await deleteTable(String(args.table_id))
      return { ok: true }
    },
  },
  {
    name: 'workspace_add_column',
    description: 'إضافة عمود جديد لجدول',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'column', type: 'object', required: true, description: '{label, key?, type?}' },
    ],
    handler: async (args) => {
      await addColumn(String(args.table_id), args.column as any)
      return { ok: true }
    },
  },
  {
    name: 'workspace_rename_column',
    description: 'إعادة تسمية عمود (المفتاح والملصق)',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'key', type: 'string', required: true, description: 'المفتاح الحالي' },
      { name: 'new_key', type: 'string', description: 'المفتاح الجديد (إن تغيّر)' },
      { name: 'new_label', type: 'string', description: 'الملصق الجديد' },
    ],
    handler: async (args) => {
      await renameColumn(String(args.table_id), String(args.key), args.new_key ? String(args.new_key) : String(args.key), args.new_label ? String(args.new_label) : undefined)
      return { ok: true }
    },
  },
  {
    name: 'workspace_remove_column',
    description: 'حذف عمود وقيمه من كل الصفوف',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'key', type: 'string', required: true },
    ],
    handler: async (args) => {
      await removeColumn(String(args.table_id), String(args.key))
      return { ok: true }
    },
  },
  {
    name: 'workspace_add_row',
    description: 'إضافة صف جديد بجدول (القيم مفاتيح الأعمدة)',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'row', type: 'object', required: true, description: '{column_key: value}' },
    ],
    handler: async (args) => {
      const tableId = String(args.table_id)
      const row = (args.row ?? {}) as Record<string, any>
      // قبل الإضافة نتحقق مسبقاً إن كان الصف موجوداً بنفس القيم — نعلّم النتيجة
      // صراحةً بأنه مكرر حتى يدرك الوكيل ذلك من الملاحظة ولا يعيد إدخاله.
      const dupId = await findRowByValues(tableId, row)
      if (dupId) return { id: dupId, table_id: tableId, skipped: 1, duplicate: true }
      const id = await createRow(tableId, row)
      return { id, table_id: tableId }
    },
  },
  {
    name: 'workspace_update_row',
    description: 'تحديث قيم صف موجود',
    args: [
      { name: 'row_id', type: 'string', required: true },
      { name: 'row', type: 'object', required: true },
    ],
    handler: async (args) => {
      await updateRow(String(args.row_id), args.row as any)
      return { ok: true }
    },
  },
  {
    name: 'workspace_delete_row',
    description: 'حذف صف (يتطلب موافقة المستخدم)',
    args: [{ name: 'row_id', type: 'string', required: true }],
    handler: async (args) => {
      await deleteRow(String(args.row_id))
      return { ok: true }
    },
  },
  {
    name: 'workspace_import_rows',
    description: 'استيراد دفعة صفوف لجدول: مصفوفة كائنات أو صفوف رأسية',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'rows', type: 'array', required: true, description: '[{key:value}, ...] أو [[v1,v2], ...]' },
    ],
    handler: async (args) => {
      const res = await bulkInsertRows(String(args.table_id), (args.rows ?? []) as any)
      return { inserted: res.inserted, skipped: res.skipped ?? 0, row_ids: res.rowIds }
    },
  },
  {
    name: 'workspace_add_columns',
    description: 'إضافة عدة أعمدة دفعة واحدة لجدول',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'columns', type: 'array', required: true, description: '[{label, key?, type?}, ...] — type: text|number|date|boolean|options' },
    ],
    handler: async (args) => {
      const cols = (args.columns ?? []) as any[]
      for (const c of cols) await addColumn(String(args.table_id), c as any)
      return { added: cols.length }
    },
  },
  {
    name: 'workspace_alter_column',
    description: 'تعديل تعريف عمود: مفتاحه أو ملصقه أو نوعه (مع ترحيل قيم الصفوف تلقائياً)',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'key', type: 'string', required: true, description: 'مفتاح العمود الحالي' },
      { name: 'new_key', type: 'string', description: 'المفتاح الجديد إن تغيّر' },
      { name: 'new_label', type: 'string', description: 'الملصق الجديد' },
      { name: 'type', type: 'string', description: 'النوع الجديد: text|number|date|boolean|options' },
    ],
    handler: async (args) => {
      await setColumnMeta(String(args.table_id), String(args.key), {
        new_key: args.new_key ? String(args.new_key) : undefined,
        new_label: args.new_label ? String(args.new_label) : undefined,
        type: args.type ? String(args.type) : undefined,
      })
      return { ok: true }
    },
  },
  {
    name: 'workspace_create_full_table',
    description: 'إنشاء جدول متكامل دفعة واحدة: الاسم + الأعمدة + البيانات الأولية — الأسرع لبناء جداول كاملة',
    args: [
      { name: 'workspace_id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true, description: 'اسم الجدول' },
      { name: 'columns', type: 'array', required: true, description: '[{label, key?, type?}, ...] أو ["الاسم", "الهاتف"]' },
      { name: 'rows', type: 'array', description: '[{key:value}, ...] بيانات أولية اختيارية' },
    ],
    handler: async (args) => {
      const res = await createFullTable(String(args.workspace_id), String(args.name), (args.columns ?? []) as any, (args.rows ?? undefined) as any)
      return { table_id: res.tableId, inserted: res.inserted }
    },
  },
  {
    name: 'workspace_duplicate_table',
    description: 'نسخ جدول كامل (هيكله وصفوفه) إلى جدول جديد بنفس المساحة',
    args: [
      { name: 'table_id', type: 'string', required: true },
      { name: 'name', type: 'string', description: 'اسم الجدول الجديد (افتراضياً: الاسم + نسخة)' },
    ],
    handler: async (args) => {
      return duplicateTable(String(args.table_id), args.name ? String(args.name) : undefined)
    },
  },
  {
    name: 'workspace_duplicate_workspace',
    description: 'نسخ مساحة عمل كاملة بكل جداولها وصفوفها إلى مساحة جديدة',
    args: [
      { name: 'workspace_id', type: 'string', required: true },
      { name: 'name', type: 'string', description: 'اسم المساحة الجديدة (افتراضياً: الاسم + نسخة)' },
    ],
    handler: async (args) => {
      return duplicateWorkspace(String(args.workspace_id), args.name ? String(args.name) : undefined)
    },
  },
  {
    name: 'list_attachments',
    description: 'قائمة الملفات المرفوعة في كل الجلسات (Excel/CSV/نصوص...)',
    args: [],
    handler: async () => listAttachments(),
  },
  {
    name: 'read_uploaded_file',
    description: 'معاينة ملف مرفوع من قِبل المستخدم (أوراق Excel/أول صفوف CSV/نص) لفهم محتواه وبنيته. استخدمها دائماً أولاً قبل استيراد أو التعامل مع أي ملف مرفوع، ثم قرر بناءً على المحتوى: إن كان جدولياً منظماً فاستخدم import_project_file، وإن كان عشوائياً أو مجرد معلومات فاستخرج ما تحتاجه منه وأجب مباشرة دون إنشاء مساحات عمل',
    args: [{ name: 'name', type: 'string', required: true, description: 'اسم الملف المرفوع' }],
    handler: async (args) => filePreview(String(args.name)),
  },
  {
    name: 'import_project_file',
    description: 'استيراد ملف مرفوع (Excel/CSV) جدولي منظم بوضوح (رؤوس أعمدة + صفوف) إلى مساحة عمل: كل ورقة تصبح جدولاً. لا تستخدمها إلا إذا أكدت عبر read_uploaded_file أن الملف بيانات جدولية منظمة فعلية — الملفات العشوائية/غير المنظمة لا تُستورد كمساحة عمل، بل يستخرج منها ما يلزم مباشرة',
    args: [
      { name: 'name', type: 'string', required: true, description: 'اسم الملف المرفوع' },
      { name: 'workspace_name', type: 'string', description: 'اسم مساحة العمل (افتراضياً اسم الملف)' },
      { name: 'max_rows_per_sheet', type: 'number', description: 'الحد الأقصى للصفوف لكل جدول' },
    ],
    handler: async (args) =>
      importProjectFile(String(args.name), {
        workspaceName: args.workspace_name ? String(args.workspace_name) : undefined,
        maxRowsPerSheet: args.max_rows_per_sheet ? Number(args.max_rows_per_sheet) : undefined,
      }),
  },
  {
    name: 'remove_attachment',
    description: 'حذف ملف مرفوع',
    args: [{ name: 'name', type: 'string', required: true }],
    handler: async (args) => ({
      removed: await removeAttachment(String(args.name)),
    }),
  },
  {
    name: 'data_snapshot',
    description: 'لقطة حقيقية لكل بيانات النظام مقروءة من قاعدة البيانات مباشرة: عدّادات الجداول، الإجماليات المالية (مجموع قيم القطع/المدفوع/المتبقي/مبالغ العروض/أسعار العقارات)، عدد مساحات العمل والجداول والصفوف، وآخر السجلات بأسمائها من كل كيان رئيسي (مشاريع، عقارات، عملاء، مساحات عمل). استخدمها قبل أي جواب يتضمن أرقاماً أو إحصاءات لتكون معلّقة على الواقع',
    args: [],
    handler: async () => {
      const db = await getDB()
      const count = async (table: string): Promise<number> => {
        const r = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`)
        return r?.c ?? 0
      }
      const sum = async (table: string, column: string): Promise<number> => {
        const r = await db.getFirstAsync<{ s: number | null }>(`SELECT SUM(${column}) as s FROM ${table}`)
        return r?.s ?? 0
      }
      const recent = async (table: string, nameCol: string, limit = 5): Promise<string[]> => {
        try {
          const rows = await db.getAllAsync<{ name: string }>(`SELECT ${nameCol} as name FROM ${table} ORDER BY created_at DESC LIMIT ${limit}`)
          return rows.map((r) => r.name).filter(Boolean)
        } catch {
          return []
        }
      }
      return {
        counts: {
          properties: await count('properties'),
          clients: await count('clients'),
          offers: await count('offers'),
          campaigns: await count('campaigns'),
          viewings: await count('viewings'),
          waypoints: await count('waypoints'),
          areas: await count('areas'),
          projects: await count('projects'),
          blocks: await count('blocks'),
          plots: await count('plots'),
          plot_payments: await count('plot_payments'),
          workspaces: await count('workspaces'),
          workspace_tables: await count('workspace_tables'),
          workspace_rows: await count('workspace_rows'),
          change_log_entries: await count('change_log'),
        },
        financial_totals: {
          plots_value: await sum('plots', 'value'),
          plots_paid: await sum('plots', 'paid_amount'),
          plots_remaining: await sum('plots', 'remaining_amount'),
          plot_payments_received: await sum('plot_payments', 'amount'),
          properties_price: await sum('properties', 'price'),
          offers_amount: await sum('offers', 'amount'),
        },
        recent_records: {
          projects: await recent('projects', 'name'),
          properties: await recent('properties', 'name'),
          clients: await recent('clients', 'name'),
          workspaces: await recent('workspaces', 'name'),
        },
      }
    },
  },
]

export async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) {
    const available = TOOLS.map((t) => t.name).join(', ')
    return { ok: false, error: `أداة غير معروفة: ${name}. المتاح: ${available}` }
  }
  try {
    const result = await tool.handler(args ?? {})
    return { ok: true, result }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

export function toolNames(): string[] {
  return TOOLS.map((t) => t.name)
}

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}

export function getEntityMeta(entity: string) {
  return getEntityDef(entity) ?? null
}