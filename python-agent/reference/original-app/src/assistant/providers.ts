export type ProviderId =
  | 'gemini'
  | 'anthropic'
  | 'mistral'
  | 'deepseek'
  | 'alibaba'
  | 'openai'
  | 'openrouter'
  | 'nvidia'
  | 'custom'

export type VoiceSupport = 'supported' | 'unsupported' | 'unknown'

export interface ProviderCapabilities {
  supportsChat: boolean
  supportsVision: boolean
  supportsTools: boolean
  supportsParallelTools: boolean
  supportsStreaming: boolean
  supportsStreamOptions: boolean
  maxTokensField: 'max_tokens' | 'max_completion_tokens'
  /** هل يجب حفظ وإعادة بث حقول Gemini الخاصة إن ظهرت في الاستجابة؟ */
  preservesThoughtSignatures: boolean
  /** لا نرسل input_audio إلا إذا كان هذا صحيحاً بشكل محافظ. */
  supportsInputAudio: boolean
  audioFormats: string[]
}

export interface ProviderDef {
  id: ProviderId
  name: string
  color: string
  baseUrl: string
  defaultModels: string[]
  modelsKind: 'openai' | 'gemini' | 'anthropic' | 'none'
  hint?: string
  note?: string
  capabilityOverrides?: Record<string, Partial<ProviderCapabilities>>
}

export interface CustomProviderDef {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export function defaultProvider(id: ProviderId): ProviderDef {
  const p = PROVIDERS.find((x) => x.id === id)
  if (p) return p
  return { id: 'custom', name: 'مزود مخصص', color: '#F59E0B', baseUrl: '', defaultModels: [], modelsKind: 'openai', hint: '' }
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini',
    name: 'جوجل جيميني',
    color: '#4285F4',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModels: [
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'deep-research-preview-04-2026',
      'antigravity-preview-05-2026',
    ],
    modelsKind: 'gemini',
    hint: 'مفتاح API من aistudio.google.com — الواجهة المتوافقة مع OpenAI',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10A37F',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4-mini', 'gpt-5.4-nano'],
    modelsKind: 'openai',
    hint: 'مفتاح API من platform.openai.com',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    color: '#D97757',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModels: ['claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-haiku-4-5-20251001'],
    modelsKind: 'anthropic',
    hint: 'مفتاح API من console.anthropic.com — واجهة Messages الأصلية',
  },
  {
    id: 'mistral',
    name: 'مستـرال',
    color: '#F50000',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModels: ['mistral-large-2-latest', 'mistral-medium-2-latest', 'codestral-2-latest', 'open-mixtral-8x22b'],
    modelsKind: 'openai',
    hint: 'مفتاح API من console.mistral.ai',
  },
  {
    id: 'deepseek',
    name: 'ديب سيك',
    color: '#4D6BFE',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    modelsKind: 'openai',
    hint: 'مفتاح API من platform.deepseek.com',
  },
  {
    id: 'alibaba',
    name: 'داش سكوب (علي بابا)',
    color: '#FF6A00',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.6-flash', 'qwen3.5-plus', 'qwen3.5-flash', 'qwen3-max'],
    modelsKind: 'none',
    hint: 'مفتاح API من bailian.console.aliyun.com (نموذج SK-...)',
  },
  {
    id: 'openrouter',
    name: 'أوبن روتـر',
    color: '#8B5CF6',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModels: [
      'openrouter/free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'google/gemma-4-31b-it:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'openai/gpt-oss-20b:free',
      'qwen/qwen3-next-80b-a3b-instruct:free',
    ],
    modelsKind: 'openai',
    hint: 'مفتاح API من openrouter.ai/keys — موديلات مجانية بدون بطاقة',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    color: '#76B900',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModels: [
      'meta/llama-3.3-70b-instruct',
      'meta/llama-3.1-405b-instruct',
      'nvidia/llama-3.1-nemotron-ultra-253b-v1',
      'mistralai/mistral-small-3.1-24b-instruct-2503',
      'microsoft/phi-4-mini-instruct',
    ],
    modelsKind: 'openai',
    hint: 'مفتاح API من build.nvidia.com (خطة مجانية 1000 رصيد)',
  },
  {
    id: 'custom',
    name: 'مزود مخصص',
    color: '#F59E0B',
    baseUrl: '',
    defaultModels: [],
    modelsKind: 'openai',
    hint: 'أي مزود متوافق مع واجهة OpenAI: الاسم + الرابط + المفتاح + الموديلات',
  },
]

const DECLARED_MODEL_CAPABILITIES: Record<string, Partial<ProviderCapabilities>> = {
  'gemini:gemini-2.5-flash': { supportsChat: true, supportsVision: true, supportsTools: true, supportsInputAudio: true },
  'gemini:gemini-3.5-flash': { supportsChat: true, supportsVision: true, supportsTools: true, supportsInputAudio: true },
  'openai:gpt-4o-audio-preview': { supportsChat: true, supportsVision: true, supportsTools: true, supportsInputAudio: true },
  'openai:gpt-4o-mini-audio-preview': { supportsChat: true, supportsVision: true, supportsTools: true, supportsInputAudio: true },
  'mistral:voxtral-small-latest': { supportsChat: true, supportsVision: false, supportsTools: true, supportsInputAudio: true, audioFormats: ['wav', 'mp3'] },
  'mistral:mistral-small-3.1-24b-instruct-2503': { supportsChat: true, supportsVision: true, supportsTools: true, supportsInputAudio: false },
}

