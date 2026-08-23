import { providerCapabilities, type ProviderDef, type ProviderId } from './providers'
import { providerWireFamily, type ProviderWireFamily } from './providerWire'

export type ProfileSource = 'catalog' | 'official_static' | 'user_declared' | 'probe' | 'unknown'
export type ProfileConfidence = 'high' | 'medium' | 'low'

export type ModelCatalogMetadata = {
  id?: string
  supportedParameters?: string[]
  inputModalities?: string[]
  outputModalities?: string[]
  architecture?: Record<string, unknown>
  topProvider?: Record<string, unknown>
  raw?: Record<string, unknown>
}

export type ModelProfile = {
  key: string
  provider: ProviderId
  model: string
  wireFamily: ProviderWireFamily
  source: ProfileSource
  observedAt: string
  confidence: ProfileConfidence
  supports: {
    chat: boolean
    tools: boolean
    parallelTools: boolean
    vision: boolean
    inputAudio: boolean
    streaming: boolean
    strictTools: boolean
    jsonSchema: boolean
  }
  supportedParams: string[]
  maxTokensField: 'max_tokens' | 'max_completion_tokens' | 'unknown'
  nativeExtras: Record<string, unknown>
  schemaTransform: 'none' | 'openai-strict' | 'dashscope' | 'gemini-signature' | 'custom'
}

function normalizedParams(meta?: ModelCatalogMetadata): Set<string> {
  return new Set((meta?.supportedParameters ?? []).map((value) => String(value).trim().toLowerCase()).filter(Boolean))
}

function hasAny(values: Set<string>, names: string[]): boolean {
  return names.some((name) => values.has(name))
}

function staticMaxTokensField(def: ProviderDef, model: string): ModelProfile['maxTokensField'] {
  const normalized = model.toLowerCase()
  if (def.id === 'openai' && /^(?:gpt-5|o[1-9])/.test(normalized)) return 'max_completion_tokens'
  if (def.id === 'alibaba' && /^(?:qwen3\.[5-9]|glm-5|kimi-k2\.[5-9]|deepseek-v4)/i.test(normalized)) return 'max_completion_tokens'
  if (def.id === 'openrouter') return 'unknown'
  if (def.id === 'custom') return 'unknown'
  return 'max_tokens'
}

function staticConfidence(def: ProviderDef, model: string): ProfileConfidence {
  if (def.id === 'custom' || !model.trim()) return 'low'
  if (def.id === 'openrouter') return 'low'
  return 'medium'
}

export function modelProfileKey(provider: ProviderId, model: string): string {
  return `${provider}:${model.trim().toLowerCase()}`
}

export function resolveModelProfile(
  def: ProviderDef,
  model: string,
  catalog?: ModelCatalogMetadata,
  now = new Date().toISOString(),
): ModelProfile {
  const base = providerCapabilities(def, model)
  const params = normalizedParams(catalog)
  const hasCatalog = params.size > 0 || Boolean(catalog?.inputModalities?.length || catalog?.outputModalities?.length)
  const inputModalities = new Set((catalog?.inputModalities ?? []).map((value) => String(value).toLowerCase()))
  const supportsTools = hasCatalog ? params.has('tools') : def.id === 'custom' ? false : base.supportsTools
  // اختبار Mistral الحي أثبت أن endpoint المستخدم يرفض جولات الأدوات المتوازية،
  // حتى عندما تعلن catalog metadata عن parallel_tool_calls. نختار fail-closed
  // وننفذها تسلسلياً؛ هذا لا يمنع الوكيل من إنجاز المهمة بل يمنع 400 بنيوياً.
  const supportsParallelTools = def.id === 'mistral'
    ? false
    : hasCatalog
      ? params.has('parallel_tool_calls')
      : false
  const supportsVision = hasCatalog
    ? hasAny(inputModalities, ['image', 'image_url', 'vision'])
    : base.supportsVision
  const supportsInputAudio = hasCatalog
    ? hasAny(inputModalities, ['audio', 'input_audio', 'sound'])
    : base.supportsInputAudio
  const maxTokensField: ModelProfile['maxTokensField'] = hasCatalog
    ? params.has('max_completion_tokens')
      ? 'max_completion_tokens'
      : params.has('max_tokens')
        ? 'max_tokens'
        : 'unknown'
    : staticMaxTokensField(def, model)
  const strictTools = hasCatalog ? params.has('structured_outputs') || params.has('strict') : def.id === 'openai'
  const jsonSchema = hasCatalog ? params.has('structured_outputs') || params.has('response_format') : def.id === 'openai'
  const staticParams = def.id === 'custom'
    ? []
    : ['tools', 'tool_choice', 'temperature', 'stream', 'max_tokens', ...(base.supportsStreamOptions ? ['stream_options'] : [])]
  if (!hasCatalog && maxTokensField === 'max_completion_tokens') staticParams.push('max_completion_tokens')
  const resolvedParams = hasCatalog ? [...params].sort() : staticParams
  const nativeExtras: Record<string, unknown> = {}
  if (def.id === 'alibaba' && /^(?:qwen|glm|deepseek|kimi)/i.test(model)) {
    nativeExtras.tool_stream = false
  }

  return {
    key: modelProfileKey(def.id, model),
    provider: def.id,
    model,
    wireFamily: providerWireFamily(def, model),
    source: hasCatalog ? 'catalog' : def.id === 'custom' ? 'unknown' : 'official_static',
    observedAt: now,
    confidence: hasCatalog ? 'high' : staticConfidence(def, model),
    supports: {
      chat: base.supportsChat,
      tools: supportsTools,
      parallelTools: supportsParallelTools,
      vision: supportsVision,
      inputAudio: supportsInputAudio,
      streaming: def.id === 'custom' ? false : base.supportsStreaming,
      strictTools,
      jsonSchema,
    },
    supportedParams: resolvedParams,
    maxTokensField,
    nativeExtras,
    schemaTransform: def.id === 'gemini' ? 'gemini-signature' : def.id === 'alibaba' ? 'dashscope' : 'none',
  }
}

export function mergeModelCatalogMetadata(
  profile: ModelProfile,
  metadata: ModelCatalogMetadata,
  now = new Date().toISOString(),
): ModelProfile {
  return resolveModelProfile(
    {
      id: profile.provider,
      name: profile.provider,
      color: '',
      baseUrl: '',
      defaultModels: [],
      modelsKind: profile.provider === 'gemini' ? 'gemini' : 'openai',
    },
    profile.model,
    metadata,
    now,
  )
}

export function profileAllowsParam(profile: ModelProfile, param: string): boolean {
  if (profile.supportedParams.length === 0) return false
  return profile.supportedParams.includes(param.toLowerCase())
}

export function profileSummary(profile: ModelProfile): string {
  const caps = Object.entries(profile.supports)
    .filter(([, supported]) => supported)
    .map(([name]) => name)
    .join(', ')
  return `${profile.provider}/${profile.model} [${profile.source}/${profile.confidence}] ${caps || 'no optional capabilities'}`
}
