import type { ProviderDef } from './providers'
import { normalizeBaseUrl } from './providers'

export interface ToolCall {
  id: string
  name: string
  arguments: string
  /** الحقول الإضافية الواردة من المزوّد مع نداء الأداة (مثل thought_signature عند Gemini)
      والتي يجب إعادتها كما هي عند إعادة بثّ tool_calls في الجولات اللاحقة. */
  extra?: Record<string, any>
}

/** توليد معرف نداء أداة بصيغة تفرضها البوابة الموحّدة للمزوّدات:
    بالضبط 9 محارف من a-z/A-Z/0-9 — تُرفض أي صيغة أخرى (مثل call_xxx) بخطأ 400. */
export function makeToolCallId(): string {
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < 9; i++) out += pool[Math.floor(Math.random() * pool.length)]
  return out
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: Record<string, any>[]
}

export interface FunctionDef {
  name: string
  description: string
  parameters: Record<string, any>
}

export interface ChatResult {
  content: string | null
  toolCalls: ToolCall[]
  finishReason: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * تحويل نداء أداة إلى الصيغة السلكية المطلوبة عند إعادة بثّ tool_calls فيما بعد:
 * {id, type: "function", function: {name, arguments}} + الحقول الإضافية التي
 * أرسلها المزوّد حرفياً (thought_signature أو غيرها). البوابة الموحّدة التي تمرّ
 * عبراها كل المزوّدات ترفض بأخطاء 400 أي نداء أُعيد بناؤه مجرداً من هذه الحقول.
 */
export function toWireToolCall(call: ToolCall): Record<string, any> {
  const extra = call.extra ?? {}
  const { raw: _raw, ...otherExtra } = extra
  const raw = (extra.raw ?? {}) as Record<string, any>
  const name = call.name || raw.function?.name || ''
  const args =
    typeof call.arguments === 'string'
      ? call.arguments
      : call.arguments != null
      ? JSON.stringify(call.arguments)
      : typeof raw.function?.arguments === 'string'
      ? raw.function.arguments
      : '{}'
  // تُبنى الحقول المطلوبة (name/arguments) حتماً، ثم تُدمج الإضافات بعد تنقيتها
  // من الحقول البنيوية المتسربة — لا تُحذف المطلوبة أبداً مهما تسربت.
  const fn: Record<string, any> = {
    ...sanitizeWireFunction(otherExtra),
    name,
    arguments: args,
  }
  // تثبيت thought_signature عند مجيئه من المزوّد في موضعه الصريح (داخل function)
  const sig = otherExtra.thought_signature ?? raw.function?.thought_signature ?? raw.thought_signature
  if (sig !== undefined) fn.thought_signature = sig
  return { id: call.id ?? raw.id ?? makeToolCallId(), type: 'function', function: fn }
}

/**
 * تنقية كائن function أو حقل إضافي من الحقول البنيوية (index، id، type، function، raw)
 * التي قد تتسرب من كائن النداء الأصلي عند إعادة البث. تُحذف فقط هذه الحقول، بينما
 * تُحفظ name و arguments (المطلوبة للبوابة) و thought_signature (المطلوبة لبعض المزوّدات).
 * تُطبَّق في كل نقاط إعادة البث، بما فيها إعادة بناء النداءات من مخزن الجلسة حيث
 * قد تحمل بيانات قديمة متسخة.
 */
export function sanitizeWireFunction(fn: Record<string, any>): Record<string, any> {
  const LEAK_FIELDS = ['index', 'id', 'type', 'function', 'raw']
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(fn)) {
    if (LEAK_FIELDS.includes(k)) continue
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

export type LlmErrorKind = 'network' | 'timeout' | 'http' | 'parse' | 'unknown'

export class LlmError extends Error {
  kind: LlmErrorKind
  status?: number
  retryable: boolean
  constructor(kind: LlmErrorKind, message: string, status?: number, retryable?: boolean) {
    super(message)
    this.kind = kind
    this.status = status
    this.retryable = retryable ?? (kind === 'network' || kind === 'timeout' || (status !== undefined && (status === 429 || status >= 500)))
  }
}

export interface ChatOpts {
  provider: ProviderDef
  baseUrl?: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  functions?: FunctionDef[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** البث المباشر: عند تفعيله تُرَدّ الأجزاء الفورية عبر onDelta ثم يتجمع ChatResult الكامل. */
  onDelta?: (delta: { content: string; toolCalls: ToolCall[]; done?: boolean }) => void
}

/** بث النص فور صدوره من المزود — يقسم تيار JSON إلى أجزاء نصية تظهر live في الشاشة. */
export function splitSse(buf: string): { data: string }[] {
  const out: { data: string }[] = []
  for (const line of buf.split('\n')) {
    if (line.startsWith('data:')) out.push({ data: line.slice(5).trim() })
  }
  return out
}

/**
 * استدعاء المزود مع بث مباشر لدفعات النص/الأدوات، مع نفس منطق إعادة المحاولة
 * التصاعدية. يُرجع النتيجة الكاملة (جسم ChatResult) بعد اكتمال البث.
 */
async function postChatStream(opts: ChatOpts, signal: AbortSignal): Promise<ChatResult> {
  const base = normalizeBaseUrl(opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : opts.provider.baseUrl)
  if (!base) throw new LlmError('unknown', 'رابط المزود غير مكتمل — أضف الرابط من إعدادات المساعد')
  if (!opts.apiKey.trim()) throw new LlmError('unknown', 'لا يوجد مفتاح API — أضفه من إعدادات المساعد')
  if (!opts.model.trim()) throw new LlmError('unknown', 'لم يتم اختيار الموديل — اختر موديلاً من الإعدادات')

  const body: Record<string, any> = {
    model: opts.model,
    messages: opts.messages.map((m) => {
      const out: Record<string, any> = { role: m.role, content: m.content ?? null }
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id
      if (m.name) out.name = m.name
      if (m.tool_calls) out.tool_calls = m.tool_calls
      return out
    }),
    stream: true,
    stream_options: { include_usage: true },
  }
  if (opts.functions && opts.functions.length) {
    body.tools = opts.functions.map((f) => ({
      type: 'function',
      function: { name: f.name, description: f.description, parameters: f.parameters },
    }))
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens) body.max_tokens = opts.maxTokens

  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بالمزود')
    throw new LlmError('network', `خطأ في الاتصال بالمزود: ${e?.message ?? String(e)}`)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error?.message ?? j?.message ?? JSON.stringify(j).slice(0, 300)
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new LlmError('http', `المزود رفض الطلب (${res.status}): ${detail || 'بدون تفاصيل'}`, res.status)
  }

  if (!res.body) throw new LlmError('parse', 'المزود لم يرسل تيار استجابة')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let finishReason = 'stop'
  let usage: ChatResult['usage']
  const tcAcc: Record<string, { id: string; name: string; args: string; extra: Record<string, any> }> = {}

  const flushDelta = (done: boolean) => {
    const toolCalls = Object.keys(tcAcc).map((k) => ({
      id: tcAcc[k].id,
      name: tcAcc[k].name,
      arguments: tcAcc[k].args,
    }))
    opts.onDelta?.({ content: fullContent, toolCalls, done })
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      const events = splitSse(chunk)
      for (const ev of events) {
        if (!ev.data || ev.data === '[DONE]') continue
        let payload: any
        try {
          payload = JSON.parse(ev.data)
        } catch {
          continue
        }
        const choice = payload?.choices?.[0]
        if (!choice) {
          if (payload?.usage) usage = { prompt_tokens: payload.usage.prompt_tokens, completion_tokens: payload.usage.completion_tokens }
          continue
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
        const delta = choice.delta ?? {}
        if (typeof delta.content === 'string' && delta.content) {
          fullContent += delta.content
          flushDelta(false)
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = String(tc.index ?? 0)
            const acc = tcAcc[idx] ?? { id: '', name: '', args: '', extra: {} }
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name += tc.function.name
            if (typeof tc.function?.arguments === 'string') acc.args += tc.function.arguments
            // نحافظ على كائن النداء الأصلي كاملاً (thought_signature وغيرها) — تُعاد
            // الصيغة الحرفية عند إعادة بثّ tool_calls في الجولات اللاحقة.
            acc.extra.raw = tc
            if (tc.function && typeof tc.function === 'object') {
              for (const key of Object.keys(tc.function)) {
                if (key !== 'name' && key !== 'arguments' && key !== 'index') acc.extra[key] = tc.function[key]
              }
            }
            if (tc && typeof tc === 'object') {
              for (const key of Object.keys(tc)) {
                if (key !== 'index' && key !== 'id' && key !== 'type' && key !== 'function') acc.extra[key] = tc[key]
              }
            }
            tcAcc[idx] = acc
            opts.onDelta?.({
              content: fullContent,
              toolCalls: Object.keys(tcAcc).map((k) => ({
                id: tcAcc[k].id,
                name: tcAcc[k].name,
                arguments: tcAcc[k].args,
                extra: tcAcc[k].extra,
              })),
            })
          }
        }
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بالمزود أثناء البث')
    throw new LlmError('parse', `خطأ في قراءة تيار الاستجابة: ${e?.message ?? String(e)}`)
  }

  const toolCalls: ToolCall[] = Object.keys(tcAcc).map((k) => ({
    id: tcAcc[k].id || makeToolCallId(),
    name: tcAcc[k].name,
    arguments: tcAcc[k].args || '{}',
    extra: tcAcc[k].extra,
  }))
  flushDelta(true)
  return {
    content: fullContent || null,
    toolCalls,
    finishReason,
    usage,
  }
}

// المحاولات: أولى مباشرة + 4 إعادة بعد 3/5/10/30 ثانية ثم نتوقف نهائياً
const MAX_ATTEMPTS = 5
const DEFAULT_TIMEOUT_MS = 90000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function postChat(opts: ChatOpts, signal: AbortSignal): Promise<ChatResult> {
  const base = normalizeBaseUrl(opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : opts.provider.baseUrl)
  if (!base) throw new LlmError('unknown', 'رابط المزود غير مكتمل — أضف الرابط من إعدادات المساعد')
  if (!opts.apiKey.trim()) throw new LlmError('unknown', 'لا يوجد مفتاح API — أضفه من إعدادات المساعد')
  if (!opts.model.trim()) throw new LlmError('unknown', 'لم يتم اختيار الموديل — اختر موديلاً من الإعدادات')

  const body: Record<string, any> = {
    model: opts.model,
    messages: opts.messages.map((m) => {
      const out: Record<string, any> = { role: m.role, content: m.content ?? null }
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id
      if (m.name) out.name = m.name
      if (m.tool_calls) out.tool_calls = m.tool_calls
      return out
    }),
  }
  if (opts.functions && opts.functions.length) {
    body.tools = opts.functions.map((f) => ({
      type: 'function',
      function: { name: f.name, description: f.description, parameters: f.parameters },
    }))
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens) body.max_tokens = opts.maxTokens

  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بالمزود')
    throw new LlmError('network', `خطأ في الاتصال بالمزود: ${e?.message ?? String(e)}`)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error?.message ?? j?.message ?? JSON.stringify(j).slice(0, 300)
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new LlmError('http', `المزود رفض الطلب (${res.status}): ${detail || 'بدون تفاصيل'}`, res.status)
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new LlmError('parse', 'استجابة غير صالحة من المزود')
  }

  const choice = data?.choices?.[0]
  if (!choice) throw new LlmError('parse', 'استجابة فارغة من المزود')

const msg = choice.message ?? {}
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any) => {
    const extra: Record<string, any> = { raw: tc }
    if (tc && typeof tc === 'object') {
      for (const key of Object.keys(tc)) {
        if (key !== 'id' && key !== 'type' && key !== 'function' && key !== 'index') extra[key] = tc[key]
      }
    }
    if (tc?.function && typeof tc.function === 'object') {
      for (const key of Object.keys(tc.function)) {
        if (key !== 'name' && key !== 'arguments' && key !== 'index') extra[key] = tc.function[key]
      }
    }
    return {
      id: tc.id ?? makeToolCallId(),
      name: tc.function?.name ?? '',
      // بعض المزودين يرسل الوسائط ككائن وليس نص JSON — نطبّعه دائماً
      arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : tc.function?.arguments != null ? JSON.stringify(tc.function.arguments) : '{}',
      extra,
    }
  })

