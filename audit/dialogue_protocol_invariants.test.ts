import { describe, expect, it } from 'vitest'
import { needsOpeningDialogue, OPENING_DIALOGUE_DIRECTIVE } from '../src/assistant/dialogueProtocol'

describe('agent dialogue protocol', () => {
  it('requires an opening response for a new execution task', () => {
    expect(needsOpeningDialogue('task-1', false)).toBe(true)
    expect(OPENING_DIALOGUE_DIRECTIVE).toContain('رداً افتتاحياً')
    expect(OPENING_DIALOGUE_DIRECTIVE).toContain('لا تستدعِ أدوات')
  })

  it('does not repeat the opening response when resuming a task', () => {
    expect(needsOpeningDialogue('task-1', true)).toBe(false)
    expect(needsOpeningDialogue(undefined, false)).toBe(false)
  })
})
