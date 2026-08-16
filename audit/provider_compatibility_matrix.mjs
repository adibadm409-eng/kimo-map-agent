import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildChatRequestBody } from '../src/assistant/llm.ts'
import { defaultProvider, providerCapabilities, PROVIDERS } from '../src/assistant/providers.ts'
import { providerWireFamily } from '../src/assistant/providerWire.ts'

const modelsByProvider = {
  gemini: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-2.5-flash-image', 'text-embedding-004'],
  openai: ['gpt-5.6-sol', 'gpt-5.4-mini', 'gpt-audio-1.5', 'gpt-4o-audio-preview', 'text-embedding-3-small'],
  mistral: ['mistral-large-2-latest', 'mistral-medium-2505', 'codestral-2-latest', 'voxtral-small-latest', 'voxtral-mini-latest'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  alibaba: ['qwen3.7-max', 'qwen3.7-plus', 'qwen3.5-omni-plus', 'qwen3-asr-flash', 'glm-5.2'],
  openrouter: ['openrouter/free', 'google/gemini-3.6-flash', 'openai/gpt-audio-1.5', 'mistralai/voxtral-small-latest:free', 'meta-llama/llama-3.3-70b-instruct:free'],
  nvidia: ['meta/llama-3.3-70b-instruct', 'mistralai/mistral-small-3.1-24b-instruct-2503', 'microsoft/phi-4-mini-instruct', 'nvidia/embedding-1'],
  custom: ['custom-text-model', 'custom-audio-model', 'custom-embedding-model'],
}

const tool = { name: 'current_local_time', description: 'يعيد الوقت المحلي', parameters: { type: 'object', properties: { timezone: { type: 'string' } }, required: ['timezone'] } }
const toolCall = (id, name = tool.name) => ({ id, type: 'function', function: { name, arguments: '{"timezone":"Asia/Riyadh"}' } })
const signatureCall = { id: 'call_sig_01', type: 'function', function: { name: tool.name, arguments: '{}', extra_content: { google: { thought_signature: 'SIG_TEST' } } }, extra_content: { google: { thought_signature: 'SIG_TEST' } } }

function baseMessages() {
  return [
    { role: 'system', content: 'أنت كيمو.' },
    { role: 'user', content: 'افهم الطلب ونفذه عند الحاجة.' },
  ]
}

function messagesFor(input) {
  const messages = baseMessages()
  if (input === 'text') return messages
  if (input === 'attachment_reference') {
    messages[1].content = 'أرفق المستخدم صورة للعقار. المرفق محلياً بالمعرف att-01؛ استخدم list_attachments قبل القراءة.'
    return messages
  }
  if (input === 'audio' || input === 'mixed') {
    messages[1].content = [
      { type: 'text', text: 'استمع للتسجيل ونفذ المطلوب.' },
      { type: 'input_audio', input_audio: { data: 'QUJD', format: 'm4a' } },
    ]
    if (input === 'mixed') messages[1].content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } })
    return messages
  }
  if (input === 'image') {
    messages[1].content = [
      { type: 'text', text: 'حلل صورة العقار.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ]
    return messages
  }
  if (input === 'tool_single') {
    messages.push({ role: 'assistant', content: null, tool_calls: [toolCall('call_single_01')] })
    return messages
  }
  if (input === 'tool_parallel' || input === 'tool_result') {
    messages.push({ role: 'assistant', content: null, tool_calls: [toolCall('call_parallel_01'), toolCall('call_parallel_02', 'query')] })
    messages.push({ role: 'tool', tool_call_id: 'call_parallel_01', name: tool.name, content: '{"ok":true}' })
    messages.push({ role: 'tool', tool_call_id: 'call_parallel_02', name: 'query', content: '{"rows":[]}' })
    return messages
  }
  if (input === 'gemini_metadata') {
    messages.push({ role: 'assistant', content: null, tool_calls: [signatureCall] })
    messages.push({ role: 'tool', tool_call_id: 'call_sig_01', name: tool.name, content: '{"ok":true}' })
    return messages
  }
  throw new Error(`unknown input ${input}`)
}

const inputs = ['text', 'attachment_reference', 'image', 'audio', 'mixed', 'tool_single', 'tool_parallel', 'tool_result', 'gemini_metadata']
const report = []
let pass = 0
let blocked = 0

for (const provider of PROVIDERS) {
  for (const model of modelsByProvider[provider.id] ?? provider.defaultModels) {
    const def = defaultProvider(provider.id)
    const capabilities = providerCapabilities(def, model)
    for (const input of inputs) {
      const row = { provider: provider.id, model, input, family: providerWireFamily(def, model), supportsChat: capabilities.supportsChat, supportsVision: capabilities.supportsVision, supportsTools: capabilities.supportsTools, supportsInputAudio: capabilities.supportsInputAudio, status: 'PASS', detail: '' }
      try {
        const body = buildChatRequestBody({
          provider: def,
          model,
          baseUrl: 'https://example.invalid/v1',
          apiKey: 'test-key',
          messages: messagesFor(input),
          functions: capabilities.supportsTools ? [tool] : [tool],
          maxTokens: 128,
        }, input === 'tool_result')
        if (input === 'image' || input === 'mixed') {
          if (!capabilities.supportsVision) {
            row.status = 'BLOCKED'
            row.detail = 'الصور محجوبة محلياً لأن الموديل لا يثبت دعماً لفهم الصور؛ لم يُبنَ payload قابل للإرسال.'
            blocked++
            report.push(row)
            continue
          }
        }
        if (input === 'audio' || input === 'mixed') {
          if (!capabilities.supportsInputAudio) {
            row.status = 'BLOCKED'
            row.detail = 'الصوت محجوب محلياً لأن الموديل لا يثبت دعمه؛ لم يُبنَ payload قابل للإرسال.'
            blocked++
            report.push(row)
            continue
          }
          assert.ok(Array.isArray(body.messages[1].content))
        }
        if (input.startsWith('tool_') || input === 'gemini_metadata') {
          if (!capabilities.supportsTools) {
            row.status = 'BLOCKED'
            row.detail = 'الأدوات محجوبة محلياً لأن الموديل غير حواري/لا يثبت دعم الأدوات.'
            blocked++
            report.push(row)
            continue
          }
          assert.ok(Array.isArray(body.tools), `${provider.id}/${model} lost tools`) 
        }
        if (input === 'gemini_metadata') {
          const call = body.messages.find((message) => message.role === 'assistant')?.tool_calls?.[0]
          if (capabilities.preservesThoughtSignatures) assert.equal(call?.extra_content?.google?.thought_signature, 'SIG_TEST')
          else assert.equal(call?.extra_content, undefined)
        }
        pass++
      } catch (error) {
        const expectedChatBlock = !capabilities.supportsChat
        const expectedAudioBlock = (input === 'audio' || input === 'mixed') && !capabilities.supportsInputAudio
        const expectedVisionBlock = (input === 'image' || input === 'mixed') && !capabilities.supportsVision
        const expectedToolBlock = !capabilities.supportsTools
        const expectedParallelBlock = (input === 'tool_parallel' || input === 'tool_result') && !capabilities.supportsParallelTools
        if (expectedChatBlock || expectedAudioBlock || expectedVisionBlock || expectedToolBlock || expectedParallelBlock) {
          row.status = 'BLOCKED'
          row.detail = error?.message ?? String(error)
          blocked++
          report.push(row)
          continue
        }
        row.status = 'FAIL'
        row.detail = error?.message ?? String(error)
        report.push(row)
        throw new Error(`Compatibility failure ${provider.id}/${model}/${input}: ${row.detail}`)
      }
      report.push(row)
    }
  }
}

const invalidCases = [
  {
    name: 'missing_tool_call_id',
    run: () => buildChatRequestBody({ provider: defaultProvider('openai'), model: 'gpt-5.4-mini', apiKey: 'x', messages: [{ role: 'tool', content: '{}', name: 'x' }], functions: [tool] }),
  },
  {
    name: 'embedding_with_tools',
    run: () => buildChatRequestBody({ provider: defaultProvider('openai'), model: 'text-embedding-3-small', apiKey: 'x', messages: baseMessages(), functions: [tool] }),
  },
]
for (const invalid of invalidCases) {
  assert.throws(invalid.run, `${invalid.name} must be blocked before network`)
}

const output = {
  generatedAt: new Date().toISOString(),
  providers: Object.keys(modelsByProvider),
  inputs,
  pass,
  blocked,
  total: report.length,
  failures: report.filter((row) => row.status === 'FAIL'),
  rows: report,
}
fs.writeFileSync(new URL('../docs/PROVIDER_COMPATIBILITY_MATRIX_AR.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(`Provider compatibility matrix: PASS (${pass} pass, ${blocked} blocked locally, ${report.length} rows)`)
