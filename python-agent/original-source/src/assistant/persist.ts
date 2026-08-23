import { addMessage, type Message } from './store'
import { toWireToolCall, type ToolCall } from './llm'
import { truncateForModel } from './constants'
import { sanitizeAssistantText } from './sanitize'

export function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xls') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'docx' || ext === 'doc') return 'application/msword'
  if (ext === 'txt') return 'text/plain'
  return 'application/octet-stream'
}

export async function persistAssistantToolCall(sessionId: string, call: ToolCall): Promise<void> {
  await persistAssistantToolCalls(sessionId, [call])
}

/**
 * يحفظ رسالة assistant واحدة تحتوي كل نداءات الجولة. لا يجوز تحويل نداءين
 * متوازيين إلى رسالتين assistant منفصلتين؛ المزودات تتوقع assistant.tool_calls
 * واحداً ثم رسائل tool المرتبطة بالمعرفات نفسها.
 */
export async function persistAssistantToolCalls(sessionId: string, calls: ToolCall[]): Promise<void> {
  await addMessage({
    sessionId,
    role: 'assistant',
    kind: 'tool_call',
    content: '',
    meta: { tool_calls: calls.map((call) => toWireToolCall(call)) },
  })
}

export async function persistToolResult(sessionId: string, call: ToolCall, result: any, metaExtra?: Record<string, any>): Promise<string> {
  const observation = metaExtra?.observation != null ? truncateForModel(String(metaExtra.observation)) : undefined
  const content = typeof result === 'string' ? result : JSON.stringify(result)
  const capped = truncateForModel(content)
  const statusText = observation ?? capped
  const inferredOk = metaExtra?.ok ?? !/^\s*(?:\[فشل|\[فشل\/غير|فشل|محظور|خطأ)/i.test(statusText)
  await addMessage({
    sessionId,
    role: 'tool',
    kind: 'tool',
    content: '',
    meta: {
      name: metaExtra?.name ?? call.name,
      tool_call_id: call.id,
      args: metaExtra?.args,
      result: capped,
      observation,
      ok: inferredOk,
      verified: metaExtra?.verified === true,
      verification: metaExtra?.verification,
    },
  })
  return observation ?? capped
}

/** تسجيل نداء أداة + نتيجتها معاً في سجل الجلسة، وإعادة نص الملاحظة للنقل إلى مسار تفكير ReAct. */
export async function persistPair(sessionId: string, call: ToolCall, result: any, onObservation?: (obs: string) => void, metaExtra?: Record<string, any>): Promise<string> {
  // executor يحفظ مجموعة assistant.tool_calls مرة واحدة قبل تنفيذ النتائج.
  // المسارات الاصطناعية القديمة لا تحمل العلامة، فتستمر في حفظ زوجها المعتاد.
  if (!call.extra?.__assistantPersisted) await persistAssistantToolCall(sessionId, call)
  const obs = await persistToolResult(sessionId, call, result, metaExtra)
  if (onObservation) onObservation(obs)
  return obs
}

export async function persistUser(sessionId: string, content: string, meta?: Record<string, any>): Promise<void> {
  await addMessage({ sessionId, role: 'user', kind: 'text', content, meta: meta && Object.keys(meta).length ? meta : undefined })
}

export async function persistAssistantText(sessionId: string, content: string, kind: Message['kind'] = 'text', meta?: Record<string, any>): Promise<void> {
  await addMessage({ sessionId, role: 'assistant', kind, content: sanitizeAssistantText(content), meta })
}