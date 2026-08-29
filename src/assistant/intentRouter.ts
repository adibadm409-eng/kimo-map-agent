/**
 * تصنيف النية والتوجيه الذكي — الطبققة الأولى قبل LLM.
 * يclassify الرسالة ويرسلها للمسار المناسب:
 * - رد فوري (محلي بدون LLM)
 * - LLM مع أدوات محددة
 * - LLM كامل مع كل الأدوات
 */

export type IntentKind =
  | 'greeting'        // تحية/سؤال عام
  | 'question_simple' // سؤال بسيط (الوقت، من هو، ما اسمك)
  | 'question_data'   // سؤال عن بيانات (كم، عدد، إجمالي)
  | 'read'            // قراءة/عرض (اقرأ، أظهر، ابحث)
  | 'create'          // إنشاء (أنشئ، أضف، سجّل)
  | 'update'          // تعديل (عدّل، حدّث، غيّر)
  | 'delete'          // حذف (احذف، أزل)
  | 'report'          // تقرير/ملف (تقرير، ملف، جدول)
  | 'complex'         // طلب معقد (مشاريع + عملاء + دفعات)
  | 'reminder'        // تذكير (ذكرني، تذكير)
  | 'undo'            // تراجع (تراجع، ألغِ)
  | 'review'          // مراجعة (راجع، تحقق، صحّح)

export interface ClassifiedIntent {
  kind: IntentKind
  confidence: number   // 0-1
  entity?: string      // الكيان المستهدف
  action?: string      // العملية
  needsTools: boolean  // هل تحتاج أدوات؟
  needsLLM: boolean    // هل تحتاج LLM؟
  promptTier: 'minimal' | 'focused' | 'full'  // مستوى البرومبت
}

