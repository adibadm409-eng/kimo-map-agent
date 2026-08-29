/**
 * بناء البرومبت الديناميكي حسب النية — كل نية لها برومبت مخصص.
 * يقلل حجم الطلب ويُحسّن السرعة.
 */

import type { BrainOp, AgentSettings } from './store'
import type { IntentKind } from './intentRouter'
import { compactAppCatalog } from '../agent/catalog'

// برومبت مختصر لكل فئة
const PROMPT_BY_INTENT: Record<IntentKind, string> = {
  greeting: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني). تحدث بحرارة ورحّب بالمحادثة.`,
  question_simple: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني). أجب بوضوح ومباشرة.`,
  question_data: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: query/get للقراءة، data_snapshot للإحصائيات.
لا تتوقع أرقاماً — اقرأها من قاعدة البيانات.`,
  read: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: query/get للقراءة، search_everything للبحث، list_entities للكشف.
اقرأ أولاً ثم أجب.`,
  create: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: mutate_record لإنشاء الكيانات.
أنشئ ثم تحقق بـ query/get.`,
  update: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: query/get للقراءة، mutate_record للتعديل.
اقرأ أولاً ثم عدّل ثم تحقق.`,
  delete: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: query/get للقراءة، mutate_record للحذف.
تأكد من وجود السجل قبل الحذف. الحذف يحتاج موافقة المستخدم.`,
  report: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: generate_file لتوليد الملفات (excel/word/pdf).
ولّد الملف فوراً بدون سؤال.`,
  complex: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
للطلبات المركّبة: استخدم orchestrate لـ وكلاء فرعيين بالتوازي.
قسّم الطلب وأرسل كل جزء لوكيل منفصل.`,
  reminder: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: create_reminder لإنشاء التذكيرات، list_reminders للعرض.
حدد الموعد والمستفيد.`,
  undo: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: undo_last للتراجع.
تأكد من العمليات القابلة للتراجع قبل التنفيذ.`,
  review: `أنت "كيمو" — مساعد ذكي في تطبيق إدارة عقارات (اليمن، ريال يمني).
الأدوات: review_my_work للمراجعة، project_integrity_check للتحقق.
راجع وصحّح قبل إعلان النتيجة.`,
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

  // إضافة الكتالوج فقط إذا كانت النية تحتاج فهم البنية
  const needsCatalog = ['create', 'update', 'read', 'complex'].includes(intentKind)
  const catalog = needsCatalog ? `\n\n${compactAppCatalog()}` : ''

  return `${base}${entityInfo}${directives}${brain}${catalog}

المزود: ${providerName} — الموديل: ${model}`
}
