import { useEffect } from 'react'
import { subscribeAgent } from '../../assistant'
import { useChatStore } from './agentChatStore'

export function useAgentEvents(sessionId: string, reload: (sid: string) => void | Promise<void>) {
  useEffect(() => {
    const unsub = subscribeAgent((e) => {
      if (e.sessionId !== sessionId) return
      useChatStore.getState().applyEvent(e)
      if (e.type === 'done' || e.type === 'error') {
        Promise.resolve(reload(sessionId)).catch(() => {})
      }
    })
    return unsub
  }, [sessionId, reload])
}
