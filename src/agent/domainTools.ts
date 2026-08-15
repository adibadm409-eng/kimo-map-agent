import {
  commitProjectImport,
  ensureProjectDomainSchema,
  previewProjectImport,
  projectCashflow,
  projectIntegrityCheck,
  recordLedgerPayment,
  getProjectProfile,
  listProjectNodes,
  type ProjectImportPlan,
  type ProjectKind,
} from '../domain/projectDomain'

export interface DomainToolDef {
  name: string
  description: string
  args: { name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean; description?: string }[]
  handler: (args: Record<string, any>) => Promise<Record<string, any> | Record<string, any>[] | null>
}

const projectKinds: ProjectKind[] = ['land', 'residential_building', 'tower', 'compound', 'custom']

function planFromArgs(args: Record<string, any>): ProjectImportPlan {
  const kind = String(args.kind ?? 'land') as ProjectKind
  if (!projectKinds.includes(kind)) throw new Error(`نوع المشروع غير مدعوم: ${kind}`)
  if (!String(args.project_name ?? '').trim()) throw new Error('اسم المشروع مطلوب.')
  if (!Array.isArray(args.rows)) throw new Error('rows يجب أن تكون مصفوفة صفوف.')
  return {
    projectId: args.project_id ? String(args.project_id) : undefined,
    projectName: String(args.project_name).trim(),
    description: args.description ? String(args.description) : undefined,
    kind,
    currency: args.currency ? String(args.currency) : 'YER',
    sourceName: args.source_name ? String(args.source_name) : undefined,
    rows: args.rows as any[],
    options: {
      createMissingParents: args.create_missing_parents !== false,
      updateExisting: args.update_existing === true,
      allowOverpayment: args.allow_overpayment === true,
    },
  }
}

