import type { Message } from './store'

/**
 * تحليل نية المستخدم من نص طلبه — تصنيف عربي مختصر يُحقن في سياق الوكيل
 * ليساعده على اختيار المسار الصحيح والتحسن المستمر في فهم الطلبات.
 */
export function analyzeIntent(text: string): string {
  const t = String(text ?? '').trim()
  if (!t) return ''
  if (/احذف|امسح|حذف|إلغاء|ألغ|شيل|احدف/.test(t) && !/إلغاء آخر|تراجع/.test(t)) return 'حذف'
  if (/تراجع|إلغاء آخر عملية|اعكس آخر/.test(t)) return 'تراجع'
  if (/أنشئ|أنشأ|أضف|سجّل|سجل|ادخل|أدخل|اعمل مشروع|اعمل جديد|انشئ/.test(t)) return 'إنشاء/إضافة'
  if (/عدّل|عدل|حدّث|حددث|غيّر|غير|صحّح|صحح|استبدل/.test(t)) return 'تعديل'
  if (/استيراد|اقرأ الملف|اقرأ ملف|رفع ملف|استورد|حول الملف/.test(t)) return 'استيراد ملفات'
  if (/ملف|تقرير|جدول إكسل|إكسل|Excel|Word|PDF|ورقة|ورود/.test(t) && /ولّد|ولد|جهز|اعمل|أنشئ|اكتب|أكتب/.test(t)) return 'توليد ملف'
  if (/ملخص|خلاصة|تحليل|إحصاء|احسب|حسب|راجع|قارن|قارن بين|مؤشرات/.test(t)) return 'تحليل/ملخص'
  if (/ابحث|بحث|دور|وين|أين|استعلام|جيب|اعرض|أعرض|عرض كل|قائمة/.test(t)) return 'بحث/استعلام'
  if (/مرحبا|هلا|اهلا|كيف حالك|شكرا|شكرا لك|تصفح|ممكن تساعد/.test(t)) return 'محادثة عامة'
  return 'استعلام/مساعدة'
}

/** ملخص سياق المحادثة الحديثة: آخر ما كان عليه المستخدم (بدون رموز تقنية). */
export function buildContextSummary(msgs: Message[], maxUsers = 3): string {
  const users = msgs.filter((m) => m.role === 'user' && m.content && m.content.trim()).slice(-maxUsers)
  if (!users.length) return ''
  const parts = users.map((m) => {
    const c = m.content.trim()
    return c.length > 80 ? `${c.slice(0, 80)}…` : c
  })
  return `سياق المحادثة الحديثة: ${parts.join(' ← ')}`
}