function providerKey(id: ProviderId, customId?: string): string {
  return id === 'custom' && customId ? `custom:${customId}` : id
}

export function providerLabel(p: ProviderDef | undefined): string {
  return p?.name ?? 'مزود غير محدد'
}

/** ملف قدرات محافظ: لا نرسل خياراً لا يثبت أن المزود يدعمه. */
function isGeminiModel(model: string): boolean {
  return /(?:^|[/:_-])gemini-(?:2\.5|3)(?:[./:_-]|$)/i.test(model)
}

function isKnownVisionModel(def: ProviderDef, model: string): boolean {
  const normalized = model.toLowerCase()
  if (def.id === 'gemini') return isGeminiModel(normalized) && !/image|embedding|tts|live/i.test(normalized)
  if (def.id === 'openai') return /(?:gpt-4o|gpt-5|^o[1-9])/i.test(normalized)
  if (def.id === 'anthropic') return /^claude-/i.test(normalized)
  if (def.id === 'mistral') return /(?:pixtral|mistral-small-3\.1|ministral-3)/i.test(normalized)
  if (def.id === 'alibaba') return /qwen.*(?:vl|omni)/i.test(normalized)
  if (def.id === 'openrouter') return /(?:gemini|gpt-4o|qwen.*(?:vl|omni)|pixtral|vision|vl)/i.test(normalized)
  if (def.id === 'nvidia') return /(?:vision|vl|mistral-small-3\.1)/i.test(normalized)
  if (def.id === 'custom') return /(?:vision|vl|omni|gpt-4o|gemini)/i.test(normalized)
  return false
}

function isKnownAudioModel(def: ProviderDef, model: string): boolean {
  const normalized = model.toLowerCase()
  if (def.id === 'gemini') return isGeminiModel(normalized) && !/image|embedding|tts|live/i.test(normalized)
  if (def.id === 'openai') return /gpt-4o-(?:mini-)?audio(?:-preview)?$/i.test(normalized)
  if (def.id === 'anthropic') return false
  if (def.id === 'alibaba') return /(?:qwen.*(?:omni|audio)|qwen3-asr)/i.test(normalized)
  if (def.id === 'mistral') return /voxtral-small/i.test(normalized)
  if (def.id === 'openrouter') return /(?:gemini-(?:2\.5|3)|gpt-4o-(?:mini-)?audio|voxtral|qwen.*(?:omni|audio))/i.test(normalized)
  return false
}

export function providerCapabilities(def: ProviderDef, model = ''): ProviderCapabilities {
  const normalizedModel = model.toLowerCase()
  const declared = def.capabilityOverrides?.[normalizedModel] ?? DECLARED_MODEL_CAPABILITIES[`${def.id}:${normalizedModel}`]
  const newerOpenAiStyle = (
    /^(?:gpt-5|o[1-9])/.test(normalizedModel) && ['openai', 'openrouter', 'custom'].includes(def.id)
  ) || (
    def.id === 'alibaba' && /^(?:qwen3\.[5-9]|glm-5|kimi-k2\.[5-9]|deepseek-v4)/i.test(normalizedModel)
  )
  const geminiFamily = def.id === 'gemini'
  const supportsInputAudio = isKnownAudioModel(def, normalizedModel)
  const supportsChat = !/(?:embedding|text-embedding|image-generation|image-preview|tts|rerank)/i.test(normalizedModel)
  const supportsVision = supportsChat && isKnownVisionModel(def, normalizedModel)
  const supportsTools = supportsChat && !/(?:transcrib(?:e|er)|asr)/i.test(normalizedModel)
  const supportsParallelTools = supportsTools && def.id !== 'custom'
  const supportsStreaming = def.id !== 'custom'
  const supportsStreamOptions = ['openai', 'deepseek', 'openrouter'].includes(def.id)
  return {
    supportsChat: declared?.supportsChat ?? supportsChat,
    supportsVision: declared?.supportsVision ?? supportsVision,
    supportsTools: declared?.supportsTools ?? supportsTools,
    supportsParallelTools: declared?.supportsParallelTools ?? supportsParallelTools,
    supportsStreaming: declared?.supportsStreaming ?? supportsStreaming,
    // stream_options ليس جزءاً مضموناً من كل بوابات OpenAI-compatible.
    supportsStreamOptions: declared?.supportsStreamOptions ?? supportsStreamOptions,
    maxTokensField: declared?.maxTokensField ?? (newerOpenAiStyle ? 'max_completion_tokens' : 'max_tokens'),
    preservesThoughtSignatures: declared?.preservesThoughtSignatures ?? geminiFamily,
    supportsInputAudio: declared?.supportsInputAudio ?? supportsInputAudio,
    audioFormats: declared?.audioFormats ?? (supportsInputAudio ? ['wav', 'mp3', 'm4a', 'webm'] : []),
  }
}

