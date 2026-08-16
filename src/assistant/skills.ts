import type { AgentPlan, AgentSkill, SkillMatch } from './agentContract'
import { makePlan } from './agentContract'

export const AGENT_SKILLS: AgentSkill[] = [
  {
    id: 'project_operations',
    label: 'إدارة المشروع العقاري',
    description: 'ينشئ وينظم المشاريع الهرمية وبلوكاتها وقطعها ووحداتها ويتابع سلامة الروابط والبيانات المالية.',
    triggers: ['أنشئ مشروع', 'إنشاء مشروع', 'مشروع عقاري', 'أضف بلوك', 'أنشئ بلوك', 'أضف قطعة', 'أنشئ قطعة', 'طابق', 'وحدة سكنية', 'عدّل القطعة', 'تعديل المشروع'],
    preferredTools: ['project_profile_get', 'project_nodes_list', 'project_tree', 'project_financials', 'project_cashflow', 'project_integrity_check', 'query', 'get', 'create', 'update'],
    readTools: ['project_profile_get', 'project_nodes_list', 'project_tree', 'project_financials', 'project_cashflow', 'project_integrity_check', 'query', 'get'],
    writeTools: ['create', 'update'],
    requiredInputs: ['هوية المشروع عند التعديل؛ واسم المشروع ونوعه عند الإنشاء؛ وهوية الأصل عند التعديل'],
    questionPolicy: 'ask_on_missing',
    verificationTools: ['project_tree', 'project_financials', 'project_integrity_check'],
    recoveryPolicy: 'replan',
    systemGuidance: 'تعامل مع المشروع كهرم: مشروع ثم بلوك/مبنى ثم قطعة/وحدة ثم دفعات. اقرأ المستوى الأب قبل إنشاء المستوى الابن، لا تكرر الأكواد، ولا تعلن سلامة المشروع قبل قراءة integrity أو tree بعد الكتابة.',
  },
  {
    id: 'project_import',
    label: 'تنظيم مشروع عقاري',
    description: 'يحوّل البيانات غير المنظمة إلى مشروع هرمي قابل للمراجعة والإدارة.',
    triggers: ['مشروع', 'بلوك', 'قطعة', 'وحدة', 'طابق', 'برج', 'عمارة', 'أرض', 'استيراد', 'جدول'],
    preferredTools: ['project_profile_get', 'project_import_preview', 'project_import_commit', 'project_integrity_check'],
    readTools: ['project_profile_get', 'project_nodes_list', 'project_integrity_check', 'read_uploaded_file'],
    writeTools: ['project_import_commit'],
    requiredInputs: ['اسم المشروع أو معرفه', 'صفوف البيانات أو الملف', 'نوع المشروع عند عدم وضوحه'],
    questionPolicy: 'ask_on_missing',
    verificationTools: ['project_integrity_check', 'project_profile_get'],
    recoveryPolicy: 'replan',
    systemGuidance: 'تتعامل مع إدخال المشاريع كتحويل قابل للمراجعة: اكتشف النوع، عاين الصفوف، أصلح الغموض، اعتمد دفعة ذرية، ثم افحص السلامة.',
  },
  {
    id: 'cashflow',
    label: 'إدارة الدفعات والتدفقات النقدية',
    description: 'يسجل الدفعة كقيد مالي ويراجع التحصيل والمتبقي دون تعديل أرقام يدوياً.',
    triggers: ['دفعة', 'دفع', 'قسط', 'أقساط', 'تحصيل', 'متبقي', 'مبلغ', 'سند', 'تدفق', 'مالي'],
    preferredTools: ['project_profile_get', 'ledger_record_payment', 'project_cashflow', 'project_integrity_check'],
    readTools: ['project_profile_get', 'project_nodes_list', 'project_cashflow', 'project_integrity_check'],
    writeTools: ['ledger_record_payment'],
    requiredInputs: ['المشروع', 'الأصل أو القطعة', 'المبلغ', 'تاريخ الدفع', 'الوسيلة'],
    questionPolicy: 'never_guess',
    verificationTools: ['project_cashflow', 'project_integrity_check'],
    recoveryPolicy: 'ask_user',
    systemGuidance: 'لا تخمّن أصل الدفعة ولا العملة ولا التاريخ. استخدم دفتر النقد، امنع التجاوز، واعرض التحصيل والفروقات بعد التسجيل.',
  },
  {
    id: 'project_review',
    label: 'مراجعة سلامة المشروع',
    description: 'يفحص الروابط والعدادات والفروقات المالية ويشرح ما يحتاج تصحيحاً.',
    triggers: ['راجع', 'مراجعة', 'تدقيق', 'سلامة', 'فروقات', 'ناقص', 'يتيم', 'تحقق', 'صحح'],
    preferredTools: ['project_integrity_check', 'project_tree', 'project_financials', 'project_cashflow'],
    readTools: ['project_integrity_check', 'project_tree', 'project_financials', 'project_cashflow'],
    writeTools: ['ledger_record_payment', 'project_import_commit'],
    requiredInputs: ['مشروع أو نطاق واضح'],
    questionPolicy: 'safe_defaults',
    verificationTools: ['project_integrity_check'],
    recoveryPolicy: 'replan',
    systemGuidance: 'ابدأ بتشخيص قابل للتكرار، افصل الأخطاء المؤكدة عن النواقص، ولا تصلح البيانات تلقائياً قبل توضيح أثر الإصلاح.',
  },
  {
    id: 'reporting',
    label: 'تحليل وإعداد تقرير',
    description: 'يجمع الأرقام الفعلية ويحوّلها إلى تقرير واضح قابل للمشاركة.',
    triggers: ['تقرير', 'ملخص', 'إحصاء', 'كم', 'إجمالي', 'نسبة', 'مبيعات', 'تحليل'],
    preferredTools: ['data_snapshot', 'project_financials', 'project_cashflow', 'generate_file'],
    readTools: ['data_snapshot', 'project_tree', 'project_financials', 'project_cashflow'],
    writeTools: ['generate_file'],
    requiredInputs: ['النطاق أو الفترة عند الحاجة'],
    questionPolicy: 'safe_defaults',
    verificationTools: ['data_snapshot', 'project_integrity_check'],
    recoveryPolicy: 'retry',
    systemGuidance: 'الأرقام يجب أن تأتي من قاعدة البيانات، واذكر النطاق والفترة والعملة وحالة أي بيانات غير مكتملة.',
  },
  {
    id: 'offer_management',
    label: 'إدارة العروض والتنبيهات',
    description: 'ينشئ عروض البيع والشراء ويربط بها تنبيهات متابعة محلية في مواعيد مستقبلية.',
    triggers: ['عرض شراء', 'عرض بيع', 'العروض', 'تنبيه العرض', 'تنبيه', 'تذكير العرض', 'تذكير', 'ذكرني', 'ذكّرني', 'إشعار', 'اشعار', 'موعد متابعة'],
    preferredTools: ['current_local_time', 'query', 'get', 'list_attachments', 'attach_media_to_entity', 'create_offer_with_reminder', 'offer_reminder_set', 'create_reminder', 'list_reminders', 'cancel_reminder'],
    readTools: ['current_local_time', 'query', 'get', 'catalog', 'list_attachments', 'list_reminders'],
    writeTools: ['attach_media_to_entity', 'create_offer_with_reminder', 'offer_reminder_set', 'create_reminder', 'cancel_reminder', 'create', 'update'],
    requiredInputs: ['نص التذكير وموعده في التذكير العام؛ أو العقار والعميل والمبلغ عند إنشاء عرض'],
    questionPolicy: 'ask_on_missing',
    verificationTools: ['get', 'query'],
    recoveryPolicy: 'ask_user',
    systemGuidance: 'للعرض اقرأ العقار والعميل أولاً ثم أنشئ العرض واضبط تنبيهه، أما التذكير العام فاجمع نص المهمة والموعد فقط. اقرأ الوقت المحلي عند كل موعد نسبي، وأعد قراءة النتيجة للتحقق. لا تضبط موعداً منتهياً ولا تدّعِ إرسال إشعار سحابي؛ هذه تنبيهات محلية على جهاز المستخدم.',
  },
  {
    id: 'data_search',
    label: 'بحث وتنظيم البيانات',
    description: 'يبحث في البيانات المحلية ويعيد ترتيبها قبل أي تعديل.',
    triggers: ['ابحث', 'أين', 'اعثر', 'اعرض', 'قائمة', 'بيانات', 'عميل', 'عقار'],
    preferredTools: ['search_everything', 'query', 'get'],
    readTools: ['search_everything', 'query', 'get'],
    writeTools: [],
    requiredInputs: ['كلمة أو نطاق البحث'],
    questionPolicy: 'safe_defaults',
    verificationTools: ['query'],
    recoveryPolicy: 'retry',
    systemGuidance: 'ابدأ بالبحث الأوسع عندما لا يحدد المستخدم القسم، ثم ضيّق النتائج ولا تنفذ كتابة ضمنية.',
  },
  {
    id: 'property_management',
    label: 'إدارة العقارات والوسائط',
    description: 'ينظم بيانات العقار وسعره وتصنيفه ووسائطه وبيانات الدلال دون خلطها ببيانات العرض أو العميل.',
    triggers: ['عقار', 'عقارات', 'بيت', 'فندق', 'عمارة', 'برج سكني', 'مزرعة', 'قطعة أرض', 'هنجر', 'محل', 'سعر العقار', 'صورة العقار', 'فيديو العقار'],
    preferredTools: ['catalog', 'query', 'get', 'list_attachments', 'attach_media_to_entity', 'create', 'update', 'preview_update', 'data_snapshot'],
    readTools: ['catalog', 'query', 'get', 'list_attachments', 'search_everything', 'data_snapshot'],
    writeTools: ['attach_media_to_entity', 'create', 'update', 'custom_field_set'],
    requiredInputs: ['هوية العقار عند التعديل؛ والاسم أو البيانات الأساسية عند الإنشاء'],
    questionPolicy: 'ask_on_missing',
    verificationTools: ['get', 'query'],
    recoveryPolicy: 'ask_user',
    systemGuidance: 'افصل دائماً بين سجل العقار وسجل العرض وسجل العميل. لا تستبدل الوسائط ولا تحذفها ضمنياً. اقرأ السجل قبل التعديل، وأعد قراءته بعد الحفظ للتحقق من الحقول المتغيرة فقط.',
  },
  {
    id: 'client_relationship',
    label: 'إدارة العملاء والعلاقات',
    description: 'ينظم العملاء وبيانات الاتصال والارتباطات بالعروض والمشاهدات دون افتراض هوية أو رقم.',
    triggers: ['عميل', 'العميل', 'مشتري', 'بائع', 'هاتف العميل', 'رقم العميل', 'جهة اتصال', 'اتصل بالعميل', 'بيانات العميل'],
    preferredTools: ['catalog', 'query', 'get', 'create', 'update', 'search_everything'],
    readTools: ['catalog', 'query', 'get', 'search_everything'],
    writeTools: ['create', 'update'],
    requiredInputs: ['هوية العميل عند التعديل؛ والاسم أو وسيلة تعريف عند الإنشاء'],
    questionPolicy: 'never_guess',
    verificationTools: ['get', 'query'],
    recoveryPolicy: 'ask_user',
    systemGuidance: 'لا تدمج شخصين متشابهين بالاسم. اعرض المطابقات واطلب تحديداً عند الالتباس. حافظ على رقم الهاتف كما أدخله المستخدم بعد تطبيع المسافات فقط، واربط العرض بالعميل عبر المعرف لا عبر النص.',
  },
  {
    id: 'workspace_operations',
    label: 'إدارة الجداول ومساحات العمل',
    description: 'يبني جداول محلية مرنة للبيانات التي لا يغطيها النموذج العقاري الأساسي، مع حماية بنية الأعمدة والصفوف.',
    triggers: ['مساحة عمل', 'جدول', 'صف', 'صفوف', 'عمود', 'أعمدة', 'ورقة', 'داتا', 'بيانات مخصصة'],
    preferredTools: ['list_workspaces', 'workspace_get', 'workspace_create', 'workspace_add_table', 'workspace_add_row', 'workspace_update_row', 'workspace_import_rows', 'workspace_create_full_table'],
    readTools: ['list_workspaces', 'workspace_get', 'list_attachments', 'file_preview'],
    writeTools: ['workspace_create', 'workspace_add_table', 'workspace_add_row', 'workspace_update_row', 'workspace_import_rows', 'workspace_create_full_table', 'workspace_rename_table', 'workspace_rename_column'],
    requiredInputs: ['مساحة العمل أو الجدول المستهدف عند التعديل؛ وعنوان واضح عند الإنشاء'],
    questionPolicy: 'ask_on_missing',
    verificationTools: ['workspace_get'],
    recoveryPolicy: 'replan',
    systemGuidance: 'اقرأ بنية مساحة العمل والجدول قبل الكتابة. في الاستيراد اعرض معاينة أو ملخصاً للصفوف والتكرار. لا تغيّر أسماء الأعمدة أو تحذف صفوفاً دون طلب صريح وموافقة عند الخطر.',
  },
  {
    id: 'general_assistant',
    label: 'مساعد عقاري عام',
    description: 'يفهم السؤال العام ويطلب التحديد قبل الدخول في عملية تنفيذية.',
    triggers: [],
    preferredTools: ['catalog', 'data_snapshot'],
    readTools: ['catalog', 'data_snapshot'],
    writeTools: [],
    requiredInputs: [],
    questionPolicy: 'ask_on_missing',
    verificationTools: [],
    recoveryPolicy: 'ask_user',
    systemGuidance: 'كن واضحاً ومباشراً. لا تحوّل السؤال العام إلى عملية كتابة أو استيراد بلا طلب صريح.',
  },
]

