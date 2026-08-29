import { TOOLS } from '../agent'
import type { AgentSkill } from './agentContract'
import type { BrainOp, AgentSettings } from './store'
import type { FunctionDef } from './llm'
import { buildToolSchemas } from './toolSchemas'
import { compactAppCatalog } from '../agent/catalog'

export const WRITE_TOOLS = new Set([
  'mutate_record',
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
  'workspace_add_columns',
  'workspace_alter_column',
  'workspace_create_full_table',
  'workspace_duplicate_table',
  'workspace_duplicate_workspace',
  'import_project_file',
  'remove_attachment',
  'project_import_commit',
  'ledger_record_payment',
  'create_offer_with_reminder',
  'offer_reminder_set',
  'create_reminder',
  'cancel_reminder',
])

export const DELETE_CONFIRM_TOOLS = new Set(['mutate_record', 'delete', 'workspace_delete', 'workspace_delete_table', 'workspace_delete_row'])

/** أدوات القراءة الآمنة المتاحة لكل مهارة؛ لا تمنح صلاحية كتابة. */
export const UNIVERSAL_TOOLS = new Set([
  'ask_user', 'request_confirmation', 'catalog', 'schema_inspect', 'app_screen_catalog', 'list_entities',
  'query', 'get', 'search_everything', 'data_snapshot', 'audit_log_query', 'audit_log_summary', 'review_my_work',
  'generate_file', 'preview_update', 'undo_last', 'project_memory_save', 'project_memory_read',
  'list_generated_files', 'review_generated_file', 'current_local_time', 'project_profile_get', 'project_nodes_list',
  'project_tree', 'project_financials', 'installment_schedule', 'buyer_summary', 'payment_ledger',
  'list_attachments', 'inspect_asset', 'read_uploaded_file',
  'dashboard_kpis', 'project_cashflow', 'project_integrity_check', 'list_workspaces', 'workspace_get',
])

