import assert from 'node:assert/strict'
import { buildChatRequestBody, chatWithRetry } from '../src/assistant/llm.ts'
import { defaultProvider } from '../src/assistant/providers.ts'

const provider = defaultProvider('anthropic')
const tool = { name: 'current_local_time', description: 'الوقت المحلي', parameters: { type: 'object', properties: { timezone: { type: 'string' } }, required: ['timezone'], additionalProperties: false } }
const messages = [
  { role: 'system', content: 'أنت كيمو.' },
  { role: 'user', content: 'ما الوقت؟' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'toolu_01', type: 'function', function: { name: tool.name, arguments: '{"timezone":"Asia/Riyadh"}' } }] },
  { role: 'tool', tool_call_id: 'toolu_01', name: tool.name, content: '{"ok":true}' },
]
const body = buildChatRequestBody({ provider, apiKey: 'test-key', model: 'claude-sonnet-4-5-20250929', messages, functions: [tool], maxTokens: 200 }, false)
assert.equal(body.system, 'أنت كيمو.')
assert.equal(body.messages[0].role, 'user')
assert.equal(body.messages[1].role, 'assistant')
assert.equal(body.messages[1].content[0].type, 'tool_use')
assert.equal(body.messages[1].content[0].id, 'toolu_01')
assert.equal(body.messages[2].role, 'user')
assert.equal(body.messages[2].content[0].type, 'tool_result')
assert.equal(body.messages[2].content[0].tool_use_id, 'toolu_01')
assert.equal(body.tools[0].input_schema.required[0], 'timezone')
assert.equal(body.max_tokens, 200)
assert.equal(body.stream, undefined)

const originalFetch = globalThis.fetch
let calls = 0
let captured = []
try {
  globalThis.fetch = async (url, options) => {
    calls++
    captured.push({ url: String(url), options, body: JSON.parse(options.body) })
    return new Response(JSON.stringify({
      id: 'msg_01',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_runtime', name: tool.name, input: { timezone: 'Asia/Riyadh' } }],
      usage: { input_tokens: 20, output_tokens: 12 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const result = await chatWithRetry({ provider, baseUrl: 'https://api.anthropic.test/v1', apiKey: 'secret', model: 'claude-sonnet-4-5-20250929', messages: [{ role: 'user', content: 'الوقت' }], functions: [tool], maxTokens: 100, timeoutMs: 2000 })
  assert.equal(result.toolCalls[0].id, 'toolu_runtime')
  assert.equal(result.toolCalls[0].name, tool.name)
  assert.equal(result.toolCalls[0].arguments, '{"timezone":"Asia/Riyadh"}')
  assert.equal(captured[0].url, 'https://api.anthropic.test/v1/messages')
  assert.equal(captured[0].options.headers['x-api-key'], 'secret')
  assert.equal(captured[0].options.headers.Authorization, undefined)
  assert.equal(captured[0].body.tools[0].name, tool.name)

  const encoder = new TextEncoder()
  const events = [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start' })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_stream', name: 'current_local_time', input: {} } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"timezone":"Asia/' } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'Riyadh"}' } })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ]
  globalThis.fetch = async (url, options) => {
    calls++
    captured.push({ url: String(url), options, body: JSON.parse(options.body) })
    const stream = new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(encoder.encode(event)); controller.close() } })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const deltas = []
  const streamed = await chatWithRetry({ provider, baseUrl: 'https://api.anthropic.test/v1', apiKey: 'secret', model: 'claude-sonnet-4-5-20250929', messages: [{ role: 'user', content: 'الوقت' }], functions: [tool], maxTokens: 100, timeoutMs: 2000, onDelta: (delta) => deltas.push(delta) })
  assert.equal(streamed.toolCalls[0].id, 'toolu_stream')
  assert.equal(streamed.toolCalls[0].arguments, '{"timezone":"Asia/Riyadh"}')
  assert.equal(captured.at(-1).body.stream, true)
  assert.ok(deltas.some((delta) => delta.done === true))
  console.log(`Anthropic runtime wire invariants: PASS (${calls} intercepted requests)`)
} finally {
  globalThis.fetch = originalFetch
}