  return {
    content: typeof msg.content === 'string' ? msg.content : msg.content !== undefined && msg.content !== null ? JSON.stringify(msg.content) : null,
    toolCalls,
    finishReason: choice.finish_reason ?? 'stop',
    usage: data?.usage
      ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens }
      : undefined,
  }
}

/**
 * طلب دردشة من المزود مع إعادة محاولة تلقائية بفترات متباعدة (تأخير تصاعدي) عند
 * أخطاء الاتصال أو ضغط الطلبات (429) أو أخطاء الخادم (5xx) — دون إعادة المحاولة
 * للأخطاء الثابتة (مفتاح خاطئ، موديل غير موجود...).
 * externalSignal: إشارة إلغاء خارجية (زر "إيقاف") تقطع الطلب الجاري فوراً.
 */
export async function chatWithRetry(
  opts: ChatOpts,
  onRetry?: (attempt: number, delayMs: number, err: LlmError) => void,
  externalSignal?: AbortSignal
): Promise<ChatResult> {
  let lastErr: LlmError = new LlmError('unknown', 'فشل غير معروف')
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        const onAbort = () => controller.abort()
        externalSignal.addEventListener('abort', onAbort, { once: true })
        try {
          controller.signal.addEventListener('abort', () => externalSignal.removeEventListener('abort', onAbort), { once: true })
        } catch {}
      }
    }
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      let result: ChatResult
      if (opts.onDelta) {
        try {
          result = await postChatStream(opts, controller.signal)
        } catch (streamErr: any) {
          // بعض المزودات لا تدعم البث (لا تيار استجابة): تراجع تلقائي لطلب عادي
          // ونُسلّم النتيجة كاملة دفعة واحدة — المستخدم لا يرى فرقاً ولا يفقد الرد.
          if (controller.signal.aborted) throw streamErr
          result = await postChat(opts, controller.signal)
          opts.onDelta({ content: result.content ?? '', toolCalls: result.toolCalls, done: true })
        }
      } else {
        result = await postChat(opts, controller.signal)
      }
      clearTimeout(timer)
      return result
    } catch (e: any) {
      clearTimeout(timer)
      const err = e instanceof LlmError ? e : new LlmError('unknown', e?.message ?? String(e), undefined, false)
      lastErr = err
      if (externalSignal?.aborted) throw err
      if (attempt >= MAX_ATTEMPTS || !err.retryable) {
        throw err
      }
      // إعادة محاولة بجدول ثابت عند انقطاع/خطأ المزوّد: بعد 3 ثوانٍ، ثم 5، ثم 10، ثم 30، ثم نتوقف
      const RETRY_DELAYS_MS = [3000, 5000, 10000, 30000]
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 30000
      onRetry?.(attempt, delay, err)
      await sleep(delay)
    }
  }
  throw lastErr
}

