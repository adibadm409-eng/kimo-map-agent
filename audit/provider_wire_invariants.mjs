import assert from 'node:assert/strict'
import {
  assertChatRequest,
  buildChatRequestBody,
  normalizeToolCallId,
  serializeChatMessages,
  toWireToolCall,
  LlmError,
} from '../src/assistant/llm.ts'
import { defaultProvider, providerCapabilities } from '../src/assistant/providers.ts'
import { providerWireFamily, providerWireRequestExtras, normalizeMistralToolCallId } from '../src/assistant/providerWire.ts'

const gemini = defaultProvider('gemini')
const mistral = defaultProvider('mistral')
const openai = defaultProvider('openai')
const dashscope = defaultProvider('alibaba')
const openrouter = defaultProvider('openrouter')
const nvidia = defaultProvider('nvidia')
const custom = defaultProvider('custom')

const preserved = toWireToolCall({
  id: 'call_gemini_01',
  name: 'current_local_time',
  arguments: '{"timezone":"Asia/Riyadh"}',
  extra: {
    extra_content: { google: { thought_signature: 'SIG_A' } },
    raw: {
      id: 'call_gemini_01',
      type: 'function',
      function: { name: 'current_local_time', arguments: '{"timezone":"Asia/Riyadh"}' },
    },
  },
})
assert.equal(preserved.id, 'call_gemini_01')
assert.deepEqual(preserved.extra_content, { google: { thought_signature: 'SIG_A' } })
assert.deepEqual(preserved.function, { name: 'current_local_time', arguments: '{"timezone":"Asia/Riyadh"}' })
assert.equal(preserved.function.thought_signature, undefined)
assert.equal(normalizeToolCallId('call_01JABCD-legacy'), 'call_01JABCD-legacy')
const mistralInvalidId = 'call_2308251'
const normalizedMistralId = normalizeMistralToolCallId(mistralInvalidId)
assert.match(normalizedMistralId, /^[A-Za-z0-9]{9}$/)
assert.equal(normalizeMistralToolCallId(mistralInvalidId), normalizedMistralId)

const wireMessages = serializeChatMessages(gemini, 'gemini-3.5-flash-lite', [
  { role: 'user', content: 'ما الوقت؟' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [preserved],
  },
  { role: 'tool', tool_call_id: 'call_gemini_01', name: 'current_local_time', content: '{"ok":true}' },
])
assert.deepEqual(wireMessages[1].tool_calls[0].extra_content, { google: { thought_signature: 'SIG_A' } })
assert.equal(wireMessages[2].tool_call_id, 'call_gemini_01')

