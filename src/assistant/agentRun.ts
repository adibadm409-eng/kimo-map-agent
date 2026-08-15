import type { PendingDeleteItem } from './store'

// ---------- بث الأحداث ----------

import type { VisibleAgentEvent } from './agentContract'

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
  | { type: 'done' }
  | VisibleAgentEvent

export type Listener = (e: AgentEvent) => void

const listeners = new Set<Listener>()

export function emit(e: AgentEvent): void {
  listeners.forEach((fn) => {
    try {
      fn(e)
    } catch {}
  })
}

export function subscribeAgent(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
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