export function voiceSupportFor(def: ProviderDef, model: string): VoiceSupport {
  if (!model.trim()) return 'unknown'
  return providerCapabilities(def, model).supportsInputAudio ? 'supported' : 'unsupported'
}

export const VOICE_SUPPORT_GUIDE: { provider: ProviderId; label: string; models: string; support: VoiceSupport; note: string }[] = [
  { provider: 'gemini', label: 'جوجل جيميني', models: 'Gemini 2.5 / Gemini 3 (نماذج الفهم)', support: 'supported', note: 'يُرسل التسجيل كـ input_audio عبر واجهة OpenAI-compatible.' },
  { provider: 'openai', label: 'OpenAI', models: 'gpt-4o-audio-preview و gpt-4o-mini-audio-preview', support: 'supported', note: 'يجب اختيار موديل صوتي صريح؛ لا نرسل الصوت إلى موديلات النص العامة تلقائياً.' },
  { provider: 'alibaba', label: 'داش سكوب', models: 'نماذج Qwen Audio/Omni فقط عند ظهورها في الاسم', support: 'supported', note: 'الدعم مشروط باسم موديل صوتي صريح في القائمة الحية.' },
  { provider: 'openrouter', label: 'OpenRouter', models: 'مسارات Gemini/GPT Audio/Omni فقط', support: 'supported', note: 'الدعم مشروط بأن يثبت اسم المسار الصوتي ذلك.' },
  { provider: 'mistral', label: 'مسترال', models: 'voxtral-small-latest للمحادثة الصوتية؛ voxtral-mini-latest للتفريغ المتخصص', support: 'supported', note: 'Voxtral Small يستخدم Chat Completions بصيغة input_audio الخاصة بـMistral؛ التفريغ المتخصص يحتاج endpoint audio/transcriptions.' },
  { provider: 'deepseek', label: 'DeepSeek', models: 'نماذج النص الحالية', support: 'unsupported', note: 'التسجيل لا يُرسل إلى هذا المسار.' },
  { provider: 'nvidia', label: 'NVIDIA NIM', models: 'بحسب endpoint خاص يثبت دعم الصوت', support: 'unknown', note: 'يحتاج موديل صوتي معلناً بعقد متوافق.' },
  { provider: 'custom', label: 'مزود مخصص', models: 'اسم يحتوي audio أو omni أو Gemini/GPT Audio', support: 'unknown', note: 'لا يرسل الصوت إلا عند مطابقة صريحة لاسم موديل صوتي.' },
]

/** جلب قائمة الموديلات الحية من المزود عند توفّره (ليست كل المزودين يوفّرون واجهة). */
export async function fetchProviderModels(
  def: ProviderDef,
  apiKey: string,
  customBaseUrl?: string
): Promise<string[]> {
  try {
    if (def.modelsKind === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return []
      const data: any = await res.json()
      const list: string[] = (data.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
      return list.filter(Boolean)
    }
    if (def.modelsKind === 'anthropic') {
      const base = normalizeBaseUrl(def.baseUrl)
      const res = await fetch(`${base}/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', Accept: 'application/json' },
      })
      if (!res.ok) return []
      const data: any = await res.json()
      return (data.data ?? data.models ?? []).map((m: any) => String(m.id ?? m.name ?? '')).filter(Boolean)
    }
    if (def.modelsKind === 'openai' && def.id !== 'custom') {
      const base = normalizeBaseUrl(def.baseUrl)
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return []
      const data: any = await res.json()
      return (data.data ?? []).map((m: any) => String(m.id ?? '')).filter(Boolean)
    }
    if (def.id === 'custom' && customBaseUrl) {
      const base = normalizeBaseUrl(customBaseUrl)
      const res = await fetch(`${base}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      })
      if (!res.ok) return []
      const data: any = await res.json()
      return (data.data ?? []).map((m: any) => String(m.id ?? '')).filter(Boolean)
    }
  } catch {
    return []
  }
  return []
}

/** تأكد أن الرابط ينتهي بـ /v1 أو المسار الصحيح دون / في النهاية. */
export function normalizeBaseUrl(url: string): string {
  let u = (url || '').trim()
  if (!u) return ''
  if (u.endsWith('/')) u = u.slice(0, -1)
  return u
}

/** مصفاة أسماء الموديلات غير القابلة للاستخدام في الدردشة. */
export function filterChatModels(models: string[]): string[] {
  // الصوت/vision قد يكونان نمطي محادثة صالحين؛ لا نحجبهما من القائمة لمجرد الاسم.
  // نحجب فقط النماذج التي لا تمثل محادثة عادةً، ثم يطبق ModelProfile بوابة القدرة عند الإرسال.
  const excluded = /embed|rerank|image-generation|image-preview|whisper|tts|transcribe|moderation|search-preview|realtime/i
  return models.filter((m) => !excluded.test(m))
}

export { providerKey }