export interface SkillAssessment {
  match: SkillMatch
  intent: 'conversation' | 'execution' | 'question' | 'ambiguous'
  shouldPlan: boolean
  confidence: number
}

function classifyIntent(text: string, match: SkillMatch): SkillAssessment['intent'] {
  const normalized = String(text ?? '').trim().toLowerCase()
  if (!normalized || /^(مرحبا|مرحباً|هلا|أهلا|اهلا|السلام عليكم|شكرا|شكرًا|كيف حالك)[!.؟\s]*$/.test(normalized)) return 'conversation'
  if (match.skill.id === 'general_assistant') return /\?|؟|ما الذي|كيف|هل/.test(normalized) ? 'question' : 'ambiguous'
  if (/أنشئ|أضف|سجل|سجّل|عدّل|عدل|حدّث|احذف|حذف|استورد|استيراد|ذكرني|تذكير|اعرض|ابحث|راجع|حلل|احسب/.test(normalized)) return 'execution'
  return 'ambiguous'
}

export function matchSkill(text: string): SkillMatch {
  const normalized = String(text ?? '').toLowerCase()
  const ranked = AGENT_SKILLS.map((skill) => {
    const hits = skill.triggers.filter((trigger) => normalized.includes(trigger.toLowerCase()))
    const specificityBonus = skill.id === 'general_assistant' || skill.id === 'data_search' ? 0 : 0.08
    const score = skill.id === 'general_assistant' ? 0.1 : hits.length ? Math.min(0.98, 0.2 + hits.length * 0.15 + specificityBonus) : 0
    return { skill, score, missingInputs: [], reasons: hits.length ? [`مطابقة الكلمات: ${hits.join('، ')}`] : [] }
  }).sort((a, b) => b.score - a.score)
  return ranked[0] ?? { skill: AGENT_SKILLS[AGENT_SKILLS.length - 1], score: 0.1, missingInputs: [], reasons: [] }
}