export function buildSystemPrompt(s: AgentSettings, providerName: string, model: string, extraDirectives: string[] = [], brainOps: BrainOp[] = [], projectMemory = ''): string {
  const modeNote =
    'وضع التشغيل: تنفيذ موجه. كل أدوات التطبيق متاحة لك دائماً وأنت من يقرر المهارة والأداة. نفّذ مباشرةً. الإدخالات الجماعية للمشاريع: اعرض المعاينة أولاً ثم الاعتماد. الحذف والعمليات الحساسة تحتاج موافقة المستخدم. خيارات يقررها الوكيل自由اً دون قيود.'
  const directivesBlock = extraDirectives.length
    ? `\nتعليمات داخلية:\n${extraDirectives.map((d) => `- ${d}`).join('\n')}`
    : ''
  const brainBlock = brainOps.length
    ? `\nذاكرة العمل:\n${brainOps.map((b) => `[${b.kind}] ${b.body}`).join('\n')}`
    : ''
  const projectMemoryBlock = projectMemory
    ? `\nمذكرات المشروع:\n${projectMemory}`
    : ''
  return `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني). ذكي، عملي، مباشر، عربي فصحى واضح ودافئ.

${modeNote}

**الأدوات:** mutate_record (إنشاء/تعديل/حذف) + query/get (قراءة) + أدوات التخصص. كل أداة تُنفذ فوراً وتعود بـ [نجاح] أو [فشل]. لا تعاود الكتابة عشوائياً بعد الفشل: أعد القراءة ثم صحح.

**للطلبات المركّبة:** استخدم orchestrate لـ وكلاء فرعيين بالتوازي. راجع النتائج وصحح الفاشل.

**أقسام التطبيق:**
- العقارات: properties + waypoints + areas
- العملاء: clients
- العروض: offers (client_id = العميل، property_id اختياري للشراء)
- المشاريع: projects → blocks → plots (مع plot_payments)
- المالية: ledger_record_payment + project_cashflow + installment_schedule + payment_ledger + buyer_summary + dashboard_kpis
- التذكيرات: create_reminder + list_reminders + cancel_reminder (target_type + target_id). استطاع الوكيل إنشاء عدة تنبيهات لكل عميل أو عرض
- الوقت: current_local_time (للأوقات النسبية)
- المشاهدات: viewings | الحملات: campaigns
- مساحات العمل: workspace_* (بيانات جدولية حرة فقط)
- الملفات: list_attachments → inspect_asset → read_uploaded_file → import_project_file
- التوليد: generate_file (excel/word/pdf) — يظهر كبطاقة تحميل
- البحث: search_everything + schema_inspect + catalog + list_entities
- سجل التدقيق: audit_log_query + audit_log_summary
- المراجعة: review_my_work (إلزامي بعد تعديلات متعددة)

**قواعد صارمة:**
1. لا تتوقف عن السؤال: نفّذ الممكن فوراً، واجمع الأسئلة في سؤال واحد.
2. لا تخترع المعرفات: اجلبها من الاستعلام.
3. لا تُظهر أسماء أدوات أو JSON أو معرّفات داخلية — صِغ بلغة أعمال.
4. الأرقام من قاعدة البيانات (data_snapshot) لا من الذاكرة.
5. لا إقلاع تلقائي: لا تُشغّل أدوات في بداية محادثة أو رسالة عادية.
6. التكرار خطأ: لا تُدخل بيانات موجودة مسبقاً.
7. بعد التعديلات المتعددة: review_my_work إلزامي.
8. ولّد الملفات فوراً بـ generate_file بدون سؤال.

**نماذج المشاريع:**
- مشروع عقاري: projects/blocks/plots (لا workspace_*)
- مساحة عمل: workspace_* فقط لبيانات جدولية حرة
- الفصل صارم بينهما

**.setData:**
- المشاريع: plan → preview → commit → integrity check
- الكيانات: query → preview_update → mutate_record → get
- الدفعات: ledger_record_payment → project_cashflow → integrity check
- القطع: plot_no + area_sqm + value + status (available/sold/installment) + buyer_name + buyer_contact + paid_amount + remaining_amount

**التحقق:** تأكد من [تحقق] قبل إعلان النجاح. لا تتظاهر بالإنجاز لم يتم.

**الشفافية:** أخبر المستخدم أين البيانات (التبويب/الشاشة) وبطاقة «افتح».

**العرض:** إجابة نهائية فقط — لا تفاصيل تقنية. تنسيقMarkdown. لا backtick. استخدم تسميات عربية للحالات.

**الشخصية:** تحدث بحرارة. رحّب بالمحادثة العامة. شارك خبرتك العقارية. اسأل عند الغموض.

**llibs:** استمرارية على مراحل. لا تتوقف بعد خطوة واحدة. المهام الكبيرة: قسّمها بنفسك ونفّذ حتى النهاية.

${directivesBlock}${brainBlock}${projectMemoryBlock}

المزود: ${providerName} — الموديل: ${model}`
}

/** برومبت مختصر للرسائل البسيطة (تحية/سؤال عام) — بدون أدوات = أسرع */
export function buildMinimalPrompt(providerName: string, model: string): string {
  return `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني). ذكي، عملي، مباشر، عربي فصحى واضح ودافئ.
تحدث بحرارة. رحّب بالمحادثة العامة. شارك خبرتك العقارية.
المزود: ${providerName} — الموديل: ${model}`
}

/** تعريفات الأدوات المرئية للنموذج. نُرسل فقط الأدوات الأكثر استخداماً
 * لتقليل حجم الطلب، والوكيل يصل لأي أداة عبر execute wrapper. */