const mistralMessages = serializeChatMessages(mistral, 'mistral-medium-2505', [
  { role: 'assistant', content: null, tool_calls: [preserved] },
])
assert.equal(mistralMessages[0].tool_calls[0].extra_content, undefined)
assert.deepEqual(mistralMessages[0].tool_calls[0].function, { name: 'current_local_time', arguments: '{"timezone":"Asia/Riyadh"}' })
const mistralIdMessages = serializeChatMessages(mistral, 'mistral-medium-2505', [
  { role: 'assistant', content: null, tool_calls: [{ id: mistralInvalidId, type: 'function', function: { name: 'current_local_time', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: mistralInvalidId, name: 'current_local_time', content: '{}' },
])
assert.equal(mistralIdMessages[0].tool_calls[0].id, normalizedMistralId)
assert.equal(mistralIdMessages[1].tool_call_id, normalizedMistralId)
const duplicateMistralMessages = serializeChatMessages(mistral, 'mistral-medium-2505', [
  { role: 'assistant', content: null, tool_calls: [
    { id: 'duplicate-provider-id', type: 'function', function: { name: 'current_local_time', arguments: '{}' } },
    { id: 'duplicate-provider-id', type: 'function', function: { name: 'list_entities', arguments: '{}' } },
  ] },
  { role: 'tool', tool_call_id: 'duplicate-provider-id', name: 'current_local_time', content: '{}' },
  { role: 'tool', tool_call_id: 'duplicate-provider-id', name: 'list_entities', content: '{}' },
])
const duplicateIds = duplicateMistralMessages[0].tool_calls.map((call) => call.id)
assert.equal(new Set(duplicateIds).size, 2)
assert.match(duplicateIds[0], /^[A-Za-z0-9]{9}$/)
assert.match(duplicateIds[1], /^[A-Za-z0-9]{9}$/)
assert.equal(duplicateMistralMessages[1].tool_call_id, duplicateIds[0])
assert.equal(duplicateMistralMessages[2].tool_call_id, duplicateIds[1])
const nestedMistral = serializeChatMessages(mistral, 'mistral-medium-2505', [{ role: 'assistant', content: null, tool_calls: [{ id: 'm-1', type: 'function', function: { name: 'current_local_time', arguments: '{}', extra_content: { google: { thought_signature: 'LEAK' } } } }] }])
assert.equal(nestedMistral[0].tool_calls[0].function.extra_content, undefined)
assert.equal(nestedMistral[0].tool_calls[0].extra_content, undefined)
assert.equal(providerWireFamily(mistral, 'mistral-medium-2505'), 'mistral-chat')
assert.equal(providerWireFamily(dashscope, 'qwen3.7-max'), 'dashscope-chat')
assert.equal(providerWireFamily(openrouter, 'openrouter/free'), 'openrouter-chat')
assert.equal(providerWireFamily(nvidia, 'meta/llama-3.3-70b-instruct'), 'nvidia-chat')
assert.equal(providerWireFamily(custom, 'my-model'), 'custom-openai')
assert.deepEqual(providerWireRequestExtras(dashscope, 'qwen3.7-max'), {})
assert.deepEqual(providerWireRequestExtras(dashscope, 'glm-5.2'), { extra_body: { tool_stream: true } })
assert.deepEqual(providerWireRequestExtras(dashscope, 'glm-5.2', false), {})

const requestBase = {
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  messages: [{ role: 'assistant', content: null, tool_calls: [preserved] }],
  functions: [{ name: 'current_local_time', description: 'time', parameters: { type: 'object' } }],
  maxTokens: 100,
}
const mistralBody = buildChatRequestBody({ ...requestBase, provider: mistral, model: 'mistral-medium-2505' }, false)
assert.equal(mistralBody.messages[0].tool_calls[0].extra_content, undefined)
assert.equal(mistralBody.tools[0].function.name, 'current_local_time')
const geminiBody = buildChatRequestBody({ ...requestBase, provider: gemini, model: 'gemini-3.6-flash' }, true)
assert.equal(geminiBody.stream, true)
assert.equal(geminiBody.messages[0].tool_calls[0].extra_content.google.thought_signature, 'SIG_A')
const glmBody = buildChatRequestBody({ ...requestBase, provider: dashscope, model: 'glm-5.2' }, true)
assert.deepEqual(glmBody.extra_body, { tool_stream: true })

const audioMessage = [{
  role: 'user',
  content: [
    { type: 'text', text: 'استمع' },
    { type: 'input_audio', input_audio: { data: 'AAA', format: 'm4a' } },
  ],
}]
const mistralAudio = serializeChatMessages(mistral, 'voxtral-small-latest', audioMessage)
assert.equal(mistralAudio[0].content[1].input_audio, 'AAA')
const dashscopeAudio = serializeChatMessages(dashscope, 'qwen3.5-omni-plus', audioMessage)
assert.equal(dashscopeAudio[0].content[1].input_audio.data, 'data:audio/mp4;base64,AAA')
const geminiAudio = serializeChatMessages(gemini, 'gemini-2.5-flash', audioMessage)
assert.deepEqual(geminiAudio[0].content[1].input_audio, { data: 'AAA', format: 'm4a' })
assert.throws(() => assertChatRequest({
  provider: openai,
  model: 'text-embedding-3-small',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test',
  messages: [{ role: 'user', content: 'x' }],
  functions: [{ name: 'x', description: 'x', parameters: { type: 'object' } }],
}), /لا يدعم واجهة Chat Completions|لا يثبت دعماً/)

const legacy = serializeChatMessages(gemini, 'gemini-3.5-flash-lite', [
  { role: 'assistant', content: null, tool_calls: [{ id: 'legacy-1', type: 'function', function: { name: 'current_local_time', arguments: '{}' } }] },
])
assert.equal(legacy[0].tool_calls[0].extra_content.google.thought_signature, 'skip_thought_signature_validator')

const caps = providerCapabilities(gemini, 'gemini-3.5-flash-lite')
assert.equal(caps.preservesThoughtSignatures, true)
assert.equal(caps.supportsInputAudio, true)
assert.equal(providerCapabilities(openai, 'gpt-5.5').supportsInputAudio, false)
assert.equal(providerCapabilities(openai, 'gpt-4o-mini-audio-preview').supportsInputAudio, true)

assert.throws(
  () => assertChatRequest({
    provider: openai,
    apiKey: 'test',
    model: 'gpt-5.5',
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'AA==', format: 'm4a' } }] }],
  }),
  (error) => error instanceof LlmError && error.kind === 'invalid_request'
)

assert.throws(
  () => assertChatRequest({
    provider: gemini,
    apiKey: 'test',
    model: 'gemini-3.5-flash-lite',
    messages: [{ role: 'tool', tool_call_id: '', content: 'bad' }],
  }),
  (error) => error instanceof LlmError && error.kind === 'invalid_request'
)

console.log('Provider wire invariants: PASS')
