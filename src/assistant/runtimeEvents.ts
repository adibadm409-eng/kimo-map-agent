import { emit } from './agentRun'
import { listRuntimeEvents, saveRuntimeEvent, type AgentRuntimeEvent } from './store'
import type { VisibleAgentEvent } from './agentContract'

export function publishRuntimeEvent(sessionId: string, event: VisibleAgentEvent): void {
  emit(event)
  void saveRuntimeEvent(sessionId, event.type, event).catch(() => {})
}

export async function restoreRuntimeEvents(sessionId: string, limit = 120): Promise<VisibleAgentEvent[]> {
  const events = await listRuntimeEvents(sessionId, limit)
  return events.map((event: AgentRuntimeEvent) => event.payload as VisibleAgentEvent)
}