export function getAgentFunctions(_skill?: AgentSkill | null): FunctionDef[] {
  const schemas = buildToolSchemas()
  // الأدوات الأساسية فقط — الباقي متاح عبر execute wrapper
  const CORE_TOOLS = new Set([
    'query', 'get', 'mutate_record', 'search_everything',
    'ask_user', 'request_confirmation', 'undo_last',
    'list_entities', 'catalog', 'schema_inspect',
    'current_local_time', 'generate_file',
    'review_my_work', 'data_snapshot',
  ])
  const toolFns: FunctionDef[] = TOOLS
    .filter((t) => CORE_TOOLS.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: schemas[t.name] ?? { type: 'object', properties: {}, required: [] },
    }))
  const wrappers = WRAPPER_FUNCTIONS.map((wrapper) => wrapper.name === 'execute'
    ? { ...wrapper, description: `${wrapper.description}\nكل أدوات التطبيق متاحة لك عبر execute — اختر الأداة المناسبة واكتب اسمها ووسائطها.` }
    : wrapper)
  return [...toolFns, ...wrappers]
}

const WRAPPER_FUNCTIONS: FunctionDef[] = [
  {
    name: 'execute',
    description:
      'تنفيذ أداة داخلية من أدوات التطبيق: أرسل {tool: "اسم الأداة", args: {...}}. استخدم mutate_record للإنشاء والتعديل والحذف في الكيانات الأساسية. كل أدوات التطبيق متاحة لك؛ اختر الأداة المناسبة للمهمة.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'اسم الأداة الداخلية' },
        args: { type: 'object', description: 'معاملات الأداة' },
      },
      required: ['tool', 'args'],
    },
  },
  {
    name: 'orchestrate',
    description:
      'نفّذ عدة عمليات مستقلة بالتوازي عبر وكلاء فرعيين تحت توجيهك، ثم راجع نتائجهم وصحّح أو تراجع حسب الحاجة. استخدمها للطلبات المركّبة التي تمتد على أكثر من قسم/جدول/عملية في وقت واحد. tasks مصفوفة من {tool, args, label, skipVerify}. mode="execute" للتنفيذ المتوازي، "review" لمراجعة النتائج، "undo" للتراجع عن آخر عملية فرعية. كل نتيجة تعود بحالة [نجاح]/[فشل] ودليل تحقق (ثقة) — أنت القائد تقرر المتابعة أو التصحيح.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['execute', 'review', 'undo'], description: 'execute لتنفيذ المهام بالتوازي، review لمراجعتها، undo للتراجع' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: 'اسم الأداة الداخلية' },
              args: { type: 'object', description: 'وسائط الأداة' },
              label: { type: 'string', description: 'وصف إنساني للمهمة يظهر في المراجعة' },
              skipVerify: { type: 'boolean', description: 'تخطي التحقق لتسريع القراءات المجردة (افتراضي false)' },
            },
            required: ['tool', 'args'],
          },
          description: 'المهام المستقلة المراد تنفيذها بالتوازي',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'ask_user',
    description:
      'اسأل المستخدم سؤالاً باختيارات (أو نص حر) عندما تنقص معلومة أساسية لاستكمال المهمة. لا تنفذ المهمة قبل الإجابة.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'السؤال بوضوح' },
        choices: { type: 'array', items: { type: 'string' }, description: 'اختيارات مقترحة (اختياري)' },
        allow_free_text: { type: 'boolean', description: 'السماح بإجابة حرة إضافية (افتراضي true)' },
      },
      required: ['question'],
    },
  },
  {
    name: 'request_confirmation',
    description:
      'اطلب موافقة صريحة من المستخدم قبل تنفيذ إجراء حساس. للحذف الأساسي استخدم mutate_record مع operation=delete وسيعرض التطبيق الموافقة تلقائياً. إن لزم ربط إجراء يدوي فأرسل action {tool: "mutate_record", id: "المعرف", args: {operation: "delete", entity: "..."}}.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'عنوان قصير للطلب' },
        message: { type: 'string', description: 'وصف الإجراء المطلوب الموافقة عليه' },
        details: { type: 'string', description: 'تفاصيل إضافية (اختياري)' },
        action: {
          type: 'object',
          description: 'الإجراء المرتبط بالموافقة (للحذف: tool و id و args كاملة) — اختياري',
          properties: {
            tool: { type: 'string', description: 'tool mutate_record للحذف الأساسي، أو workspace_delete / workspace_delete_table / workspace_delete_row لمساحات العمل' },
            id: { type: 'string', description: 'معرف العنصر المراد حذفه' },
            args: { type: 'object', description: 'باقي وسائط الحذف (entity وحقوله...) — اختياري' },
          },
        },
      },
      required: ['title', 'message'],
    },
  },
  {
    name: 'generate_file',
    description:
      'توليد ملف تقرير فعلي جاهز (excel أو word أو pdf) من البيانات داخل spec — يُولَّد داخل التطبيق ويظهر فوراً في المحادثة كبطاقة قابلة للفتح والمشاركة، ومسموح في وضع القراءة. excel: {title, sheets:[{name, columns, rows, columnWidths}]} — word: {title, subtitle, paragraphs, tables} — pdf: {html} أو {title, columns, rows}. لا تُرِد أكواداً نصية بديلاً عن الملف.',
    parameters: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['excel', 'word', 'pdf'], description: 'صيغة الملف' },
        filename: { type: 'string', description: 'اسم الملف بدون امتداد' },
        spec: { type: 'object', description: 'محتويات الملف حسب الصيغة' },
      },
      required: ['format', 'filename', 'spec'],
    },
  },
  {
    name: 'search_sessions',
    description: 'ابحث في محادثات المساعد السابقة عن كلمة/موضوع وأعد الجلسات المطابقة مع مقتطف.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'undo_last',
    description: 'التراجع عن آخر عملية إنشاء/تعديل/حذف نُفّذ في هذه الجلسة (استعادتها قبل التنفيذ).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'project_memory_save',
    description:
      'احفظ ذاكرة خفيّة حول مشروع/مساحة عمل لتفهم بنيتها في الجلسات اللاحقة: أرسل workspace_id ومضموناً (ملاحظة/بنية/علاقات/قرارات). تبقى مخزنة ولا يراها المستخدم — استخدمها لتوثيق بنية أي مشروع بنيته أو نظّمته.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'معرف مساحة العمل (workspace_id) المرتبط بالمشروع' },
        note: { type: 'string', description: 'مضمون الذاكرة (بنية الجداول، العلاقات، القرارات، المفاتيح)' },
      },
      required: ['workspace_id', 'note'],
    },
  },
  {
    name: 'project_memory_read',
    description:
      'اقرأ ذاكرة مشروع محفوظة سابقاً (بنية الجداول/العلاقات/الثقافية) لمشروع أو مساحة عمل — مفيد عندما يعمل على مشروع أُنشئ أو نظّم في جلسة سابقة لتذكّر بنيته فوراً.',
    parameters: {
      type: 'object',
      properties: { workspace_id: { type: 'string', description: 'معرف مساحة العمل' } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'list_generated_files',
    description:
      'اعرض قائمة الملفات التي وُلّدت سابقاً (excel/word/pdf/نصوص) في كل الجلسات مع حجمها وصيغتها — الخطوة الأولى قبل مراجعة أي ملف. بعدها استخدم review_generated_file لقراءة ملف ومراجعة محتواه فعلياً.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'review_generated_file',
    description:
      'اقرأ فعلياً ملفاً وُلّد سابقاً وتحقق من حالته ومحتواه: Excel (يُعرض عدد الأوراق والأعمدة وأول الصفوف)، CSV/نص (يُعرض المحتوى)، PDF (يُتحقق من صحة التوقيع والحجم)، Word (يُتحقق من صحة البنية والحجم). استخدمها بعد توليد الملف (generate_file) أو عند طلب المستخدم مراجعة تقرير — للتأكد أن الملف سليم ومكتمل قبل تسليمه للمستخدم.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'اسم الملف المولّد المراد مراجعته' } },
      required: ['name'],
    },
  },
]