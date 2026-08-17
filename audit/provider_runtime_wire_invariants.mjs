import assert from 'node:assert/strict'
import { chatWithRetry, LlmError } from '../src/assistant/llm.ts'
import { defaultProvider, PROVIDERS } from '../src/assistant/providers.ts'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const captures = []
let responseMode = 'text'
let fetchCount = 0

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

function streamResponse() {
  const encoder = new TextEncoder()
  const chunks = [
    'data: {"choices":[{"delta":{"content":"أهلا"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_stream_01","function":{"name":"current_local_time","arguments":"{\\"timezone\\":\\"Asia/"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Riyadh\\"}"}}]}}]}\n\n',
    'data: [DONE]\n\n',
  ]
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

globalThis.fetch = async (_url, options) => {
  fetchCount++
  const body = JSON.parse(options.body)
  captures.push(body)
  if (responseMode === 'stream') return streamResponse()
  if (responseMode === 'gemini_tool') {
    responseMode = 'text'
    return jsonResponse({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_gemini_runtime', type: 'function', function: { name: 'current_local_time', arguments: '{}' }, extra_content: { google: { thought_signature: 'SIG_RUNTIME' } } }] } }] })
  }
  if (responseMode === 'mistral_tool') {
    responseMode = 'text'
    return jsonResponse({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_mistral_runtime', type: 'function', function: { name: 'current_local_time', arguments: '{}' } }] } }] })
  }
  return jsonResponse({ choices: [{ message: { role: 'assistant', content: 'متصل', tool_calls: [] }, finish_reason: 'stop' }] })
}

const tool = { name: 'current_local_time', description: 'الوقت', parameters: { type: 'object', properties: {}, additionalProperties: false } }
const base = (providerId, model, messages, extra = {}) => ({
  provider: defaultProvider(providerId),
  baseUrl: defaultProvider(providerId).baseUrl || 'https://example.invalid/v1',
  apiKey: 'test-key',
  model,
  messages,
  functions: [tool],
  timeoutMs: 2000,
  ...extra,
})

try {
  for (const def of PROVIDERS) {
    if (def.id === 'anthropic') continue
    const model = def.defaultModels[0] || 'custom-text-model'
    const result = await chatWithRetry(base(def.id, model, [{ role: 'user', content: 'مرحبا' }], { functions: [] }))
    assert.equal(result.content, 'متصل', `${def.id} text runtime`)
    assert.equal(captures.at(-1).messages[0].role, 'user')
  }

  const customDeltas = []
  await chatWithRetry(base('custom', 'custom-text-model', [{ role: 'user', content: 'بدون بث' }], { functions: [], onDelta: (delta) => customDeltas.push(delta) }))
  assert.equal(captures.at(-1).stream, undefined, 'custom must not receive stream field')
  assert.equal(customDeltas.at(-1).done, true)

  responseMode = 'mistral_tool'
  const mistralFirst = await chatWithRetry(base('mistral', 'mistral-medium-2505', [{ role: 'user', content: 'الوقت' }]))
  assert.equal(mistralFirst.toolCalls[0].id, 'call_mistral_runtime')
  const mistralFollowup = await chatWithRetry(base('mistral', 'mistral-medium-2505', [
    { role: 'user', content: 'الوقت' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_mistral_runtime', type: 'function', function: { name: 'current_local_time', arguments: '{}', extra_content: { google: { thought_signature: 'LEAK' } } } }] },
    { role: 'tool', tool_call_id: 'call_mistral_runtime', name: 'current_local_time', content: '{"ok":true}' },
  ]))
  assert.equal(mistralFollowup.content, 'متصل')
  assert.equal(captures.at(-1).messages[1].tool_calls[0].extra_content, undefined)
  assert.equal(captures.at(-1).messages[1].tool_calls[0].function.extra_content, undefined)

  responseMode = 'gemini_tool'
  const geminiFirst = await chatWithRetry(base('gemini', 'gemini-3.6-flash', [{ role: 'user', content: 'الوقت' }]))
  const geminiCall = geminiFirst.toolCalls[0]
  assert.equal(geminiCall.extra.extra_content.google.thought_signature, 'SIG_RUNTIME')
  await chatWithRetry(base('gemini', 'gemini-3.6-flash', [
    { role: 'user', content: 'الوقت' },
    { role: 'assistant', content: null, tool_calls: [{ id: geminiCall.id, type: 'function', function: { name: geminiCall.name, arguments: geminiCall.arguments }, extra_content: geminiCall.extra.extra_content }] },
    { role: 'tool', tool_call_id: geminiCall.id, name: geminiCall.name, content: '{"ok":true}' },
  ]))
  assert.equal(captures.at(-1).messages[1].tool_calls[0].extra_content.google.thought_signature, 'SIG_RUNTIME')

  responseMode = 'stream'
  const deltas = []
  const streamResult = await chatWithRetry(base('openai', 'gpt-5.6-sol', [{ role: 'user', content: 'اختبار البث' }], { onDelta: (delta) => deltas.push(delta) }))
  assert.equal(streamResult.toolCalls[0].id, 'call_stream_01')
  assert.equal(streamResult.toolCalls[0].arguments, '{"timezone":"Asia/Riyadh"}')
  assert.ok(deltas.length >= 2)

  const countBeforeBlocked = fetchCount
  await assert.rejects(() => chatWithRetry(base('openai', 'text-embedding-3-small', [{ role: 'user', content: 'لا ترسل' }])), LlmError)
  assert.equal(fetchCount, countBeforeBlocked, 'invalid model must be blocked before fetch')
  await assert.rejects(() => chatWithRetry(base('custom', 'custom-text-model', [
    { role: 'user', content: 'توازي' },
    { role: 'assistant', content: null, tool_calls: [
      { id: 'c1', type: 'function', function: { name: 'a', arguments: '{}' } },
      { id: 'c2', type: 'function', function: { name: 'b', arguments: '{}' } },
    ] },
  ])), LlmError)
  assert.equal(fetchCount, countBeforeBlocked, 'unsupported parallel tools must be blocked before fetch')

  console.log(`Provider runtime wire invariants: PASS (${fetchCount} intercepted requests)`)
} finally {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
}
