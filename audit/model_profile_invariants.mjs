import assert from 'node:assert/strict'
import { defaultProvider, filterChatModels, providerCapabilities } from '../src/assistant/providers.ts'
import { resolveModelProfile, profileAllowsParam } from '../src/assistant/modelProfiles.ts'

const openrouter = resolveModelProfile(defaultProvider('openrouter'), 'openai/gpt-5.5')
assert.equal(openrouter.supports.parallelTools, false)
assert.equal(openrouter.maxTokensField, 'unknown')
assert.equal(openrouter.source, 'official_static')

const custom = resolveModelProfile(defaultProvider('custom'), 'my-model')
const mistralSerial = resolveModelProfile(defaultProvider('mistral'), 'mistral-medium-2505', {
  supportedParameters: ['tools', 'parallel_tool_calls'],
})
assert.equal(mistralSerial.supports.parallelTools, false)
assert.equal(custom.supports.tools, true, 'custom providers are OpenAI-compatible by construction (vLLM/Ollama/proxies) so tools are assumed')
assert.equal(custom.supports.streaming, false)
assert.equal(custom.supports.parallelTools, false)
assert.equal(custom.maxTokensField, 'unknown')
const declaredAudio = providerCapabilities(defaultProvider('openai'), 'gpt-4o-audio-preview')
assert.equal(declaredAudio.supportsInputAudio, true)
assert.deepEqual(filterChatModels(['gpt-4o-audio-preview', 'text-embedding-3-small', 'whisper-1', 'gpt-5.4-mini']), ['gpt-4o-audio-preview', 'gpt-5.4-mini'])

const catalog = resolveModelProfile(defaultProvider('openrouter'), 'qwen/qwen3.5', {
  id: 'qwen/qwen3.5',
  supportedParameters: ['tools', 'tool_choice', 'parallel_tool_calls', 'max_completion_tokens', 'structured_outputs'],
  inputModalities: ['text', 'image'],
})
assert.equal(catalog.source, 'catalog')
assert.equal(catalog.confidence, 'high')
assert.equal(catalog.supports.tools, true)
assert.equal(catalog.supports.parallelTools, true)
assert.equal(catalog.supports.vision, true)
assert.equal(catalog.supports.strictTools, true)
assert.equal(catalog.maxTokensField, 'max_completion_tokens')
assert.equal(profileAllowsParam(catalog, 'TOOLS'), true)

const dashscope = resolveModelProfile(defaultProvider('alibaba'), 'qwen3.7-max', {
  supportedParameters: ['tools', 'tool_choice', 'max_completion_tokens'],
})
assert.equal(dashscope.maxTokensField, 'max_completion_tokens')
assert.equal(dashscope.supports.parallelTools, false, 'parallel remains disabled until catalog proves support')

console.log('Model profile invariants: PASS')
