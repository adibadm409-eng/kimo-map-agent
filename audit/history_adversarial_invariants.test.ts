import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/assistant/store', () => ({
  getMessages: vi.fn(async () => []),
}))
vi.mock('../src/agent', () => ({
  ENTITY_LABELS: {},
}))

import { messagesToLlm } from '../src/assistant/history'
import { validateToolCallBatch } from '../src/assistant/toolValidation'

describe('adversarial tool history contract', () => {
  const definitions = [{
    name: 'current_local_time',
    description: 'قراءة الوقت المحلي',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  }]

  it('rejects duplicate call ids before execution', () => {
    const issues = validateToolCallBatch([
      { id: 'same-id', name: 'current_local_time', arguments: '{}' },
      { id: 'same-id', name: 'current_local_time', arguments: '{}' },
    ], definitions, true)
    expect(issues.some((issue) => issue.code === 'duplicate_tool_id')).toBe(true)
  })

  it('drops incomplete rounds and orphan results during history replay', () => {
    const call = { id: 'call-1', type: 'function', function: { name: 'current_local_time', arguments: '{}' } }
    const incomplete = messagesToLlm([
      { role: 'user', content: 'أكمل المهمة' },
      { role: 'assistant', content: null, meta: { tool_calls: [call] } },
      { role: 'tool', content: '[فشل] نتيجة لنداء آخر', meta: { tool_call_id: 'orphan-id', name: 'current_local_time', observation: '[فشل] نتيجة لنداء آخر', ok: false } },
    ] as any)
    expect(incomplete.some((message) => message.role === 'assistant' && message.tool_calls)).toBe(false)
    expect(incomplete.some((message) => message.role === 'tool')).toBe(false)
    expect(incomplete.some((message) => message.role === 'user')).toBe(true)

    const complete = messagesToLlm([
      { role: 'user', content: 'أكمل المهمة' },
      { role: 'assistant', content: null, meta: { tool_calls: [call] } },
      { role: 'tool', content: '[نجاح] الوقت', meta: { tool_call_id: 'call-1', name: 'current_local_time', observation: '[نجاح] الوقت', ok: true } },
      { role: 'tool', content: '[فشل] نتيجة يتيمة', meta: { tool_call_id: 'orphan-id', name: 'current_local_time', observation: '[فشل] نتيجة يتيمة', ok: false } },
    ] as any)
    expect(complete.some((message) => message.role === 'assistant' && message.tool_calls?.[0]?.id === 'call-1')).toBe(true)
    expect(complete.some((message) => message.role === 'tool' && message.tool_call_id === 'call-1')).toBe(true)
    expect(complete.some((message) => message.role === 'tool' && message.tool_call_id === 'orphan-id')).toBe(false)
  })
})
