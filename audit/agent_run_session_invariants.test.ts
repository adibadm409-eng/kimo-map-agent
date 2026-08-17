import { afterEach, describe, expect, it, vi } from 'vitest'

import { emitForSession, subscribeAgent } from '../src/assistant/agentRun'

const unsubscribers: (() => void)[] = []

afterEach(() => {
  while (unsubscribers.length) unsubscribers.pop()?.()
  vi.restoreAllMocks()
})

describe('session-scoped Kimo event bus', () => {
  it('attaches the originating session id to every event', () => {
    const received: any[] = []
    unsubscribers.push(subscribeAgent((event) => received.push(event)))

    emitForSession('session-a', { type: 'text', content: 'من جلسة A' })

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ sessionId: 'session-a', type: 'text', content: 'من جلسة A' })
  })

  it('does not deliver another session event to a session-scoped subscriber', () => {
    const received: any[] = []
    unsubscribers.push(subscribeAgent((event) => received.push(event), 'session-b'))

    emitForSession('session-a', { type: 'text', content: 'نص قديم غير مسموح' })
    emitForSession('session-a', { type: 'error', message: 'خطأ من مهمة يتيمة' })
    emitForSession('session-b', { type: 'text', content: 'نص الجلسة الحالية' })

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ sessionId: 'session-b', type: 'text', content: 'نص الجلسة الحالية' })
  })
})