export interface TestResult {
  ok: boolean
  latencyMs?: number
  model?: string
  message: string
}

/**
 * فحص اتصال المزود والموديل: يرسل طلب دردشة مصغّر ويتأكد من صحة المفتاح والموديل
 * (مع نفس منطق إعادة المحاولة التصاعدية لأخطاء الشبكة).
 */
export async function testConnection(
  opts: Pick<ChatOpts, 'provider' | 'baseUrl' | 'apiKey' | 'model'> & { timeoutMs?: number }
): Promise<TestResult> {
  const started = Date.now()
  try {
    const result = await chatWithRetry({
      provider: opts.provider,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      model: opts.model,
      messages: [
        { role: 'system', content: 'أنت مجرد أداة فحص. أجب حرفياً بكلمة: متصل' },
        { role: 'user', content: 'فحص اتصال' },
      ],
      maxTokens: 20,
      timeoutMs: opts.timeoutMs ?? 30000,
    })
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: opts.model,
      message: `الاتصال ناجح ✓ — الموديل ${opts.model} استجاب${result.content ? ` (${result.content.trim().slice(0, 40)})` : ''} في ${Date.now() - started} مللي ثانية`,
    }
  } catch (e: any) {
    const err = e instanceof LlmError ? e : new LlmError('unknown', e?.message ?? String(e))
    let hint = ''
    if (err.status === 401) hint = ' — مفتاح API غير صحيح أو منتهي الصلاحية'
    else if (err.status === 403) hint = ' — المفتاح لا يملك صلاحية الوصول لهذا المزود'
    else if (err.status === 404) hint = ' — الموديل غير موجود أو الرابط غير صحيح'
    else if (err.status === 429) hint = ' — تم تجاوز حد الطلبات، انتظر قليلاً'
    else if (err.kind === 'network' || err.kind === 'timeout') hint = ' — تأكد من اتصال الإنترنت ومن الرابط الصحيح'
    return {
      ok: false,
      message: `فشل الاتصال بعد ${((Date.now() - started) / 1000).toFixed(1)} ثانية: ${err.message}${hint}`,
    }
  }
}

export function parseToolArgs(raw: any): Record<string, any> {
  // بعض المزودين يرسل الوسائط ككائن جاهز وليس نص JSON
  if (raw && typeof raw === 'object') return raw
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