export const DOMAIN_TOOLS: DomainToolDef[] = [
  {
    name: 'project_profile_get',
    description: 'قراءة نوع المشروع وعملته وإعداداته المحلية قبل تنفيذ مهمة حتى لا يعامل كيمو برجاً أو مبنى كمشروع قطع أراضٍ.',
    args: [{ name: 'project_id', type: 'string', required: true }],
    handler: async (args) => ({ profile: await getProjectProfile(String(args.project_id)) }),
  },
  {
    name: 'project_nodes_list',
    description: 'استعراض أصول المشروع الهرمية (مبانٍ/طوابق/وحدات/قطع/مواقف/محلات) مع البحث والتصفية، وهو المسار الصحيح للمشاريع غير الأرضية.',
    args: [
      { name: 'project_id', type: 'string', required: true },
      { name: 'parent_id', type: 'string' },
      { name: 'kind', type: 'string', description: 'building|floor|unit|plot|parking|shop|common_area|custom' },
      { name: 'search', type: 'string' },
      { name: 'limit', type: 'number' },
    ],
    handler: async (args) => listProjectNodes(String(args.project_id), { parentId: args.parent_id ? String(args.parent_id) : undefined, kind: args.kind ? String(args.kind) as any : undefined, search: args.search ? String(args.search) : undefined, limit: args.limit != null ? Number(args.limit) : undefined }),
  },
  {
    name: 'project_import_preview',
    description: 'معاينة إدخال مشروع متعدد الأنماط قبل أي كتابة: يطبع الصفوف، يكتشف نوع الأصل والأب، يوحد المال والحالة، يكشف النواقص والتكرار، ولا يكتب شيئاً. استخدمه دائماً قبل project_import_commit.',
    args: [
      { name: 'project_name', type: 'string', required: true, description: 'اسم المشروع' },
      { name: 'kind', type: 'string', required: true, description: 'land|residential_building|tower|compound|custom' },
      { name: 'project_id', type: 'string', description: 'معرف مشروع موجود للتحديث' },
      { name: 'currency', type: 'string', description: 'رمز العملة، افتراضياً YER' },
      { name: 'source_name', type: 'string', description: 'اسم الملف أو مصدر البيانات' },
      { name: 'rows', type: 'array', required: true, description: 'صفوف مصدرية؛ للأراضي استخدم block_name/plot_no، وللمباني building_name/floor/unit_no، ويمكن إضافة value/paid/remaining/status/buyer_name' },
      { name: 'update_existing', type: 'boolean', description: 'اعرض التكرار كتحديث محتمل بدلاً من تخطيه' },
    ],
    handler: async (args) => ({ preview: await previewProjectImport(planFromArgs(args)) }),
  },
  {
    name: 'project_import_commit',
    description: 'اعتماد إدخال مشروع بعد المعاينة: ينفذ العملية محلياً داخل transaction واحدة، يمنع التكرار، ينشئ الآباء الناقصين، ويرجع batch_id ونتيجة تحقق. لا تستخدمه قبل قراءة preview ومعالجة الأخطاء.',
    args: [
      { name: 'project_name', type: 'string', required: true },
      { name: 'kind', type: 'string', required: true, description: 'land|residential_building|tower|compound|custom' },
      { name: 'project_id', type: 'string', description: 'معرف مشروع موجود للتحديث' },
      { name: 'currency', type: 'string', description: 'رمز العملة' },
      { name: 'source_name', type: 'string', description: 'اسم المصدر' },
      { name: 'rows', type: 'array', required: true, description: 'الصفوف بعد مراجعة المعاينة' },
      { name: 'update_existing', type: 'boolean', description: 'تحديث الأصول الموجودة بنفس المفتاح بدلاً من تخطيها' },
    ],
    handler: async (args) => ({ result: await commitProjectImport(planFromArgs(args)) }),
  },
  {
    name: 'project_integrity_check',
    description: 'فحص سلامة مشروع محلياً: العقد اليتيمة، الأكواد المكررة، فروقات القيمة/المدفوع/المتبقي، وعدادات البلوكات القديمة. استخدمه قبل إعلان اكتمال أي إدخال أو تعديل جماعي.',
    args: [{ name: 'project_id', type: 'string', description: 'معرف المشروع؛ اتركه فارغاً لفحص كل المشاريع' }],
    handler: async (args) => projectIntegrityCheck(args.project_id ? String(args.project_id) : undefined),
  },
  {
    name: 'ledger_record_payment',
    description: 'تسجيل دفعة مالية موثقة في دفتر النقد المحلي وتحديث الأصل داخل transaction. يمنع المبلغ غير الموجب وتجاوز المتبقي افتراضياً؛ لا تستخدم update عام لتعديل paid_amount أو remaining_amount.',
    args: [
      { name: 'project_id', type: 'string', required: true },
      { name: 'node_id', type: 'string', description: 'معرف أصل project_nodes، اختره أو اختر plot_id وليس الاثنين' },
      { name: 'plot_id', type: 'string', description: 'معرف قطعة قديمة، اختره أو اختر node_id وليس الاثنين' },
      { name: 'amount', type: 'number', required: true },
      { name: 'pay_date', type: 'string', required: true, description: 'YYYY-MM-DD' },
      { name: 'method', type: 'string', required: true, description: 'cash|bank|transfer|cheque|other' },
      { name: 'currency', type: 'string', description: 'رمز العملة' },
      { name: 'reference', type: 'string', description: 'رقم السند أو المرجع' },
      { name: 'note', type: 'string', description: 'ملاحظة الدفع' },
      { name: 'cash_recipient', type: 'string', description: 'مستلم الكاش' },
      { name: 'cash_receipt_no', type: 'string', description: 'رقم سند الكاش' },
      { name: 'bank_name', type: 'string', description: 'اسم البنك' },
      { name: 'bank_ref_no', type: 'string', description: 'المرجع البنكي' },
      { name: 'allow_overpayment', type: 'boolean', description: 'لا تفعّله إلا بطلب صريح وتصنيف الدفعة كتصحيح' },
    ],
    handler: async (args) => ({ result: await recordLedgerPayment({
      projectId: String(args.project_id),
      nodeId: args.node_id ? String(args.node_id) : undefined,
      plotId: args.plot_id ? String(args.plot_id) : undefined,
      amount: Number(args.amount),
      payDate: String(args.pay_date),
      method: String(args.method) as any,
      currency: args.currency ? String(args.currency) : undefined,
      reference: args.reference ? String(args.reference) : undefined,
      note: args.note ? String(args.note) : undefined,
      cashRecipient: args.cash_recipient ? String(args.cash_recipient) : undefined,
      cashReceiptNo: args.cash_receipt_no ? String(args.cash_receipt_no) : undefined,
      bankName: args.bank_name ? String(args.bank_name) : undefined,
      bankRefNo: args.bank_ref_no ? String(args.bank_ref_no) : undefined,
      source: 'agent',
      allowOverpayment: args.allow_overpayment === true,
    }) }),
  },
  {
    name: 'project_cashflow',
    description: 'قراءة التدفقات النقدية المسجلة لمشروع محلياً مع إجماليات حسب الوسيلة والشهر، دون إعادة حساب مالي موازٍ في prompt.',
    args: [
      { name: 'project_id', type: 'string', required: true },
      { name: 'from_date', type: 'string', description: 'YYYY-MM-DD' },
      { name: 'to_date', type: 'string', description: 'YYYY-MM-DD' },
    ],
    handler: async (args) => projectCashflow(String(args.project_id), { fromDate: args.from_date ? String(args.from_date) : undefined, toDate: args.to_date ? String(args.to_date) : undefined }),
  },
  {
    name: 'project_domain_initialize',
    description: 'تهيئة جداول المجال المحلي بعد ترقية التطبيق. أداة صيانة داخلية لا تستدعى عادةً من المستخدم.',
    args: [],
    handler: async () => { await ensureProjectDomainSchema(); return { ok: true } },
  },
]
