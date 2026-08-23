/**
 * العقد الداخلي الموحّد للوكيل.
 *
 * لا يحتوي هذا الملف على thought_signature أو extra_body أو max_tokens_field؛
 * هذه تفاصيل adapter وتُحفظ فقط داخل providerState عند الحاجة.
 */

export type JsonSchema = Record<string, unknown>

export type CanonicalTextPart = {
  type: 'text'
  text: string
}

export type CanonicalImagePart = {
  type: 'image'
  data: string
  mediaType: string
}

export type CanonicalAudioPart = {
  type: 'audio'
  data: string
  format: 'm4a' | 'wav' | 'mp3' | 'webm' | string
  mediaType?: string
}

export type CanonicalContentPart = CanonicalTextPart | CanonicalImagePart | CanonicalAudioPart
export type CanonicalContent = string | CanonicalContentPart[] | null

export type ProviderState = {
  /** بيانات مزود خام لازمة لإعادة بث history؛ لا تُرسل إلا عبر adapter المصدر. */
  family: string
  payload?: Record<string, unknown>
  origin: 'model' | 'legacy' | 'synthetic'
}

export type CanonicalTool = {
  name: string
  description: string
  inputSchema: JsonSchema
  strict: 'required' | 'preferred' | 'disabled'
  sideEffect: 'none' | 'local_read' | 'local_write' | 'local_notification' | 'destructive'
}

export type CanonicalToolCall = {
  toolCallId: string
  toolName: string
  argsText: string
  args?: unknown
  providerState?: ProviderState
  origin: 'model' | 'legacy' | 'synthetic'
}

export type CanonicalMessage =
  | { role: 'system' | 'user'; content: CanonicalContent }
  | { role: 'assistant'; content: CanonicalContent; toolCalls?: CanonicalToolCall[]; providerState?: ProviderState }
  | { role: 'tool'; toolCallId: string; toolName: string; result: unknown; isError?: boolean }

export type CanonicalExecutionPolicy = {
  stream: boolean
  parallel: 'deny' | 'allow'
  toolChoice: 'auto' | 'none' | { name: string }
  maxOutputTokens?: number
  temperature?: number
}

export type CanonicalRequest = {
  model: string
  messages: CanonicalMessage[]
  tools: CanonicalTool[]
  policy: CanonicalExecutionPolicy
}

export type CanonicalResponse = {
  content: string | null
  toolCalls: CanonicalToolCall[]
  finishReason: string
  usage?: { promptTokens?: number; completionTokens?: number }
  providerState?: ProviderState
}

export type CanonicalStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_delta'; toolCallId?: string; toolName?: string; argsDelta?: string; providerState?: ProviderState }
  | { type: 'reasoning_delta'; text: string; providerState?: ProviderState }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; error: CanonicalLlmError }

export type CanonicalErrorKind =
  | 'network'
  | 'timeout'
  | 'invalid_request'
  | 'auth'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'parse'
  | 'tool_validation'
  | 'unknown'

export type CanonicalLlmError = {
  kind: CanonicalErrorKind
  message: string
  status?: number
  retryable: boolean
  provider?: string
  model?: string
  requestId?: string
  providerDetail?: unknown
}

export type ValidationIssue = {
  code:
    | 'missing_model'
    | 'missing_tool_id'
    | 'duplicate_tool_id'
    | 'unknown_tool'
    | 'invalid_arguments'
    | 'missing_tool_result'
    | 'orphan_tool_result'
    | 'duplicate_tool_result'
    | 'parallel_not_allowed'
    | 'unsupported_capability'
  message: string
  path?: string
}
