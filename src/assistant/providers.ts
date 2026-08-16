export type ProviderId =
  | 'gemini'
  | 'mistral'
  | 'deepseek'
  | 'alibaba'
  | 'openai'
  | 'openrouter'
  | 'nvidia'
  | 'custom'

export interface ProviderCapabilities {
  supportsTools: boolean
  supportsStreaming: boolean
  supportsStreamOptions: boolean
  maxTokensField: 'max_tokens' | 'max_completion_tokens'
}

export interface ProviderDef {
  id: ProviderId
  name: string
  color: string
  baseUrl: string
  defaultModels: string[]
  modelsKind: 'openai' | 'gemini' | 'none'
  hint?: string
  note?: string
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

function providerKey(id: ProviderId, customId?: string): string {
  return id === 'custom' && customId ? `custom:${customId}` : id
}

export function providerLabel(p: ProviderDef | undefined): string {
  return p?.name ?? 'مزود غير محدد'
}

/** ملف قدرات محافظ: لا نرسل خياراً لا يثبت أن المزود يدعمه. */
export function providerCapabilities(def: ProviderDef, model = ''): ProviderCapabilities {
  const normalizedModel = model.toLowerCase()
  const newerOpenAiStyle = def.id === 'openai' && /^(gpt-5|o[1-9])/.test(normalizedModel)
  return {
    supportsTools: true,
    supportsStreaming: true,
    // stream_options ليس جزءاً مضموناً من كل بوابات OpenAI-compatible، خصوصاً custom وGemini.
    supportsStreamOptions: def.id !== 'custom' && def.id !== 'gemini' && def.id !== 'alibaba',
    maxTokensField: newerOpenAiStyle ? 'max_completion_tokens' : 'max_tokens',
  }
}

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
  const excluded = /embed|rerank|image|whisper|audio|speech|tts|transcribe|moderation|search-preview|realtime/i
  return models.filter((m) => !excluded.test(m))
}

export { providerKey }