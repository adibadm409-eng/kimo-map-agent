import { agentCreate } from './crud'
import { cancelReminder, createReminder, getAllOffers, getAllReminders, getReminder, setOfferReminder } from '../database/db'
import { cancelOfferReminder, scheduleOfferReminder } from '../notifications/offerReminders'
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
    name: 'current_local_time',
    description: 'قراءة الوقت الحالي من جهاز المستخدم محلياً مع التاريخ والمنطقة الزمنية. استخدمها قبل تفسير عبارات مثل بعد ساعة أو غداً أو ضبط موعد تنبيه؛ لا تعتمد على الذاكرة.',
    args: [],
    handler: async () => {
      const now = new Date()
      return {
        iso: now.toISOString(),
        local: now.toLocaleString('ar-YE', { dateStyle: 'full', timeStyle: 'long' }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
        offsetMinutes: -now.getTimezoneOffset(),
      }
    },
  },
  {
    name: 'create_offer_with_reminder',
    description: 'إنشاء عرض شراء أو بيع محلياً ثم ضبط تنبيه متابعة اختياري له في العملية نفسها. اقرأ العقار والعميل أولاً، واستدعِ current_local_time إذا كان الموعد نسبياً. reminder_at يجب أن يكون ISO واضحاً وفي المستقبل؛ لا تخترع معرفات العقار أو العميل.',
    args: [
      { name: 'property_id', type: 'string', required: true, description: 'معرف العقار الموجود' },
      { name: 'client_id', type: 'string', required: true, description: 'معرف العميل الموجود' },
      { name: 'type', type: 'string', required: true, description: 'buy_offer أو sell_offer' },
      { name: 'amount', type: 'number', required: true, description: 'قيمة العرض بالريال اليمني' },
      { name: 'status', type: 'string', description: 'pending أو accepted أو rejected أو countered' },
      { name: 'date', type: 'string', description: 'تاريخ العرض YYYY-MM-DD' },
      { name: 'notes', type: 'string', description: 'ملاحظات العرض' },
      { name: 'reminder_at', type: 'string', description: 'موعد التنبيه بصيغة ISO في المستقبل، أو اتركه فارغاً دون تنبيه' },
    ],
    handler: async (args) => {
      if (!(Number(args.amount) >= 0)) throw new Error('مبلغ العرض غير صالح.')
      const reminderAt = args.reminder_at ? String(args.reminder_at) : ''
      const parsedReminder = reminderAt ? new Date(reminderAt) : null
      if (parsedReminder && (Number.isNaN(parsedReminder.getTime()) || parsedReminder.getTime() <= Date.now())) throw new Error('موعد التنبيه غير صالح أو منتهٍ؛ استخدم current_local_time ثم أرسل موعداً مستقبلياً.')
      const created = await agentCreate({
        entity: 'offers',
        data: {
          property_id: String(args.property_id),
          client_id: String(args.client_id),
          type: String(args.type || 'buy_offer'),
          amount: Number(args.amount),
          status: String(args.status || 'pending'),
          date: args.date ? String(args.date) : new Date().toISOString().slice(0, 10),
          notes: args.notes ? String(args.notes) : '',
        },
      })
      if (!reminderAt) return { id: created.id, offerCreated: true, reminderScheduled: false }
      const parsed = parsedReminder as Date
      const offers = await getAllOffers()
      const offer = offers.find((item) => item.id === created.id)
      if (!offer) throw new Error('أُنشئ العرض لكن تعذر قراءته لضبط التنبيه.')
      let notificationId = ''
      try {
        notificationId = await scheduleOfferReminder(parsed, { offerId: created.id, propertyName: offer.property_name, clientName: offer.client_name, amount: Number(offer.amount) || 0 })
        await setOfferReminder(created.id, parsed.toISOString(), notificationId)
      } catch (error) {
        if (notificationId) await cancelOfferReminder(notificationId).catch(() => {})
        throw error
      }
      return { id: created.id, offerCreated: true, reminderScheduled: true, reminderAt: parsed.toISOString() }
    },
  },
  {
    name: 'offer_reminder_set',
    description: 'ضبط أو إلغاء تنبيه متابعة لعرض موجود. اقرأ العرض أولاً. action=set يحتاج reminder_at ISO مستقبلياً؛ action=cancel يلغي التنبيه المحلي ويحذف موعده من العرض.',
    args: [
      { name: 'offer_id', type: 'string', required: true, description: 'معرف العرض الموجود' },
      { name: 'action', type: 'string', required: true, description: 'set أو cancel' },
      { name: 'reminder_at', type: 'string', description: 'موعد التنبيه ISO في المستقبل عند action=set' },
    ],
    handler: async (args) => {
      const offerId = String(args.offer_id || '')
      const action = String(args.action || 'set')
      const offer = (await getAllOffers()).find((item) => item.id === offerId)
      if (!offer) throw new Error('العرض غير موجود.')
      if (action === 'cancel') {
        await cancelOfferReminder(offer.reminder_notification_id)
        await setOfferReminder(offerId, null, null)
        return { offerId, reminderScheduled: false, cancelled: true }
      }
      if (action !== 'set') throw new Error('action يجب أن يكون set أو cancel.')
      const reminderAt = String(args.reminder_at || '')
      const parsed = new Date(reminderAt)
      if (!reminderAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) throw new Error('موعد التنبيه غير صالح أو منتهٍ؛ استخدم current_local_time ثم أرسل موعداً مستقبلياً.')
      await cancelOfferReminder(offer.reminder_notification_id)
      let notificationId = ''
      try {
        notificationId = await scheduleOfferReminder(parsed, { offerId, propertyName: offer.property_name, clientName: offer.client_name, amount: Number(offer.amount) || 0 })
        await setOfferReminder(offerId, parsed.toISOString(), notificationId)
      } catch (error) {
        if (notificationId) await cancelOfferReminder(notificationId).catch(() => {})
        throw error
      }
      return { offerId, reminderScheduled: true, reminderAt: parsed.toISOString() }
    },
  },
  {
    name: 'create_reminder',
    description: 'إنشاء تذكير محلي عام بنص يحدده المستخدم، مثل: ذكرني بعد ساعتين أن أتصل بالعميل. اقرأ current_local_time قبل تحويل الموعد النسبي، وأرسل remind_at بصيغة ISO مستقبلية واضحة. يعمل الإشعار حتى عند إغلاق التطبيق.',
    args: [
      { name: 'title', type: 'string', required: true, description: 'عنوان مختصر لما يجب تذكّره' },
      { name: 'remind_at', type: 'string', required: true, description: 'الموعد بصيغة ISO في المستقبل' },
      { name: 'body', type: 'string', description: 'تفاصيل إضافية للتذكير' },
    ],
    handler: async (args) => {
      const id = await createReminder({ title: String(args.title || ''), body: args.body ? String(args.body) : '', remind_at: String(args.remind_at || '') })
      const reminder = await getReminder(id)
      return { id, reminderCreated: true, reminder: reminder ? { id: reminder.id, title: reminder.title, body: reminder.body, remind_at: reminder.remind_at, status: reminder.status } : null }
    },
  },
  {
    name: 'list_reminders',
    description: 'عرض التذكيرات المحلية المجدولة القادمة. استخدمها عندما يسأل المستخدم عن تذكيراته أو يريد مراجعة ما تم ضبطه.',
    args: [],
    handler: async () => {
      const reminders = await getAllReminders()
      return { reminders: reminders.map((reminder) => ({ id: reminder.id, title: reminder.title, body: reminder.body, remind_at: reminder.remind_at, local_time: new Date(reminder.remind_at).toLocaleString('ar-YE', { dateStyle: 'full', timeStyle: 'short' }), status: reminder.status })) }
    },
  },
  {
    name: 'cancel_reminder',
    description: 'إلغاء تذكير محلي عام موجود بعد تحديده بالمعرف. لا تستخدمه دون قراءة القائمة أو السجل والتأكد من التذكير المقصود.',
    args: [{ name: 'reminder_id', type: 'string', required: true, description: 'معرف التذكير الموجود' }],
    handler: async (args) => {
      const id = String(args.reminder_id || '')
      await cancelReminder(id)
      return { id, cancelled: true }
    },
  },
  {
    name: 'project_domain_initialize',
    description: 'تهيئة جداول المجال المحلي بعد ترقية التطبيق. أداة صيانة داخلية لا تستدعى عادةً من المستخدم.',
    args: [],
    handler: async () => { await ensureProjectDomainSchema(); return { ok: true } },
  },
]