// أنماط التصنيف مرتبة بالأولوية (الأعلى أولاً)
const INTENT_PATTERNS: { pattern: RegExp; intent: IntentKind; needsTools: boolean; needsLLM: boolean; promptTier: IntentKind extends infer T ? 'minimal' | 'focused' | 'full' : never }[] = [
  // رد فوري بدون LLM
  { pattern: /^(مرحبا|السلام عليكم|اهلا|صباح الخير|مساء الخير|اهلا وسهلا|أهلاً|السلام)/i, intent: 'greeting', needsTools: false, needsLLM: false, promptTier: 'minimal' },
  { pattern: /^(شكرا|شكراً|مشكور|الشكر لله)/i, intent: 'greeting', needsTools: false, needsLLM: false, promptTier: 'minimal' },

  // سؤال بسيط بدون أدوات
  { pattern: /^(من انت|ما اسمك|ما هويتك|ماذا تفعل|كيف حالك|كيفك|عامل ايه)/i, intent: 'question_simple', needsTools: false, needsLLM: true, promptTier: 'minimal' },

  // تراجع
  { pattern: /(?:تراجع|الغِ|الغاء|إلغاء|undo)/i, intent: 'undo', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // مراجعة/تحقق
  { pattern: /(?:راجع|مراجعة|تحقق|تدقيق|سلامة|فروقات|صحّح|audit)/i, intent: 'review', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // تذكير
  { pattern: /(?:ذكّرني|تذكير|تذكير|reminder|موعد)/i, intent: 'reminder', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // تقرير/ملف
  { pattern: /(?:تقرير|ملف|جدول|excel|word|pdf|download|تحميل)/i, intent: 'report', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // حذف
  { pattern: /(?:احذف|حذف|إزالة|أزل|امسح|delete)/i, intent: 'delete', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // إنشاء
  { pattern: /(?:أنشئ|انشئ|أضف|اضف|سجّل|سجل|إضافة|أدخل|أدخل|create|add)/i, intent: 'create', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // تعديل
  { pattern: /(?:عدّل|عدل|حدّth|حدث|غيّر|غيّر|تعديل|update|edit|modify)/i, intent: 'update', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // قراءة/بحث
  { pattern: /(?:اقرأ|اطلع|اعرض|أظهر|اظهر|ابحث|استكشف|بحث|عرض|read|search|explore|show|list)/i, intent: 'read', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // سؤال عن بيانات
  { pattern: /(?:كم|عدد|إجمالي|مجموع|الإجمالي|المجموع|有多少|多少|how many|total|count)/i, intent: 'question_data', needsTools: true, needsLLM: true, promptTier: 'focused' },

  // طلب معقد (عدة أقسام)
  { pattern: /(?:项目|مشروع.*و.*(?:عملاء|دفعات|عروض|عقارات)|عملاء.*و.*دفعات)/i, intent: 'complex', needsTools: true, needsLLM: true, promptTier: 'full' },
]

// أنماط الكيانات
const ENTITY_PATTERNS: { pattern: RegExp; entity: string }[] = [
  { pattern: /(?:مشروع|مشاريع|project)/i, entity: 'projects' },
  { pattern: /(?:بلوك|بلوكات|block)/i, entity: 'blocks' },
  { pattern: /(?:قطعة|قطع|بلوت|plot)/i, entity: 'plots' },
  { pattern: /(?:عميل|عملاء|client)/i, entity: 'clients' },
  { pattern: /(?:عقار|عقارات|property)/i, entity: 'properties' },
  { pattern: /(?:عرض|عروض|offer)/i, entity: 'offers' },
  { pattern: /(?:حملة|حملات|campaign)/i, entity: 'campaigns' },
  { pattern: /(?:معاينة|مشاهدات|viewing)/i, entity: 'viewings' },
  { pattern: /(?:دفعة|دفعات|أقساط|قسط|payment)/i, entity: 'plot_payments' },
  { pattern: /(?:نقطة|نقاط|waypoint)/i, entity: 'waypoints' },
  { pattern: /(?:منطقة|مناطق|area)/i, entity: 'areas' },
]

// ردود محلية فورية (بدون LLM)
const LOCAL_RESPONSES: { pattern: RegExp; response: string | (() => string) }[] = [
  { pattern: /^(مرحبا|السلام عليكم|اهلا|صباح الخير|مساء الخير|اهلا وسهلا|أهلاً)/i, response: () => {
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء الخير'
    return `${greeting}! أنا كيمو، مساعدك الذكي لإدارة العقارات. كيف يمكنني مساعدتك اليوم؟`
  }},
  { pattern: /^(شكرا|شكراً|مشكور|الشكر لله)/i, response: 'على الرحب والسعة! هل تحتاج مساعدة في شيء آخر؟' },
  { pattern: /^من انت$/i, response: 'أنا كيمو — مساعدك الذكي المتخصص في إدارة العقارات. أستطيع مساعدتك في إنشاء المشاريع وإدارة العملاء وتسجيل الدفعات والمزيد.' },
  { pattern: /^ما اسمك$/i, response: 'اسمي كيمو (Kimo) — مساعدك الذكي في تطبيق إدارة العقارات.' },
  { pattern: /^كيف حالك$/i, response: 'أنا بخير، شكراً لسؤالك! جاهز لمساعدتك في إدارة عقاراتك.' },
]

export function classifyIntent(text: string): ClassifiedIntent {
  const trimmed = text.trim()

  // 1. فحص الردود المحلية الفورية
  for (const { pattern } of LOCAL_RESPONSES) {
    if (pattern.test(trimmed)) {
      return {
        kind: 'greeting',
        confidence: 1.0,
        needsTools: false,
        needsLLM: false,
        promptTier: 'minimal',
      }
    }
  }

  // 2. تصنيف النية
  let bestMatch: ClassifiedIntent = {
    kind: 'question_simple',
    confidence: 0.3,
    needsTools: false,
    needsLLM: true,
    promptTier: 'minimal',
  }

  for (const { pattern, intent, needsTools, needsLLM, promptTier } of INTENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      bestMatch = { kind: intent, confidence: 0.9, needsTools, needsLLM, promptTier }
      break
    }
  }

  // 3. تحديد الكيان
  for (const { pattern, entity } of ENTITY_PATTERNS) {
    if (pattern.test(trimmed)) {
      bestMatch.entity = entity
      bestMatch.confidence = Math.min(bestMatch.confidence + 0.1, 1.0)
      break
    }
  }

  return bestMatch
}

export function getLocalResponse(text: string): string | null {
  for (const { pattern, response } of LOCAL_RESPONSES) {
    if (pattern.test(text.trim())) {
      return typeof response === 'function' ? response() : response
    }
  }
  return null
}
