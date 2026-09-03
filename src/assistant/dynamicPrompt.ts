/**
 * بناء البرومبت الديناميكي حسب النية — كل نية لها برومبت مخصص.
 * يقلل حجم الطلب ويُحسّن السرعة.
 */

import type { BrainOp, AgentSettings } from './store'
import type { IntentKind } from './intentRouter'
import { compactAppCatalog } from '../agent/catalog'

const IDENTITY = `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).`
const RULES_COMMON = `قواعد ملزمة: لا تخترع معرفات (اجلبها بـ query)؛ الأرقام من قاعدة البيانات فقط؛ لا تعرض أدوات/JSON/معرفات؛ لا تدخل مكرراً؛ Markdown عربي بلا backtick.`
const RULES_FINANCE = `المالية عبر ledger_record_payment فقط (لا update لـ paid/remaining ولا create خام لـ plot_payments)؛ العكس عبر ledger_reverse_payment بموافقة.`

// برومبت لكل نية مع قواعد الكتابة والتحقق
const PROMPT_BY_INTENT: Record<IntentKind, string> = {
  greeting: `${IDENTITY} تحدث بحرارة ورحّب بالمحادثة.`,
  question_simple: `${IDENTITY} أجب بوضوح ومباشرة.\n${RULES_COMMON}`,
  question_data: `${IDENTITY}
الأدوات: query/get للقراءة، data_snapshot للإحصائيات، search_everything للبحث.
لا تتوقع أرقاماً — اقرأها من قاعدة البيانات واذكر مصدرها.
${RULES_COMMON}`,
  read: `${IDENTITY}
الأدوات: query/get للقراءة، search_everything للبحث، list_entities للكشف.
اقرأ أولاً ثم أجب بالأرقام المقروءة فقط.
${RULES_COMMON}`,
  create: `${IDENTITY}
الأدوات: query للتحقق من عدم التكرار، preview_update للمعاينة، mutate_record للإنشاء، get للتحقق.
لعقار: property_change_preview ثم property_intake_apply. لمشروع جماعي: project_import_preview ثم project_import_commit مع preview_token ثم project_integrity_check. بعد تعديلات متعددة: review_my_work إلزامي.
${RULES_COMMON}\n${RULES_FINANCE}`,
  update: `${IDENTITY}
الأدوات: query/get للقراءة، preview_update للمعاينة، mutate_record للتعديل، get للتحقق.
اقرأ أولاً ثم عاين ثم عدّل ثم تحقق من [تحقق] قبل الإعلان.
${RULES_COMMON}\n${RULES_FINANCE}`,
  delete: `${IDENTITY}
الأدوات: query/get للقراءة والتأكد، mutate_record مع operation=delete للحذف (يعرض التطبيق الموافقة تلقائياً).
لا تعلن حذفاً قبل الموافقة والتنفيذ والتحقق.
${RULES_COMMON}`,
  report: `${IDENTITY}
الأدوات: query/data_snapshot لجمع الأرقام أولاً، generate_file لتوليد الملفات (excel/word/pdf)، review_generated_file للمراجعة قبل التسليم.
لا تولد ملفاً بأرقام غير مقروءة.
${RULES_COMMON}`,
  complex: `${IDENTITY}
للطلبات المركّبة: orchestrate للقراءات المتوازية فقط؛ الكتابة (حذف/دفع/استيراد) تسلسلية عبر الحلقة لتخضع للموافقة.
قسّم الطلب وراجع نتائج الفرعيين قبل الإعلان.
${RULES_COMMON}\n${RULES_FINANCE}`,
  reminder: `${IDENTITY}
الأدوات: current_local_time للمواعيد النسبية، create_reminder/list_reminders/reminder_update/cancel_reminder.
الموعد ISO مستقبلي؛ حدد المستفيد ونوع الربط.
${RULES_COMMON}`,
  undo: `${IDENTITY} الأدوات: undo_last للتراجع. تأكد من العمليات القابلة للتراجع قبل التنفيذ.\n${RULES_COMMON}`,
  review: `${IDENTITY}
الأدوات: review_my_work للمراجعة، project_integrity_check للتحقق، audit_log_query لمن غيّر ماذا.
راجع وصحّح قبل إعلان النتيجة.
${RULES_COMMON}`,
}

// معلومات الكيانات لكل نية
const ENTITY_INFO: Record<string, string> = {
  projects: 'مشروع عقاري: projects → blocks → plots مع plot_payments',
  blocks: 'بلوك داخل مشروع: blocks تابعة لـ projects',
  plots: 'قطعة داخل بلوك: plots تابعة لـ blocks',
  clients: 'عميل: clients مع name وphone وemail',
  properties: 'عقار: properties مع type وprice وarea',
  offers: 'عرض: offers مع client_id وproperty_id وtype',
  campaigns: 'حملة تسويقية: campaigns',
  viewings: 'موعد معاينة: viewings',
  plot_payments: 'دفعة: plot_payments مع amount وdate وmethod',
  waypoints: 'نقطة خريطة: waypoints مع latitude وlongitude',
  areas: 'منطقة: areas مع name وgeometry',
}

export function buildDynamicPrompt(
  intentKind: IntentKind,
  entity: string | undefined,
  s: AgentSettings,
  providerName: string,
  model: string,
  extraDirectives: string[] = [],
  brainOps: BrainOp[] = [],
): string {
  const base = PROMPT_BY_INTENT[intentKind] ?? PROMPT_BY_INTENT.question_simple
  const entityInfo = entity && ENTITY_INFO[entity] ? `\nالكيان المستهدف: ${ENTITY_INFO[entity]}` : ''
  const directives = extraDirectives.length ? `\nتعليمات:\n${extraDirectives.map((d) => `- ${d}`).join('\n')}` : ''
  const brain = brainOps.length ? `\nذاكرة العمل:\n${brainOps.map((b) => `[${b.kind}] ${b.body}`).join('\n')}` : ''

  const needsCatalog = ['create', 'update', 'read', 'complex', 'question_data', 'report', 'review'].includes(intentKind)
  const catalog = needsCatalog ? `\n\n${compactAppCatalog()}` : ''

  return `${base}${entityInfo}${directives}${brain}${catalog}

المزود: ${providerName} — الموديل: ${model}`
}
