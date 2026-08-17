import { providerCapabilities, type ProviderDef } from './providers'

export type ProviderWireFamily =
  | 'anthropic-messages'
  | 'gemini-openai'
  | 'openai-chat'
  | 'mistral-chat'
  | 'dashscope-chat'
  | 'openrouter-chat'
  | 'nvidia-chat'
  | 'custom-openai'

export type WireContent = string | { type: string; [key: string]: any }[] | null

export interface InternalToolCall {
  id?: string
  type?: string
  function?: { name?: string; arguments?: string | Record<string, any>; [key: string]: any }
  extra_content?: Record<string, any>
  thought_signature?: string
  [key: string]: any
}

export interface InternalChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: WireContent
  tool_call_id?: string
  name?: string
  tool_calls?: InternalToolCall[]
  tool_error?: boolean
}

export interface WireRequestIssue {
  kind: 'invalid_request'
  message: string
}

export function providerWireFamily(def: ProviderDef, _model: string): ProviderWireFamily {
  if (def.id === 'anthropic') return 'anthropic-messages'
  if (def.id === 'gemini') return 'gemini-openai'
  if (def.id === 'mistral') return 'mistral-chat'
  if (def.id === 'alibaba') return 'dashscope-chat'
  if (def.id === 'openrouter') return 'openrouter-chat'
  if (def.id === 'nvidia') return 'nvidia-chat'
  if (def.id === 'openai') return 'openai-chat'
  return 'custom-openai'
}

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) return value
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

function extractSignature(call: InternalToolCall): string | undefined {
  return call.extra_content?.google?.thought_signature
    ?? call.thought_signature
    ?? call.function?.thought_signature
}

function serializeAudioPart(part: { type: string; [key: string]: any }, family: ProviderWireFamily): { type: string; [key: string]: any } {
  const input = part.input_audio
  if (!input || typeof input !== 'object') return part
  const data = String(input.data ?? '')
  const format = String(input.format ?? 'm4a')
  if (family === 'mistral-chat') {
    return { ...part, input_audio: data }
  }
  if (family === 'dashscope-chat' && data && !/^https?:\/\//i.test(data) && !/^data:/i.test(data)) {
    const mime = format === 'mp3' ? 'audio/mpeg' : format === 'wav' ? 'audio/wav' : format === 'webm' ? 'audio/webm' : 'audio/mp4'
    return { ...part, input_audio: { data: `data:${mime};base64,${data}`, format } }
  }
  return part
}

function serializeContent(content: WireContent, family: ProviderWireFamily): WireContent {
  if (!Array.isArray(content)) return content
  return content.map((part) => part.type === 'input_audio' ? serializeAudioPart(part, family) : part)
}

function serializeToolCall(call: InternalToolCall, family: ProviderWireFamily, index: number): Record<string, any> {
  const fn = call.function && typeof call.function === 'object' ? call.function : {}
  const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {})
  const wire: Record<string, any> = {
    id: String(call.id ?? '').trim(),
    type: 'function',
    function: {
      name: String(fn.name ?? call.name ?? '').trim(),
      arguments: args,
    },
  }

  if (family === 'gemini-openai') {
    const signature = extractSignature(call)
    const provided = cloneJson(call.extra_content)
    if (provided && typeof provided === 'object') wire.extra_content = provided
    if (signature !== undefined && wire.extra_content?.google?.thought_signature === undefined) {
      wire.extra_content = {
        ...(wire.extra_content ?? {}),
        google: { ...(wire.extra_content?.google ?? {}), thought_signature: signature },
      }
    }
    // This is deliberately only for the Gemini adapter and only on the first
    // call in an assistant batch, matching Google's validator fallback rule.
    if (index === 0 && wire.extra_content?.google?.thought_signature === undefined) {
      wire.extra_content = {
        ...(wire.extra_content ?? {}),
        google: { ...(wire.extra_content?.google ?? {}), thought_signature: 'skip_thought_signature_validator' },
      }
    }
  }

  // Every non-Gemini adapter returns the strict common Chat Completions shape.
  // In particular, Mistral rejects unknown nested fields such as extra_content.
  return wire
}

export function serializeProviderMessages(def: ProviderDef, model: string, messages: InternalChatMessage[]): Record<string, any>[] {
  const family = providerWireFamily(def, model)
  return messages.map((message) => {
    const output: Record<string, any> = {
      role: message.role,
      content: serializeContent(message.content, family) ?? null,
    }
    if (message.tool_call_id) output.tool_call_id = message.tool_call_id
    if (message.name) output.name = message.name
    if (message.tool_calls) {
      output.tool_calls = message.tool_calls.map((call, index) => serializeToolCall(call, family, index))
    }
    return output
  })
}

export function providerWireRequestExtras(def: ProviderDef, model: string, hasTools = true): Record<string, any> {
  const family = providerWireFamily(def, model)
  const normalized = model.toLowerCase()
  if (hasTools && family === 'dashscope-chat' && /^(?:glm|z-ai\/glm)/i.test(normalized)) {
    return { extra_body: { tool_stream: true } }
  }
  return {}
}

export type ProviderCapabilityOverride = {
  supportsChat: boolean
  supportsTools: boolean
  supportsParallelTools: boolean
  supportsVision: boolean
  supportsInputAudio: boolean
}

export function providerRequestIssues(
  def: ProviderDef,
  model: string,
  messages: InternalChatMessage[],
  hasTools: boolean,
  capabilityOverride?: ProviderCapabilityOverride,
): WireRequestIssue[] {
  const issues: WireRequestIssue[] = []
  const capabilities = capabilityOverride ?? providerCapabilities(def, model)
  const family = providerWireFamily(def, model)
  if (!capabilities.supportsChat) {
    issues.push({ kind: 'invalid_request', message: `الموديل ${model} لا يدعم واجهة Chat Completions؛ لا يمكن استخدامه مع دورة كيمو.` })
  }
  if (hasTools && !capabilities.supportsTools) {
    issues.push({ kind: 'invalid_request', message: `الموديل ${model} لا يثبت دعماً لاستدعاء الأدوات عبر ${def.name}.` })
  }
  if (!capabilities.supportsParallelTools && messages.some((message) => Array.isArray(message.tool_calls) && message.tool_calls.length > 1)) {
    issues.push({ kind: 'invalid_request', message: `الموديل ${model} لا يثبت دعماً لنداءات الأدوات المتوازية عبر ${def.name}.` })
  }
  for (const message of messages) {
    if (Array.isArray(message.content) && message.content.some((part) => part.type === 'input_audio') && !capabilities.supportsInputAudio) {
      issues.push({ kind: 'invalid_request', message: `الموديل ${model} لا يثبت دعماً للإدخال الصوتي عبر ${def.name}.` })
    }
    if (Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url') && !capabilities.supportsVision) {
      issues.push({ kind: 'invalid_request', message: `الموديل ${model} لا يثبت دعماً لفهم الصور عبر ${def.name}.` })
    }
    if (message.role === 'tool' && !String(message.tool_call_id ?? '').trim()) {
      issues.push({ kind: 'invalid_request', message: 'رسالة نتيجة أداة بلا tool_call_id قابل للربط.' })
    }
    if (message.role === 'assistant' && message.tool_calls) {
      for (const call of message.tool_calls) {
        const name = String(call.function?.name ?? call.name ?? '').trim()
        const id = String(call.id ?? '').trim()
        if (!name || !id || call.function?.arguments == null) {
          issues.push({ kind: 'invalid_request', message: `نداء أداة ناقص في محول ${family}: يجب وجود id وname وarguments.` })
        }
      }
    }
  }
  return issues
}