export function getSkillById(id: string): AgentSkill | undefined {
  return AGENT_SKILLS.find((skill) => skill.id === id)
}

export function assessSkill(text: string): SkillAssessment {
  const match = matchSkill(text)
  const intent = classifyIntent(text, match)
  const shouldPlan = intent === 'execution' && match.skill.id !== 'general_assistant' && match.score >= 0.2
  return { match, intent, shouldPlan, confidence: shouldPlan ? match.score : Math.max(0.1, match.score) }
}

export function planForSkill(skill: AgentSkill, goal: string): AgentPlan {
  const common = [
    { id: 'understand', title: 'فهم المطلوب وتحديد النطاق', detail: 'أقرأ الطلب وأحدد نوع البيانات والنتيجة المطلوبة.' },
    { id: 'inspect', title: 'قراءة الحالة الحالية', detail: 'أتحقق مما هو موجود قبل أي قرار أو كتابة.' },
  ]
  const specific = skill.id === 'project_import'
    ? [
        { id: 'preview', title: 'معاينة وتطبيع البيانات', detail: 'أحدد نوع المشروع والآباء والأصول وأكشف الأخطاء والتكرار.' },
        { id: 'commit', title: 'اعتماد الإدخال على دفعة واحدة', detail: 'أكتب البيانات بعد موافقة المعاينة وبداخل معاملة محلية.' },
        { id: 'verify', title: 'فحص سلامة المشروع', detail: 'أراجع الروابط والعدادات والمبالغ قبل إعلان الاكتمال.' },
      ]
    : skill.id === 'cashflow'
      ? [
          { id: 'locate_asset', title: 'تحديد المشروع والأصل', detail: 'أتأكد من القطعة أو الوحدة المرتبطة بالدفع.' },
          { id: 'record', title: 'تسجيل القيد المالي', detail: 'أتحقق من المبلغ والمتبقي ثم أسجل الدفعة.' },
          { id: 'verify', title: 'مراجعة التحصيل والمتبقي', detail: 'أقرأ دفتر النقد وأفحص أي فروقات.' },
        ]
      : skill.id === 'project_review'
        ? [
            { id: 'diagnose', title: 'تشخيص السلامة', detail: 'أبحث عن روابط مفقودة وفروقات عددية ومالية.' },
            { id: 'decide', title: 'تحديد الإصلاح الآمن', detail: 'أميز ما يمكن إصلاحه آلياً عما يحتاج قرار المستخدم.' },
            { id: 'verify', title: 'إعادة الفحص', detail: 'لا أغلق المهمة قبل أن تتغير نتيجة الفحص أو أشرح سبب بقائها.' },
          ]
        : [
            { id: 'answer', title: 'جمع المعلومات اللازمة', detail: 'أقرأ البيانات ذات الصلة فقط.' },
            { id: 'present', title: 'تنظيم النتيجة', detail: 'أعرضها بوضوح وأذكر حدودها.' },
          ]
  return makePlan(goal, [...common, ...specific], skill.id)
}
