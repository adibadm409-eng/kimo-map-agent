export const MAX_TOOL_RESULT_CHARS = 8000
export const MAX_HISTORY_MESSAGES = 60
// سقف أمان عام لدورة الأدوات في مهمة واحدة — واسع جداً كي لا يقيّد الوكيل في المهام
// الكبيرة المقسمة لخطوات، ولا يوقف سوى حلقة هاربة حقيقية بالكامل.
export const MAX_TOOL_ROUNDS = 80
export const MAX_TOOL_CALLS = 240
export const MAX_REPEATED_TOOL_CALLS = 6
export const MAX_AGENT_RUNTIME_MS = 12 * 60 * 1000

export function truncateForModel(s: string, max = MAX_TOOL_RESULT_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}... [مقتطع]` : s
}