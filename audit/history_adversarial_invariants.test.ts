import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/assistant/store', () => ({
  getMessages: vi.fn(async () => []),
}))
vi.mock('../src/agent', () => ({
  ENTITY_LABELS: {},
}))

import { collapseParallelToolRounds, messagesToLlm } from '../src/assistant/history'
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

  it('serializes legacy parallel rounds for non-parallel providers', () => {
    const calls = [
      { id: 'call-a', type: 'function', function: { name: 'current_local_time', arguments: '{}' } },
      { id: 'call-b', type: 'function', function: { name: 'current_local_time', arguments: '{}' } },
    ]
    const serial = collapseParallelToolRounds([
      { role: 'user', content: 'اقرأ الوقت مرتين للتحقق' },
      { role: 'assistant', content: 'سأتحقق', tool_calls: calls },
      { role: 'tool', tool_call_id: 'call-a', name: 'current_local_time', content: '[نجاح] أ' },
      { role: 'tool', tool_call_id: 'call-b', name: 'current_local_time', content: '[نجاح] ب' },
    ] as any)
    const assistantTurns = serial.filter((message) => message.role === 'assistant' && message.tool_calls)
    expect(assistantTurns).toHaveLength(2)
    expect(assistantTurns.every((message) => message.tool_calls?.length === 1)).toBe(true)
    expect(serial.filter((message) => message.role === 'tool').map((message) => message.tool_call_id)).toEqual(['call-a', 'call-b'])
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
