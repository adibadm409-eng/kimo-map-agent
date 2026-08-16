import { getMessages, type Message } from './store'
import type { ChatMessage } from './llm'
import { sanitizeWireFunction, normalizeToolCallId } from './llm'
import { summarizeToolResult } from './toolLabels'
import { MAX_HISTORY_MESSAGES } from './constants'

export async function readModelHistory(sessionId: string): Promise<Message[]> {
  const msgs = await getMessages(sessionId)
  // مسار ReAct كامل للموديل: رسائل المستخدم، ردود المساعد (بما فيها نداءات الأدوات
  // المحمولة في meta.tool_calls)، وملاحظات النتائج [نجاح]/[فشل] — بحيث تصل
  // المزود أزواجاً سليمة (نداء ← ملاحظة) عبر كل الحدود، ويدري الوكيل حقيقة أدائه.
  return msgs.filter((m) => m.role === 'user' || m.role === 'tool' || m.role === 'assistant')
}

function compressToolResult(meta: Record<string, any>): string {
  const name = String(meta.name ?? 'execute')
  const result = meta.result
  if (typeof result === 'string') return result.length > 600 ? `${result.slice(0, 600)}…` : result
  return summarizeToolResult(name, result)
}

export function messagesToLlm(msgs: Message[]): ChatMessage[] {
  const out: ChatMessage[] = []
  const recent = msgs.slice(-MAX_HISTORY_MESSAGES)
  // حارس سلامة الأزواج: لا نبدأ النافذة بملاحظة tool يتيمة انفصلت عن نداء أداة
  let start = 0
  while (start < recent.length && recent[start].role === 'tool') start++
  for (let i = start; i < recent.length; i++) {
    const m = recent[i]
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const toolCalls = m.meta?.tool_calls
      if (Array.isArray(toolCalls) && toolCalls.length) {
        // تعقيم النداءات المعاد بناؤها من المخزن — قد تحمل بيانات قديمة تسربت فيها
        // حقول بنيوية (index...) ترفضها البوابة الموحّدة بـ 422 extra_forbidden
        const cleanCalls = toolCalls.map((tc) => {
          const t = { ...tc }
          const f = t.function && typeof t.function === 'object' ? { ...t.function } : {}
          const raw = t.raw && typeof t.raw === 'object' ? t.raw : {}
          const rawFn = raw.function && typeof raw.function === 'object' ? raw.function : {}
          // إعادة بناء الحقول المطلوبة حتماً — قد تكون مفقودة في بيانات قديمة تالفة
          if (!f.name) f.name = rawFn.name ?? raw.name ?? 'execute'
          if (f.arguments == null) f.arguments = rawFn.arguments ?? '{}'
          if (typeof f.arguments !== 'string') f.arguments = JSON.stringify(f.arguments)
          if (typeof f.name !== 'string' || !f.name.trim()) f.name = 'execute'
          t.function = sanitizeWireFunction(f)
          t.id = normalizeToolCallId(t.id ?? tc.id ?? raw.id)
          return t
        })
        // لا نُرسل نداء أداة منفصلة عن ملاحظتها خارج النهاية — وإلا رفض المزود
        const hasResultAfter = recent.slice(i + 1).some((t) => t.role === 'tool' && t.meta?.tool_call_id)
        if (hasResultAfter) out.push({ role: 'assistant', content: null, tool_calls: cleanCalls })
      } else if (m.content && m.content.trim()) {
        out.push({ role: 'assistant', content: m.content })
      }
    } else if (m.role === 'tool' && m.meta?.tool_call_id) {
      // ملاحظة النتيجة: نص الحالة الصريحة [نجاح]/[فشل] + [تحقق] — وعي الوكيل بنجاح أدائه
      const obs = m.meta.observation != null ? String(m.meta.observation) : String(m.meta.result ?? '')
      if (obs.trim()) {
        out.push({ role: 'tool', tool_call_id: normalizeToolCallId(m.meta.tool_call_id), name: String(m.meta.name ?? 'execute'), content: obs })
      }
    }
  }
  // تثبيت المهمة الأصلية للمستخدم في نافذة السياق حتى لا يضيع الهدف مع طول التنفيذ
  const firstUser = msgs.find((m) => m.role === 'user')
  if (firstUser && !out.some((c) => c.role === 'user' && c.content === firstUser.content)) {
    out.unshift({ role: 'user', content: `[المهمة الأصلية للمستخدم] ${firstUser.content.slice(0, 1500)}` })
  }
  return out
}