import type { PendingDeleteItem } from './store'

// ---------- بث الأحداث ----------

import type { VisibleAgentEvent } from './agentContract'

export type AgentOutcome = 'completed' | 'failed' | 'paused' | 'cancelled'

export function deriveAgentOutcome(taskStatus?: string | null, latestAssistantKind?: string): AgentOutcome {
  if (taskStatus === 'completed') return 'completed'
  if (taskStatus === 'awaiting_user') return 'paused'
  if (taskStatus === 'cancelled') return 'cancelled'
  if (taskStatus) return 'failed'
  return latestAssistantKind === 'error' ? 'failed' : 'completed'
}

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string; args: any; result: any }
  | { type: 'ask_user'; question: string; choices?: string[]; allowFreeText?: boolean }
  | { type: 'confirmation'; title: string; message: string; details?: string; items?: PendingDeleteItem[] }
  | { type: 'file'; uri: string; name: string; format: string }
  | { type: 'link'; kind: string; id: string; label?: string }
  | { type: 'progress'; text: string }
  | { type: 'stream'; content: string; done?: boolean }
  | { type: 'error'; message: string }
  | { type: 'thinking' }
  | { type: 'done'; outcome?: AgentOutcome }
  | VisibleAgentEvent

export type SessionAgentEvent = AgentEvent & { sessionId: string }
export type Listener = (e: SessionAgentEvent) => void

type Subscription = { fn: Listener; sessionId?: string }
const listeners = new Set<Subscription>()

/**
 * بث حدث مرتبط بجلسة واحدة فقط. لا نستخدم ناقلاً عالمياً بلا سياق؛ لأن مهمة
 * قديمة أو جلسة أخرى يمكن أن تبقى قيد التشغيل محلياً بعد إغلاق المتصفح.
 */
export function emitForSession(sessionId: string, event: AgentEvent): void {
  const scopedEvent = { ...event, sessionId } as SessionAgentEvent
  listeners.forEach(({ fn, sessionId: targetSessionId }) => {
    if (targetSessionId && targetSessionId !== sessionId) return
    try {
      fn(scopedEvent)
    } catch {}
  })
}

export function subscribeAgent(fn: Listener, sessionId?: string): () => void {
  const subscription: Subscription = { fn, sessionId }
  listeners.add(subscription)
  return () => {
    listeners.delete(subscription)
  }
}

// ---------- حالة التشغيل (المشغّل/التراج/الإجهاض) ----------

const cancelled = new Set<string>()
const running = new Set<string>()
const aborters = new Map<string, AbortController>()

export function isAgentBusy(sessionId: string): boolean {
  return running.has(sessionId)
}

export function cancelAgent(sessionId: string): void {
  cancelled.add(sessionId)
  aborters.get(sessionId)?.abort()
}

export function markRunning(sessionId: string): void {
  running.add(sessionId)
  cancelled.delete(sessionId)
}

export function clearRunning(sessionId: string): void {
  running.delete(sessionId)
}

export function isCancelled(sessionId: string): boolean {
  return cancelled.has(sessionId)
}

export function setAborter(sessionId: string, c: AbortController): void {
  aborters.set(sessionId, c)
}

export function clearAborter(sessionId: string, c: AbortController): void {
  if (aborters.get(sessionId) === c) aborters.delete(sessionId)
}