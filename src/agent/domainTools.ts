import { agentCreate, agentUpdate } from './crud'
import { cancelReminder, createReminder, updateReminder, createOfferReminder, deleteOffer, getAllOffers, getAllReminders, getOfferReminders, getRemindersForTarget, getReminder, cancelOfferReminderById } from '../database/db'
import { linkAttachmentToEntity, listEntityMedia, unlinkEntityMedia, clearProjectMemory, deleteProjectMemoryEntry, type MediaTargetType } from '../database/workspace'
import { previewPropertyChange } from './propertyIntake'
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

const previewedCommits = new Set<string>()
function planHash(plan: ProjectImportPlan): string {
  const s = `${plan.projectName}|${plan.kind}|${plan.rows.length}|${JSON.stringify(plan.rows).length}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `${plan.projectName}|${plan.kind}|${plan.rows.length}|${h}`
}
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
    name: 'property_intake_apply',
    description: 'تطبيق إدخال عقار مع مرفقاته بعد المعاينة: يعيد فحص create/update/ambiguous، يمنع إنشاء سجل عند وجود مطابقة، ويطلب approved=true للتغييرات الحساسة، ثم يربط الوسائط بالعقار دون حذف الأصل. استخدم property_change_preview أولاً.',
    args: [
      { name: 'data', type: 'object', required: true, description: 'حقول العقار المستخرجة من الطلب' },
      { name: 'attachment_ids', type: 'array', description: 'معرفات المرفقات التي طلب المستخدم ربطها بالعقار' },
      { name: 'approved', type: 'boolean', description: 'true فقط بعد موافقة المستخدم على تغييرات risk=high' },
    ],
    handler: async (args) => {
      const preview = await previewPropertyChange({ data: (args.data && typeof args.data === 'object' ? args.data : {}) as Record<string, any>, attachmentIds: Array.isArray(args.attachment_ids) ? args.attachment_ids : [] })
      if (preview.mode === 'ambiguous') return { applied: false, requiresClarification: true, preview }
      if (preview.requiresApproval && args.approved !== true) return { applied: false, requiresApproval: true, preview }
      const data = (args.data && typeof args.data === 'object' ? args.data : {}) as Record<string, any>
      const sessionId = args.__session_id ? String(args.__session_id) : undefined
      let propertyId = ''
      if (preview.mode === 'update') {
        propertyId = String(preview.candidates[0]?.id ?? '')
        if (!propertyId) return { applied: false, requiresClarification: true, preview }
        await agentUpdate({ entity: 'properties', id: propertyId, data })
      } else {
        const created = await agentCreate({ entity: 'properties', data })
        propertyId = created.id
      }
      const links: any[] = []
      for (const attachmentId of preview.attachmentIds) {
        links.push(await linkAttachmentToEntity({ attachmentId, targetType: 'property', targetId: propertyId, sessionId }))
      }
      return { applied: true, mode: preview.mode, propertyId, links, preview }
    },
  },
  {
    name: 'property_change_preview',
    description: 'معاينة ذكية لبيانات عقار واردة من رسالة أو مرفقات: تبحث في العقارات المحلية وتحدد هل المسار create أو update أو ambiguous، وتعرض التغييرات المرشحة دون كتابة. استخدمها قبل create/update عندما يرسل المستخدم تفاصيل عقار أو وسائط مرتبطة به.',
    args: [
      { name: 'data', type: 'object', required: true, description: 'حقول العقار المستخرجة من الرسالة أو الملف' },
      { name: 'attachment_ids', type: 'array', description: 'معرفات المرفقات المرتبطة بالطلب إن وجدت' },
    ],
    handler: async (args) => previewPropertyChange({ data: (args.data && typeof args.data === 'object' ? args.data : {}) as Record<string, any>, attachmentIds: Array.isArray(args.attachment_ids) ? args.attachment_ids : [] }),
  },
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
    handler: async (args) => {
      const plan = planFromArgs(args)
      const preview = await previewProjectImport(plan)
      previewedCommits.add(planHash(plan))
      return { preview, preview_token: planHash(plan) }
    },
  },
  {
    name: 'project_import_commit',
    description: 'اعتماد إدخال مشروع بعد المعاينة: ينفذ العملية محلياً داخل transaction واحدة، يمنع التكرار، ينشئ الآباء الناقصين، ويرجع batch_id ونتيجة تحقق. لا تستخدمه قبل project_import_preview بنفس الصفوف تماماً.',
    args: [
      { name: 'project_name', type: 'string', required: true },
      { name: 'kind', type: 'string', required: true, description: 'land|residential_building|tower|compound|custom' },
      { name: 'project_id', type: 'string', description: 'معرف مشروع موجود للتحديث' },
      { name: 'currency', type: 'string', description: 'رمز العملة' },
      { name: 'source_name', type: 'string', description: 'اسم المصدر' },
      { name: 'rows', type: 'array', required: true, description: 'الصفوف بعد مراجعة المعاينة (مطابقة تماماً لما عُرض في preview)' },
      { name: 'update_existing', type: 'boolean', description: 'تحديث الأصول الموجودة بنفس المفتاح بدلاً من تخطيها' },
      { name: 'preview_token', type: 'string', description: 'الرمز المعاد من project_import_preview لنفس الصفوف' },
      { name: 'preview_confirmed', type: 'boolean', description: 'true بعد مراجعة المعاينة ومعالجة أخطائها' },
    ],
    handler: async (args) => {
      const plan = planFromArgs(args)
      const key = planHash(plan)
      const tokenOk = args.preview_token != null && String(args.preview_token) === key
      const confirmedOk = args.preview_confirmed === true && previewedCommits.has(key)
      if (!tokenOk && !confirmedOk) throw new Error('اعتماد المشروع يتطلب معاينة سابقة بنفس الصفوف: نفّذ project_import_preview أولاً ثم أعد نفس rows مع preview_token أو preview_confirmed=true.')
      previewedCommits.delete(key)
      return { result: await commitProjectImport(plan) }
    },
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
    name: 'attach_media_to_entity',
    description: 'ربط مرفق موجود في المحادثة بعقار أو عرض محدد. استخدمه فقط بعد قراءة قائمة المرفقات وتحديد الهدف؛ target_type property للعقار أو offer للعرض. العملية لا تحذف المرفق الأصلي وهي idempotent، وتعيد قراءة الهدف ضمنياً لتأكيد الربط.',
    args: [
      { name: 'attachment_id', type: 'string', description: 'معرف المرفق من list_attachments' },
      { name: 'attachment_name', type: 'string', description: 'اسم الملف الكامل عند عدم استخدام attachment_id' },
      { name: 'target_type', type: 'string', required: true, description: 'property أو offer' },
      { name: 'target_id', type: 'string', required: true, description: 'معرف العقار أو العرض الموجود' },
    ],
    handler: async (args) => {
      const targetType = String(args.target_type || '') as MediaTargetType
      if (targetType !== 'property' && targetType !== 'offer') throw new Error('target_type يجب أن يكون property أو offer.')
      if (!String(args.attachment_id || '').trim() && !String(args.attachment_name || '').trim()) throw new Error('حدد attachment_id أو attachment_name للمرفق.')
      return linkAttachmentToEntity({ attachmentId: args.attachment_id ? String(args.attachment_id) : undefined, attachmentName: args.attachment_name ? String(args.attachment_name) : undefined, targetType, targetId: String(args.target_id), sessionId: args.__session_id ? String(args.__session_id) : undefined })
    },
  },
  {
    name: 'create_offer_with_reminder',
    description: 'إنشاء عرض شراء أو بيع محلياً ثم ضبط صفر أو عدة تنبيهات متابعة مستقلة له في العملية نفسها. استخدم reminders[] للتنبيهات المتعددة، وreminder_at كاختصار رجعي واحد. اقرأ العقار والعميل أولاً، واستدعِ current_local_time إذا كان الموعد نسبياً؛ كل موعد يجب أن يكون ISO واضحاً وفي المستقبل.',
    args: [
      { name: 'property_id', type: 'string', description: 'معرف العقار الموجود؛ اختياري لعرض طلب الشراء ويمكن ربطه لاحقاً' },
      { name: 'client_id', type: 'string', required: true, description: 'معرف العميل الموجود' },
      { name: 'type', type: 'string', required: true, description: 'buy_offer أو sell_offer' },
      { name: 'amount', type: 'number', required: true, description: 'قيمة العرض بالريال اليمني' },
      { name: 'status', type: 'string', description: 'pending أو accepted أو rejected أو countered' },
      { name: 'date', type: 'string', description: 'تاريخ العرض YYYY-MM-DD' },
      { name: 'notes', type: 'string', description: 'ملاحظات العرض' },
      { name: 'reminder_at', type: 'string', description: 'توافق رجعي: موعد تنبيه واحد بصيغة ISO في المستقبل' },
      { name: 'reminders', type: 'array', description: 'مصفوفة تنبيهات مستقلة، كل عنصر يحتوي remind_at وtitle اختياري وbody اختياري' },
    ],
    handler: async (args) => {
      if (!(Number(args.amount) >= 0)) throw new Error('مبلغ العرض غير صالح.')
      const type = String(args.type || 'buy_offer')
      if (type === 'sell_offer' && !String(args.property_id || '').trim()) throw new Error('عرض البيع يحتاج عقاراً مرتبطاً.')
      const reminderItems = Array.isArray(args.reminders) ? args.reminders.map((item) => item && typeof item === 'object' ? item : {}) : []
      if (args.reminder_at) reminderItems.unshift({ remind_at: String(args.reminder_at), title: 'متابعة العرض', body: '' })
      const reminders = reminderItems.map((item) => ({ remindAt: String(item.remind_at || ''), title: item.title ? String(item.title) : 'متابعة العرض', body: item.body ? String(item.body) : '' }))
      for (const reminder of reminders) {
        const parsed = new Date(reminder.remindAt)
        if (!reminder.remindAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) throw new Error('أحد مواعيد التنبيه غير صالح أو منتهٍ؛ استخدم current_local_time ثم أرسل مواعيد مستقبلية.')
      }
      const created = await agentCreate({
        entity: 'offers',
        data: {
          property_id: args.property_id ? String(args.property_id) : null,
          client_id: String(args.client_id),
          type,
          amount: Number(args.amount),
          status: String(args.status || 'pending'),
          date: args.date ? String(args.date) : new Date().toISOString().slice(0, 10),
          notes: args.notes ? String(args.notes) : '',
        },
      })
      if (!reminders.length) return { id: created.id, offerCreated: true, reminderScheduled: false, reminders: [] }
      const offers = await getAllOffers()
      const offer = offers.find((item) => item.id === created.id)
      if (!offer) throw new Error('أُنشئ العرض لكن تعذر قراءته لضبط التنبيهات.')
      const createdReminderIds: string[] = []
      try {
        for (const reminder of reminders) {
          const reminderId = await createOfferReminder({ offerId: created.id, remindAt: reminder.remindAt, title: reminder.title, body: reminder.body, propertyName: offer.property_name, clientName: offer.client_name, amount: Number(offer.amount) || 0 })
          createdReminderIds.push(reminderId)
        }
      } catch (error) {
        for (const reminderId of createdReminderIds) await cancelOfferReminderById(reminderId).catch(() => {})
        return {
          id: created.id,
          offerCreated: true,
          partial: true,
          reminderScheduled: false,
          reminderError: error instanceof Error ? error.message : String(error),
          reminders: await getOfferReminders(created.id),
        }
      }
      return { id: created.id, offerCreated: true, partial: false, reminderScheduled: true, reminders: await getOfferReminders(created.id) }
    },
  },
  {
    name: 'offer_reminder_set',
    description: 'إضافة أو إلغاء تنبيه مستقل لعرض موجود. action=set يضيف موعداً جديداً ولا يلغي التنبيهات الأخرى؛ action=cancel يحتاج reminder_id، أو يلغي الوحيد إذا كان هناك تنبيه واحد. استخدم list_offer_reminders قبل الإلغاء عند وجود أكثر من موعد.',
    args: [
      { name: 'offer_id', type: 'string', required: true, description: 'معرف العرض الموجود' },
      { name: 'action', type: 'string', required: true, description: 'set أو cancel' },
      { name: 'reminder_id', type: 'string', description: 'معرف التنبيه عند الإلغاء' },
      { name: 'reminder_at', type: 'string', description: 'موعد التنبيه ISO في المستقبل عند action=set' },
      { name: 'title', type: 'string', description: 'عنوان اختياري للتنبيه' },
      { name: 'body', type: 'string', description: 'تفاصيل اختيارية للتنبيه' },
    ],
    handler: async (args) => {
      const offerId = String(args.offer_id || '')
      const action = String(args.action || 'set')
      const offer = (await getAllOffers()).find((item) => item.id === offerId)
      if (!offer) throw new Error('العرض غير موجود.')
      if (action === 'cancel') {
        const existing = await getOfferReminders(offerId)
        const reminderId = args.reminder_id ? String(args.reminder_id) : existing.length === 1 ? existing[0].id : ''
        if (!reminderId) throw new Error('حدد reminder_id لأن العرض يحتوي عدة تنبيهات، أو استخدم list_offer_reminders أولاً.')
        await cancelOfferReminderById(reminderId)
        return { offerId, reminderId, reminderScheduled: false, cancelled: true }
      }
      if (action !== 'set') throw new Error('action يجب أن يكون set أو cancel.')
      const reminderAt = String(args.reminder_at || '')
      const parsed = new Date(reminderAt)
      if (!reminderAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) throw new Error('موعد التنبيه غير صالح أو منتهٍ؛ استخدم current_local_time ثم أرسل موعداً مستقبلياً.')
      const reminderId = await createOfferReminder({ offerId, remindAt: parsed.toISOString(), title: args.title ? String(args.title) : 'متابعة العرض', body: args.body ? String(args.body) : '', propertyName: offer.property_name, clientName: offer.client_name, amount: Number(offer.amount) || 0 })
      return { offerId, reminderId, reminderScheduled: true, reminderAt: parsed.toISOString() }
    },
  },
  {
    name: 'list_offer_reminders',
    description: 'عرض كل التنبيهات المحلية المجدولة المرتبطة بعرض محدد، مع معرف كل تنبيه وموعده، قبل الإلغاء أو التعديل.',
    args: [{ name: 'offer_id', type: 'string', required: true, description: 'معرف العرض الموجود' }],
    handler: async (args) => {
      const offerId = String(args.offer_id || '')
      const offer = (await getAllOffers()).find((item) => item.id === offerId)
      if (!offer) throw new Error('العرض غير موجود.')
      const reminders = await getOfferReminders(offerId)
      return { offerId, reminders: reminders.map((reminder) => ({ id: reminder.id, title: reminder.title, body: reminder.body, remind_at: reminder.remind_at, local_time: new Date(reminder.remind_at).toLocaleString('ar-YE', { dateStyle: 'full', timeStyle: 'short' }), status: reminder.status })) }
    },
  },
  {
    name: 'create_reminder',
    description: 'إنشاء تنبيه محلي متعدد الاستخدام: عام، أو مرتبط بعرض أو عقار أو عميل أو معاينة أو مشروع أو دفعة. يمكن إنشاء عدة تنبيهات للكيان نفسه. اقرأ current_local_time قبل تحويل الموعد النسبي، وأرسل remind_at بصيغة ISO مستقبلية واضحة. يعمل الإشعار حتى عند إغلاق التطبيق.',
    args: [
      { name: 'title', type: 'string', required: true, description: 'عنوان مختصر لما يجب تذكّره' },
      { name: 'remind_at', type: 'string', required: true, description: 'الموعد بصيغة ISO في المستقبل' },
      { name: 'body', type: 'string', description: 'تفاصيل إضافية للتذكير' },
      { name: 'target_type', type: 'string', description: 'general أو offer أو property أو client أو viewing أو project أو payment' },
      { name: 'target_id', type: 'string', description: 'معرف الكيان المحلي عند ربط التنبيه به' },
    ],
    handler: async (args) => {
      const id = await createReminder({ title: String(args.title || ''), body: args.body ? String(args.body) : '', remind_at: String(args.remind_at || ''), target_type: args.target_type ? String(args.target_type) : 'general', target_id: args.target_id ? String(args.target_id) : '' })
      const reminder = await getReminder(id)
      return { id, reminderCreated: true, target_type: reminder?.target_type ?? 'general', target_id: reminder?.target_id ?? '', reminder: reminder ? { id: reminder.id, title: reminder.title, body: reminder.body, remind_at: reminder.remind_at, target_type: reminder.target_type, target_id: reminder.target_id, status: reminder.status } : null }
    },
  },
  {
    name: 'list_reminders',
    description: 'عرض التنبيهات المحلية المجدولة القادمة، عامة أو مرتبطة بكيان محدد. استخدم target_type وtarget_id لتضييق القائمة.',
    args: [
      { name: 'target_type', type: 'string', description: 'نوع الكيان أو general' },
      { name: 'target_id', type: 'string', description: 'معرف الكيان عند التضييق' },
    ],
    handler: async (args) => {
      const targetType = String(args.target_type ?? '').trim()
      const requestedId = String(args.target_id ?? '').trim()
      let reminders: any[]
      if (targetType && requestedId) {
        reminders = await getRemindersForTarget(targetType, requestedId)
        // طلبات المستخدم قد تحدد عقاراً أو اسم عقار بينما التنبيه مخزن على
        // العرض. عند target_type=offer نحل المعرف المرشح عبر العروض المحلية
        // قبل إعلان قائمة فارغة؛ لا نغيّر البيانات ولا نوسّع البحث خارج SQLite.
        if (!reminders.length && targetType === 'offer') {
          const offers = await getAllOffers()
          const matchingOfferIds = offers
            .filter((offer: any) => String(offer.id) === requestedId || String(offer.property_id ?? '') === requestedId || String(offer.property_name ?? '') === requestedId)
            .map((offer: any) => String(offer.id))
          if (matchingOfferIds.length) {
            const resolved = await Promise.all(matchingOfferIds.map((offerId) => getRemindersForTarget('offer', offerId)))
            reminders = resolved.flat()
          }
        }
      } else {
        reminders = await getAllReminders()
      }
      return { reminders: reminders.map((reminder) => ({ id: reminder.id, title: reminder.title, body: reminder.body, remind_at: reminder.remind_at, target_type: reminder.target_type, target_id: reminder.target_id, local_time: new Date(reminder.remind_at).toLocaleString('ar-YE', { dateStyle: 'full', timeStyle: 'short' }), status: reminder.status })) }
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
  {
    name: 'ledger_reverse_payment',
    description: 'عكس دفعة مسجلة خطأً: يحذف القيد ويعيد حساب مدفوع/متبقي القطعة وحالتها داخل transaction. يتطلب موافقة المستخدم للدفعات المالية.',
    args: [
      { name: 'payment_id', type: 'string', required: true, description: 'معرف الدفعة (plot_payments) المراد عكسها' },
      { name: 'plot_id', type: 'string', description: 'معرف القطعة للتأكيد (اختياري لكنه يمنع العكس الخاطئ)' },
      { name: 'reason', type: 'string', description: 'سبب العكس للتدقيق' },
    ],
    handler: async (args) => {
      const { reverseLedgerPayment } = await import('../domain/projectDomain')
      return reverseLedgerPayment(String(args.payment_id || ''), args.plot_id ? String(args.plot_id) : undefined, args.reason ? String(args.reason) : '')
    },
  },
  {
    name: 'reminder_update',
    description: 'تعديل عنوان/تفاصيل/موعد تذكير موجود (الموعد مستقبلي ISO). بديل آمن للإلغاء+إنشاء.',
    args: [
      { name: 'reminder_id', type: 'string', required: true },
      { name: 'title', type: 'string' },
      { name: 'body', type: 'string' },
      { name: 'remind_at', type: 'string', description: 'موعد ISO مستقبلي' },
    ],
    handler: async (args) => {
      await updateReminder(String(args.reminder_id || ''), { title: args.title ? String(args.title) : undefined, body: args.body ? String(args.body) : undefined, remind_at: args.remind_at ? String(args.remind_at) : undefined })
      return { id: String(args.reminder_id), updated: true }
    },
  },
  {
    name: 'list_entity_media',
    description: 'سرد روابط الوسائط لكيان (عقار/عرض) قبل فك ربط أو مراجعة.',
    args: [
      { name: 'target_type', type: 'string', required: true },
      { name: 'target_id', type: 'string', required: true },
    ],
    handler: async (args) => ({ links: await listEntityMedia(String(args.target_type), String(args.target_id)) }),
  },
  {
    name: 'unlink_entity_media',
    description: 'فك ربط وسيط عن كيان دون حذف المرفق الأصلي. يتطلب موافقة عند الوسائط المهمة.',
    args: [{ name: 'link_id', type: 'string', required: true }],
    handler: async (args) => { await unlinkEntityMedia(String(args.link_id)); return { id: String(args.link_id), unlinked: true } },
  },
  {
    name: 'project_memory_clear',
    description: 'مسح ذاكرة مشروع ملوثة/قديمة أو حذف إدخال واحد منها.',
    args: [
      { name: 'workspace_id', type: 'string', description: 'مسح كل ذاكرة المشروع' },
      { name: 'entry_id', type: 'string', description: 'حذف إدخال واحد بالمعرف' },
    ],
    handler: async (args) => {
      if (args.entry_id) { await deleteProjectMemoryEntry(String(args.entry_id)); return { entry_id: String(args.entry_id), deleted: true } }
      if (!args.workspace_id) throw new Error('workspace_id أو entry_id مطلوب.')
      await clearProjectMemory(String(args.workspace_id))
      return { workspace_id: String(args.workspace_id), cleared: true }
    },
  },
  {
    name: 'bulk_mutate',
    description: 'تنفيذ עד 20 عملية إنشاء/تعديل متجانسة دفعة واحدة مع ملخص نجاح/فشل لكل عنصر. للقراءات المتوازية استخدم orchestrate؛ للكتابة الحساسة استخدم الحلقة تسلسلياً.',
    args: [
      { name: 'operation', type: 'string', required: true, description: 'create أو update' },
      { name: 'entity', type: 'string', required: true },
      { name: 'items', type: 'array', required: true, description: 'مصفوفة {id?, data} — حد أقصى 20' },
    ],
    handler: async (args) => {
      const op = String(args.operation || '')
      const entity = String(args.entity || '')
      const items = Array.isArray(args.items) ? args.items : []
      if (!['create', 'update'].includes(op)) throw new Error('operation يجب أن يكون create أو update.')
      if (!items.length || items.length > 20) throw new Error('items يجب أن تكون 1..20 عنصراً.')
      const results: any[] = []
      for (const it of items) {
        try {
          const out = op === 'create'
            ? await agentCreate({ entity: entity as any, data: (it?.data ?? {}) as any })
            : await agentUpdate({ entity: entity as any, id: String(it?.id ?? ''), data: (it?.data ?? {}) as any })
          results.push({ ok: true, ...out })
        } catch (e: any) { results.push({ ok: false, error: e?.message ?? String(e) }) }
      }
      return { entity, operation: op, total: results.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results }
    },
  },
  {
    name: 'export_entity_csv',
    description: 'تصدير كيان إلى CSV نصي (حتى 500 صف) لمراجعته أو توليد ملف عبر generate_file. يعيد النص والعدد.',
    args: [
      { name: 'entity', type: 'string', required: true },
      { name: 'search', type: 'string' },
      { name: 'limit', type: 'number', description: 'حتى 500' },
    ],
    handler: async (args) => {
      const { queryEntities } = await import('./query')
      const { getEntityDef } = await import('./catalog')
      const entity = String(args.entity)
      const def = getEntityDef(entity)
      if (!def) throw new Error(`كيان غير معروف: ${entity}`)
      const limit = Math.min(500, Math.max(1, Number(args.limit ?? 200)))
      const page = await queryEntities({ entity: entity as any, search: args.search ? String(args.search) : undefined, limit, offset: 0 })
      const cols = def.fields.filter((f) => f.name !== 'geojson').map((f) => f.name)
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [cols.join(','), ...page.rows.map((r: any) => cols.map((c) => esc(r[c])).join(','))].join('\n')
      return { entity, total: page.total, exported: page.rows.length, csv: csv.slice(0, 60000) }
    },
  },
]
