import {
  PLOT_STATUS_LABELS,
  INSTALLMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../database/projects'

export type EntityKey =
  | 'properties'
  | 'clients'
  | 'offers'
  | 'campaigns'
  | 'viewings'
  | 'waypoints'
  | 'areas'
  | 'projects'
  | 'blocks'
  | 'plots'
  | 'plot_payments'
  | 'custom_fields'
  | 'custom_field_values'

export type FieldType = 'text' | 'number' | 'date' | 'datetime' | 'select'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  searchable?: boolean
  filterable?: boolean
  sortable?: boolean
  values?: Record<string, string>
  fk?: { to: EntityKey; via: string }
}

export interface EntityDef {
  key: EntityKey
  table: string
  label: string
  titleField: string
  fields: FieldDef[]
  customFieldEntities?: boolean
  parent?: EntityKey
  namesJoin?: {
    select: string
    join: string
  }
}

function f(name: string, label: string, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, label, type, ...extra }
}

const STATUS_PROPERTY_LABELS = {
  for_sale: 'للبيع',
  pending: 'قيد الإجراء',
  rented: 'مؤجّر',
  sold: 'مبيعة',
}
const PROPERTY_TYPE_LABELS = {
  apartment: 'شقة',
  villa: 'فيلا',
  land: 'أرض',
  office: 'مكتب',
  commercial: 'محل تجاري',
}
const CLIENT_TYPE_LABELS = { buyer: 'مشتري', seller: 'بائع', both: 'الاثنان' }
const OFFER_TYPE_LABELS = { buy_offer: 'عرض شراء', sell_offer: 'عرض بيع' }
const OFFER_STATUS_LABELS = {
  pending: 'قيد الانتظار',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  countered: 'بعرض مضاد',
}
const CAMPAIGN_TYPE_LABELS = { social_media: 'تواصل اجتماعي', email: 'بريد', sms: 'رسائل', brochure: 'مطوية' }
const CAMPAIGN_STATUS_LABELS = { draft: 'مسودة', active: 'نشطة', completed: 'مكتملة' }
const VIEWING_STATUS_LABELS = { scheduled: 'مجدولة', completed: 'تمت', cancelled: 'ملغاة' }
const ENTITY_TYPE_LABELS = { project: 'مشروع', block: 'بلوك', plot: 'قطعة' }
const FIELD_VALUE_TYPE_LABELS = {
  text: 'نص',
  number: 'رقم',
  date: 'تاريخ',
  boolean: 'نعم/لا',
  select: 'اختيار',
}

export const ENTITY_LABELS: Record<EntityKey, string> = {
  properties: 'العقارات',
  clients: 'العملاء',
  offers: 'العروض',
  campaigns: 'الحملات',
  viewings: 'المعاينات',
  waypoints: 'النقاط على الخريطة',
  areas: 'المساحات',
  projects: 'المشاريع',
  blocks: 'البلوكات',
  plots: 'القطع',
  plot_payments: 'أقساط القطع',
  custom_fields: 'الحقول المخصصة',
  custom_field_values: 'قيم الحقول المخصصة',
}

