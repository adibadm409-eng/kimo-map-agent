import type { FunctionDef, ToolCall } from './llm'
import type { InternalChatMessage, WireContent } from './providerWire'

export type AnthropicRequest = {
  model: string
  system?: string
  messages: Record<string, any>[]
  tools?: Record<string, any>[]
  max_tokens: number
  temperature?: number
  stream?: boolean
}

function dataUrlParts(url: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(url)
  return match ? { mediaType: match[1], data: match[2] } : null
}

function toAnthropicContent(content: WireContent): string | Record<string, any>[] {
  if (typeof content === 'string' || content === null) return content ?? ''
  return content.map((part: any) => {
    if (part.type === 'text') return { type: 'text', text: String(part.text ?? '') }
    if (part.type === 'image_url') {
      const url = String(part.image_url?.url ?? '')
      const data = dataUrlParts(url)
      if (data) return { type: 'image', source: { type: 'base64', media_type: data.mediaType, data: data.data } }
      return { type: 'text', text: `[صورة غير قابلة للتمرير إلى Anthropic: ${url.slice(0, 240)}]` }
    }
    if (part.type === 'input_audio') throw new Error('Anthropic Messages لا يدعم input_audio في محول Kimo الحالي.')
    return { type: 'text', text: String(part.text ?? part.content ?? '') }
  })
}

function parseToolInputStrict(raw: unknown): Record<string, any> {
  const value = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Anthropic tool_use input must be a JSON object.')
  return value as Record<string, any>
}

function toToolUse(call: any): Record<string, any> {
  const id = String(call.id ?? '').trim()
  const name = String(call.function?.name ?? call.name ?? '').trim()
  if (!id || !name) throw new Error('Anthropic tool_use requires a non-empty id and name.')
  const input = parseToolInputStrict(typeof call.function?.arguments === 'string' ? call.function.arguments : call.function?.arguments ?? {})
  return { type: 'tool_use', id, name, input }
}

export function buildAnthropicRequest(options: {
  model: string
  messages: InternalChatMessage[]
  functions?: FunctionDef[]
  maxTokens?: number
  temperature?: number
  stream?: boolean
}): AnthropicRequest {
  const messages: Record<string, any>[] = []
  let system = ''
  for (let i = 0; i < options.messages.length; i++) {
    const message = options.messages[i]
    if (message.role === 'system') {
      const value = toAnthropicContent(message.content)
      system += `${system ? '\n' : ''}${typeof value === 'string' ? value : value.map((part) => part.text ?? '').join(' ')}`
      continue
    }
    if (message.role === 'tool') {
      const blocks: Record<string, any>[] = []
      let j = i
      while (j < options.messages.length && options.messages[j].role === 'tool') {
        const tool = options.messages[j]
        blocks.push({
          type: 'tool_result',
          tool_use_id: String(tool.tool_call_id ?? ''),
          content: String(tool.content ?? ''),
          is_error: tool.tool_error === true,
        })
        j++
      }
      messages.push({ role: 'user', content: blocks })
      i = j - 1
      continue
    }
    const content = toAnthropicContent(message.content)
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const blocks: Record<string, any>[] = []
      if (typeof content === 'string' && content.trim()) blocks.push({ type: 'text', text: content })
      else if (Array.isArray(content)) blocks.push(...content)
      blocks.push(...message.tool_calls.map(toToolUse))
      messages.push({ role: 'assistant', content: blocks })
    } else {
      messages.push({ role: message.role, content })
    }
  }

  const body: AnthropicRequest = {
    model: options.model,
    messages,
    max_tokens: options.maxTokens ?? 4096,
  }
  if (system.trim()) body.system = system
  if (options.functions?.length) {
    body.tools = options.functions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.stream) body.stream = true
  return body
}

export function parseAnthropicResponse(data: any): {
  content: string | null
  toolCalls: ToolCall[]
  finishReason: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
} {
  const blocks = Array.isArray(data?.content) ? data.content : []
  const text = blocks.filter((block: any) => block?.type === 'text').map((block: any) => String(block.text ?? '')).join('')
  const toolCalls: ToolCall[] = blocks.filter((block: any) => block?.type === 'tool_use').map((block: any) => {
    const id = String(block.id ?? '').trim()
    const name = String(block.name ?? '').trim()
    if (!id || !name) throw new Error('Anthropic tool_use response is missing id or name.')
    if (!block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw new Error('Anthropic tool_use input must be an object.')
    return { id, name, arguments: JSON.stringify(block.input), extra: { raw: block } }
  })
  return {
    content: text || null,
    toolCalls,
    finishReason: String(data?.stop_reason ?? 'stop'),
    usage: data?.usage ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens } : undefined,
  }
}
