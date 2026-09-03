export const MAX_TOOL_RESULT_CHARS = 8000
export const MAX_HISTORY_MESSAGES = 60
// سقف أمان لدورة الأدوات في مهمة واحدة — مضبوط للجوال: 30 جولة و100 استدعاء و6 دقائق.
// المهام الأكبر تُقسَّم على رسائل متتابعة يستأنف فيها الوكيل من حيث توقف.
export const MAX_TOOL_ROUNDS = 30
export const MAX_TOOL_CALLS = 100
export const MAX_REPEATED_TOOL_CALLS = 6
// بعد هذا العدد من الفشل المتتالي لنفس الأداة يُجبر الوكيل على تغيير استراتيجيته
// والبحث بين الفهرس وتعريفات الأدوات الأخرى بدل تكرار فعلٍ يفشل.
export const MAX_CONSECUTIVE_TOOL_FAILURES = 3
export const MAX_AGENT_RUNTIME_MS = 6 * 60 * 1000

export function truncateForModel(s: string, max = MAX_TOOL_RESULT_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}... [مقتطع]` : s
}