export const ALL_ENTITIES: EntityDef[] = [
  {
    key: 'properties',
    table: 'properties',
    label: ENTITY_LABELS.properties,
    titleField: 'name',
    fields: [
      f('id', 'المعرف', 'text'),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('description', 'الوصف', 'text', { searchable: true, filterable: true }),
      f('price', 'السعر (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('area', 'المساحة', 'number', { filterable: true, sortable: true }),
      f('area_sqm', 'المساحة بالمتر', 'number', { filterable: true, sortable: true }),
      f('latitude', 'خط العرض', 'number', { filterable: true }),
      f('longitude', 'خط الطول', 'number', { filterable: true }),
      f('address', 'العنوان', 'text', { searchable: true, filterable: true }),
      f('status', 'الحالة', 'select', {
        filterable: true,
        sortable: true,
        values: STATUS_PROPERTY_LABELS,
      }),
      f('type', 'النوع', 'select', { filterable: true, values: PROPERTY_TYPE_LABELS }),
      f('owner_name', 'اسم المالك', 'text', { searchable: true, filterable: true }),
      f('owner_phone', 'جوال المالك', 'text', { searchable: true, filterable: true }),
      f('owner_email', 'بريد المالك', 'text', { searchable: true, filterable: true }),
      f('geojson', 'الجيومتريا', 'text'),
      f('category', 'التصنيف', 'select', { filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'clients',
    table: 'clients',
    label: ENTITY_LABELS.clients,
    titleField: 'name',
    fields: [
      f('id', 'المعرف', 'text'),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('phone', 'الجوال', 'text', { searchable: true, filterable: true }),
      f('email', 'البريد', 'text', { searchable: true, filterable: true }),
      f('type', 'النوع', 'select', { filterable: true, values: CLIENT_TYPE_LABELS }),
      f('notes', 'ملاحظات', 'text', { searchable: true, filterable: true }),
      f('budget_min', 'ميزانية من', 'number', { filterable: true, sortable: true }),
      f('budget_max', 'ميزانية إلى', 'number', { filterable: true, sortable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'offers',
    table: 'offers',
    label: ENTITY_LABELS.offers,
    titleField: 'notes',
    parent: 'properties',
    fields: [
      f('id', 'المعرف', 'text'),
      f('property_id', 'العقار', 'text', { filterable: true, fk: { to: 'properties', via: 'property_id' } }),
      f('client_id', 'العميل', 'text', { filterable: true, fk: { to: 'clients', via: 'client_id' } }),
      f('type', 'النوع', 'select', { filterable: true, values: OFFER_TYPE_LABELS }),
      f('amount', 'المبلغ (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('status', 'الحالة', 'select', { filterable: true, values: OFFER_STATUS_LABELS }),
      f('date', 'التاريخ', 'date', { filterable: true, sortable: true }),
      f('notes', 'ملاحظات', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
    namesJoin: {
      select: ', p.name as property_name, c.name as client_name',
      join: ' LEFT JOIN properties p ON e.property_id = p.id LEFT JOIN clients c ON e.client_id = c.id',
    },
  },
  {
    key: 'campaigns',
    table: 'campaigns',
    label: ENTITY_LABELS.campaigns,
    titleField: 'name',
    fields: [
      f('id', 'المعرف', 'text'),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('description', 'الوصف', 'text', { searchable: true, filterable: true }),
      f('type', 'النوع', 'select', { filterable: true, values: CAMPAIGN_TYPE_LABELS }),
      f('status', 'الحالة', 'select', { filterable: true, values: CAMPAIGN_STATUS_LABELS }),
      f('budget', 'الميزانية (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('start_date', 'تاريخ البداية', 'date', { filterable: true, sortable: true }),
      f('end_date', 'تاريخ النهاية', 'date', { filterable: true, sortable: true }),
      f('notes', 'ملاحظات', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'viewings',
    table: 'viewings',
    label: ENTITY_LABELS.viewings,
    titleField: 'notes',
    parent: 'properties',
    fields: [
      f('id', 'المعرف', 'text'),
      f('property_id', 'العقار', 'text', { filterable: true, fk: { to: 'properties', via: 'property_id' } }),
      f('client_id', 'العميل', 'text', { filterable: true, fk: { to: 'clients', via: 'client_id' } }),
      f('date_time', 'الموعد', 'datetime', { filterable: true, sortable: true }),
      f('status', 'الحالة', 'select', { filterable: true, values: VIEWING_STATUS_LABELS }),
      f('notes', 'ملاحظات', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
    namesJoin: {
      select: ', p.name as property_name, c.name as client_name',
      join: ' LEFT JOIN properties p ON e.property_id = p.id LEFT JOIN clients c ON e.client_id = c.id',
    },
  },
  {
    key: 'waypoints',
    table: 'waypoints',
    label: ENTITY_LABELS.waypoints,
    titleField: 'name',
    fields: [
      f('id', 'المعرف', 'text'),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('description', 'الوصف', 'text', { searchable: true, filterable: true }),
      f('latitude', 'خط العرض', 'number', { filterable: true }),
      f('longitude', 'خط الطول', 'number', { filterable: true }),
      f('type', 'النوع', 'select', { filterable: true, values: { custom: 'مخصص', park: 'منتزه', land: 'أرض', home: 'مسكن' } }),
      f('category', 'التصنيف', 'select', { filterable: true }),
      f('tags', 'الوسوم', 'text', { searchable: true }),
      f('rating', 'التقييم', 'number', { filterable: true, sortable: true }),
      f('owner_name', 'اسم المالك', 'text', { searchable: true, filterable: true }),
      f('owner_phone', 'جوال المالك', 'text', { searchable: true, filterable: true }),
      f('owner_contact', 'وسيلة اتصال', 'text', { searchable: true }),
      f('property_details', 'تفاصيل العقار', 'text', { searchable: true }),
      f('area_sqm', 'المساحة بالمتر', 'number', { filterable: true }),
      f('price', 'السعر (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('listing_date', 'تاريخ الإدراج', 'date', { filterable: true }),
      f('media_kind', 'نوع الوسائط', 'select', { filterable: true, values: { photo: 'صور', video: 'فيديو' } }),
      f('media_count', 'عدد الوسائط', 'number', { filterable: true }),
      f('media', 'الوسائط', 'text'),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'areas',
    table: 'areas',
    label: ENTITY_LABELS.areas,
    titleField: 'name',
    fields: [
      f('id', 'المعرف', 'text'),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('description', 'الوصف', 'text', { searchable: true, filterable: true }),
      f('geojson', 'الجيومتريا', 'text'),
      f('area_sqm', 'المساحة بالمتر', 'number', { filterable: true, sortable: true }),
      f('perimeter_m', 'المحيط بالمتر', 'number', { filterable: true }),
      f('category', 'التصنيف', 'select', { filterable: true }),
      f('tags', 'الوسوم', 'text', { searchable: true }),
      f('rating', 'التقييم', 'number', { filterable: true }),
      f('media', 'الوسائط', 'text'),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'projects',
    table: 'projects',
    label: ENTITY_LABELS.projects,
    titleField: 'name',
    customFieldEntities: true,
    fields: [
      f('id', 'المعرف', 'text'),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('description', 'الوصف', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'blocks',
    table: 'blocks',
    label: ENTITY_LABELS.blocks,
    titleField: 'name',
    customFieldEntities: true,
    parent: 'projects',
    fields: [
      f('id', 'المعرف', 'text'),
      f('project_id', 'المشروع', 'text', { filterable: true, fk: { to: 'projects', via: 'project_id' } }),
      f('name', 'الاسم', 'text', { searchable: true, filterable: true, sortable: true }),
      f('plot_count', 'عدد القطع', 'number', { filterable: true, sortable: true }),
      f('notes', 'ملاحظات', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
    namesJoin: {
      select: ', prj.name as project_name',
      join: ' LEFT JOIN projects prj ON e.project_id = prj.id',
    },
  },
  {
    key: 'plots',
    table: 'plots',
    label: ENTITY_LABELS.plots,
    titleField: 'plot_no',
    customFieldEntities: true,
    parent: 'blocks',
    fields: [
      f('id', 'المعرف', 'text'),
      f('block_id', 'البلوك', 'text', { filterable: true, fk: { to: 'blocks', via: 'block_id' } }),
      f('plot_no', 'رقم القطعة', 'text', { searchable: true, filterable: true, sortable: true }),
      f('area_sqm', 'المساحة بالمتر', 'number', { filterable: true, sortable: true }),
      f('status', 'الحالة', 'select', { filterable: true, sortable: true, values: PLOT_STATUS_LABELS }),
      f('boundary_north', 'الحد الشمالي', 'text', { searchable: true }),
      f('boundary_south', 'الحد الجنوبي', 'text', { searchable: true }),
      f('boundary_east', 'الحد الشرقي', 'text', { searchable: true }),
      f('boundary_west', 'الحد الغربي', 'text', { searchable: true }),
      f('value', 'القيمة (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('buyer_name', 'اسم المشتري', 'text', { searchable: true, filterable: true }),
      f('buyer_contact', 'جوال المشتري', 'text', { searchable: true, filterable: true }),
      f('sale_date', 'تاريخ البيع', 'date', { filterable: true, sortable: true }),
      f('installment_type', 'نوع التقسيط', 'select', { filterable: true, values: INSTALLMENT_TYPE_LABELS }),
      f('paid_amount', 'المدفوع (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('remaining_amount', 'المتبقي (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
      f('updated_at', 'آخر تحديث', 'datetime', { sortable: true }),
    ],
    namesJoin: {
      select: ', b.name as block_name, b.project_id, prj.name as project_name',
      join: ' LEFT JOIN blocks b ON e.block_id = b.id LEFT JOIN projects prj ON b.project_id = prj.id',
    },
  },
  {
    key: 'plot_payments',
    table: 'plot_payments',
    label: ENTITY_LABELS.plot_payments,
    titleField: 'pay_date',
    parent: 'plots',
    fields: [
      f('id', 'المعرف', 'text'),
      f('plot_id', 'القطعة', 'text', { filterable: true, fk: { to: 'plots', via: 'plot_id' } }),
      f('amount', 'المبلغ (ر.ي)', 'number', { filterable: true, sortable: true }),
      f('pay_date', 'تاريخ الدفع', 'date', { filterable: true, sortable: true }),
      f('method', 'الوسيلة', 'select', { filterable: true, values: PAYMENT_METHOD_LABELS }),
      f('cash_recipient', 'المستلم (كاش)', 'text', { searchable: true, filterable: true }),
      f('cash_receipt_no', 'رقم السند', 'text', { searchable: true, filterable: true }),
      f('bank_name', 'البنك', 'text', { searchable: true, filterable: true }),
      f('bank_ref_no', 'الرقم المرجعي', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ التسجيل', 'datetime', { sortable: true }),
    ],
    namesJoin: {
      select: ', pl.plot_no as plot_no, pl.status as plot_status, pl.value as plot_value, pl.paid_amount as plot_paid, pl.remaining_amount as plot_remaining',
      join: ' LEFT JOIN plots pl ON e.plot_id = pl.id',
    },
  },
  {
    key: 'custom_fields',
    table: 'custom_fields',
    label: ENTITY_LABELS.custom_fields,
    titleField: 'label',
    fields: [
      f('id', 'المعرف', 'text'),
      f('entity_type', 'نوع الكيان', 'select', { filterable: true, values: ENTITY_TYPE_LABELS }),
      f('label', 'التسمية', 'text', { searchable: true, filterable: true, sortable: true }),
      f('value_type', 'نوع القيمة', 'select', { filterable: true, values: FIELD_VALUE_TYPE_LABELS }),
      f('options', 'الخيارات', 'text', { searchable: true }),
      f('sort_order', 'الترتيب', 'number', { sortable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
  {
    key: 'custom_field_values',
    table: 'custom_field_values',
    label: ENTITY_LABELS.custom_field_values,
    titleField: 'value',
    fields: [
      f('id', 'المعرف', 'text'),
      f('entity_type', 'نوع الكيان', 'select', { filterable: true, values: ENTITY_TYPE_LABELS }),
      f('entity_id', 'الكيان', 'text', { filterable: true }),
      f('field_id', 'الحقل', 'text', { filterable: true }),
      f('value', 'القيمة', 'text', { searchable: true, filterable: true }),
      f('created_at', 'تاريخ الإنشاء', 'datetime', { sortable: true }),
    ],
  },
]

export function getEntityDef(key: string): EntityDef | undefined {
  return ALL_ENTITIES.find((e) => e.key === key)
}

export function fieldOptions(entity: EntityDef, field: string): Record<string, string> | undefined {
  return entity.fields.find((x) => x.name === field)?.values
}

export function resolveLabel(entity: EntityDef, row: Record<string, any>): string | undefined {
  if (!row) return undefined
  const v = row[entity.titleField]
  if (v == null) return undefined
  return String(v)
}

// ---------- دليل أقسام التطبيق: "بيت الوكيل" الذي يعرفه غرفة غرفة ----------

function entityGuide(e: EntityDef): string {
  const searchable = e.fields.filter((x) => x.searchable).map((x) => x.label)
  const filterable = e.fields.filter((x) => x.filterable).map((x) => x.label)
  const selectVals = e.fields
    .filter((x) => x.values)
    .map((x) => `${x.label} (${Object.keys(x.values!).join(' ، ')})`)
  const rel = e.parent ? ` — تابعة لـ ${ENTITY_LABELS[e.parent as EntityKey]}` : ''
  const custom = e.customFieldEntities ? ' تدعم حقولاً مخصصة إضافية' : ''
  return `- ${e.label} [الكيان ${e.key}]${rel}${custom}.\n   ابحث فيها عن: ${searchable.join(' ، ') || 'لا يوجد نص حر'}. الفلاتر المتاحة: ${filterable
    .join(' ، ')
    .slice(0, 200)}. القيم المحتملة: ${selectVals.join(' ؛ ') || '—'}.\n   الجلب: query {entity:"${e.key}", search أو filters} — والتفاصيل الكاملة عبر get.`
}

/** الدليل الكامل (تفصيلي) — يُستدعى عبر أداة catalog عندما يحتاج الوكيل التأكد من بنية أي قسم. */
export function appCatalogText(): string {
  const sections: string[] = []
  sections.push(
    `(1) الخريطة والعقارات — العقارات المعروضة والمواقع والمساحات:
${ALL_ENTITIES.filter((e) => ['properties', 'waypoints', 'areas'].includes(e.key)).map(entityGuide).join('\n')}`
  )
  sections.push(
    `(2) العملاء — جهات التواصل والمشترون المحتملون:
${entityGuide(getEntityDef('clients')!)}`
  )
  sections.push(
    `(3) العروض — عروض البيع والشراء المقدَّمة على العقارات:
${entityGuide(getEntityDef('offers')!)}`
  )
  sections.push(
    `(4) المشاهدات — مواعيد المعاينة:
${entityGuide(getEntityDef('viewings')!)}`
  )
  sections.push(
    `(5) الحملات — حملات التسويق:
${entityGuide(getEntityDef('campaigns')!)}`
  )
  sections.push(
    `(6) المشاريع القالبية — المشروع ← البلوكات ← القطع + الأقساط والحقول المخصصة:
${['projects', 'blocks', 'plots', 'plot_payments', 'custom_fields', 'custom_field_values']
  .map((k) => entityGuide(getEntityDef(k)!))
  .join('\n')}`
  )
  sections.push(
    `(7) المشاريع متعددة الأنماط ومحرك الإدخال — project_profile_get يقرأ نوع المشروع وعملته؛ project_nodes_list يقرأ شجرة الأصول للمباني والأبراج والوحدات والمواقف والمحلات؛ project_import_preview يعاين جدول المصدر ويكشف التكرار والأخطاء دون كتابة؛ project_import_commit يعتمد الدفعة داخل transaction ويرجع batch_id ونتيجة تحقق؛ project_integrity_check يفحص العقد اليتيمة وفروقات المال والعدادات. استخدم هذه الأدوات لأي مشروع جماعي ولا تستخدم CRUD العام لتفريغ الصفوف.`
  )
  sections.push(
    `(8) المالية والتحليلات — لا تُقرأ بالجداول بل بأدوات تحليلية جاهزة: buyer_summary (ملخص أي مشترٍ)، payment_ledger (دفتر أقساط قديم للتوافق)، project_cashflow (دفتر النقد الموحد حسب المشروع والفترة)، ledger_record_payment (تسجيل دفعة موثقة)، dashboard_kpis (مؤشرات عامة)، project_financials (فروقات قطع المشروع)، installment_schedule (جدولة قسط قطعة). لا تعدل paid_amount أو remaining_amount مباشرة؛ استخدم ledger_record_payment ثم project_integrity_check.`
  )
  sections.push(
    `(9) مساحات العمل المرنة — بيانات حرة لا تمثل أصولاً عقارية: workspace_create للإنشاء، list_workspaces لعرضها، workspace_get (structures/rows) لقراءة أي منها، workspace_add_* / update / delete للتعديل، workspace_import_rows للإدخال الجماعي. لا تستخدمها لمشروع رسمي إلا إذا طلب المستخدم جدولاً حراً صراحةً.`
  )
  sections.push(
    `(10) الملفات المرفوعة — list_attachments لعرضها، read_uploaded_file لمعاينة أي ملف، ثم حوّل البيانات العقارية إلى project_import_preview/commit؛ استخدم import_project_file فقط للبيانات الحرة، وremove_attachment للحذف.`
  )
  sections.push(
    `(11) سجل التدقيق — كل عملية كتابة (إنشاء/تعديل/حذف/استيراد/تراجع) تُسجَّل تلقائياً مع من نفّذها (وكيل agent أو مستخدم user أو تراجع undo أو نظام system) وجلسة الوكيل والأداة والملخص. استعلم عبر audit_log_query (فلاتر: action/scope/scope_id/actor/session_id/tool/فترة/search) أو audit_log_summary للإحصائيات — عند أي سؤال عن "من غيّر ماذا ومتى" أو "ماذا فعل الوكيل في هذه الجلسة" استخدم هاتين الأداتين.`
  )
  return sections.join('\n\n')
}

/** النسخة المضغوطة — تُحقن في تعليمات الوكيل ليعرف منزله عن ظهر قلب دون استدعاء الأداة. */
export function compactAppCatalog(): string {
  const lines: string[] = []
  for (const e of ALL_ENTITIES) {
    const searchable = e.fields.filter((x) => x.searchable).map((x) => x.label)
    const p = e.parent ? ` (تابعة لـ ${ENTITY_LABELS[e.parent as EntityKey]})` : ''
    const c = e.customFieldEntities ? ' +حقول مخصصة' : ''
    lines.push(`${e.label} [${e.key}]${p}${c}: حقول بحث نصي: ${searchable.join('، ').slice(0, 140) || '—'}`)
  }
  return lines.join('\n')
}

/** البحث في دليل الأقسام بمقطع من اسم القسم/الكيان أو كلمة — يعيد الأقسام المطابقة. */
export function searchCatalog(sectionOrQuery?: string, query?: string): string {
  const full = appCatalogText()
  const words = [sectionOrQuery, query].filter(Boolean).join(' ').split(/\s+/).filter((w) => w.length >= 2)
  if (!words.length) return full
  const idxByWord: Set<number> = new Set()
  for (const w of words) {
    let i = 0
    while ((i = full.indexOf(w, i)) >= 0) {
      const line = full.lastIndexOf('\n', i)
      idxByWord.add(line + 1)
      i += w.length
    }
  }
  if (!idxByWord.size) return `لا يوجد قسم يطابق "${words.join(' ')}". هذه أقسام التطبيق:\n${full}`
  const blocks = [...idxByWord].sort((a, b) => a - b).map((s) => {
    const e = full.indexOf('\n\n', s)
    return full.slice(s, e >= 0 && e - s < 900 ? e : s + 900)
  })
  return blocks.join('\n\n')
}