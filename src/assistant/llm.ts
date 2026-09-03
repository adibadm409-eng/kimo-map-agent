import type { ProviderDef } from './providers'
import { normalizeBaseUrl } from './providers'
import { normalizeProviderToolName, providerRequestIssues, providerWireFamily, providerWireRequestExtras, serializeProviderMessages } from './providerWire'
import { buildAnthropicRequest, parseAnthropicResponse } from './anthropicWire'
import { profileAllowsParam, resolveModelProfile } from './modelProfiles'
import { parseToolArgumentsStrict } from './toolValidation'

export interface ToolCall {
  id: string
  name: string
  arguments: string
  /** الحقول الإضافية الواردة من المزوّد مع نداء الأداة (مثل thought_signature عند Gemini)
      والتي يجب إعادتها كما هي عند إعادة بثّ tool_calls في الجولات اللاحقة. */
  extra?: Record<string, any>
}

/** توليد معرف محلي عند غياب معرف المزود فقط؛ لا يُستخدم لإعادة ترميز معرف وارد. */
export function makeToolCallId(): string {
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < 9; i++) out += pool[Math.floor(Math.random() * pool.length)]
  return out
}

/** معرف ثابت يحافظ على نفس قيمة المزود بين assistant وtool. */
export function normalizeToolCallId(raw: unknown): string {
  // معرف النداء جزء من عقد المزود: يجب أن يعود في رسالة tool كما ورد من
  // assistant. لا نعيد ترميزه إلى طول أو أبجدية خاصة بنا، لأن OpenAI وGemini
  // قد يستخدمان call_* أو UUID أو معرفات أخرى صالحة.
  const value = String(raw ?? '').trim()
  return value || makeToolCallId()
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatContentPart[] | null
  tool_call_id?: string
  name?: string
  tool_calls?: Record<string, any>[]
  tool_error?: boolean
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
export function toWireToolCall(call: ToolCall, options: { includeProviderMetadata?: boolean } = {}): Record<string, any> {
  const extra = call.extra ?? {}
  const raw = (extra.raw ?? {}) as Record<string, any>
  const name = normalizeProviderToolName(call.name || raw.function?.name || '')
  const args =
    typeof call.arguments === 'string'
      ? call.arguments
      : call.arguments != null
      ? JSON.stringify(call.arguments)
      : typeof raw.function?.arguments === 'string'
      ? raw.function.arguments
      : '{}'

  // الاسم والوسائط فقط داخل function. لا نضع thought_signature هنا: Gemini
  // OpenAI-compatible يطلبه داخل extra_content.google على مستوى tool_call.
  const wire: Record<string, any> = {
    id: normalizeToolCallId(call.id ?? raw.id),
    type: 'function',
    function: { name, arguments: args },
  }

  const includeProviderMetadata = options.includeProviderMetadata !== false
  const rawExtraContent = extra.extra_content ?? raw.extra_content
  if (includeProviderMetadata && rawExtraContent !== undefined) wire.extra_content = rawExtraContent

  // دعم السجلات القديمة التي خزّنت التوقيع مباشرة؛ نعيده إلى موضعه السلكي
  // الصحيح فقط عندما يثبت محول الوجهة أن هذا metadata مسموح به.
  const sig = extra.thought_signature ?? raw.function?.thought_signature ?? raw.thought_signature
  if (includeProviderMetadata && sig !== undefined && wire.extra_content?.google?.thought_signature === undefined) {
    wire.extra_content = {
      ...(wire.extra_content ?? {}),
      google: { ...(wire.extra_content?.google ?? {}), thought_signature: sig },
    }
  }
  return wire
}

/**
 * تنقية كائن function أو حقل إضافي من الحقول البنيوية (index، id، type، function، raw)
 * التي قد تتسرب من كائن النداء الأصلي عند إعادة البث. تُحذف فقط هذه الحقول، بينما
 * تُحفظ name و arguments (المطلوبة للبوابة) و thought_signature (المطلوبة لبعض المزوّدات).
 * تُطبَّق في كل نقاط إعادة البث، بما فيها إعادة بناء النداءات من مخزن الجلسة حيث
 * قد تحمل بيانات قديمة متسخة.
 */
export function sanitizeWireFunction(fn: Record<string, any>): Record<string, any> {
  const LEAK_FIELDS = ['index', 'id', 'type', 'function', 'raw', 'extra_content', 'thought_signature']
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(fn)) {
    if (LEAK_FIELDS.includes(k)) continue
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

export type LlmErrorKind = 'network' | 'timeout' | 'http' | 'invalid_request' | 'auth' | 'rate_limit' | 'server' | 'parse' | 'unknown'

/**
 * واجهة توافق واحدة داخل التطبيق، مفصولة عن المحولات السلكية الخارجية.
 * المحول الفعلي يختار معياراً وفق المزود والموديل قبل بناء الطلب.
 */
export function serializeChatMessages(provider: ProviderDef, model: string, messages: ChatMessage[]): Record<string, any>[] {
  return serializeProviderMessages(provider, model, messages)
}

export function assertChatRequest(opts: ChatOpts): void {
  const profile = resolveModelProfile(opts.provider, opts.model)
  const issues = providerRequestIssues(opts.provider, opts.model, opts.messages, !!opts.functions?.length, {
    supportsChat: profile.supports.chat,
    supportsTools: profile.supports.tools,
    supportsParallelTools: profile.supports.parallelTools,
    supportsVision: profile.supports.vision,
    supportsInputAudio: profile.supports.inputAudio,
  })
  const profileIssues: { kind: 'invalid_request'; message: string }[] = []
  if (!profile.supports.chat) profileIssues.push({ kind: 'invalid_request', message: `الموديل ${opts.model} لا يثبت دعماً للمحادثة.` })
  if (opts.functions?.length && !profile.supports.tools) profileIssues.push({ kind: 'invalid_request', message: `الموديل ${opts.model} لا يثبت دعماً للأدوات وفق ملف قدراته (${profile.source}/${profile.confidence}).` })
  if (!profile.supports.parallelTools && opts.messages.some((message) => Array.isArray(message.tool_calls) && message.tool_calls.length > 1)) {
    profileIssues.push({ kind: 'invalid_request', message: `الموديل ${opts.model} لا يثبت دعماً للتوازي؛ يجب إرسال نداء أداة واحد في كل جولة.` })
  }
  for (const message of opts.messages) {
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const rawArguments = call?.function?.arguments ?? call?.arguments
        const parsed = parseToolArgumentsStrict(rawArguments)
        if (!parsed.ok) profileIssues.push({ kind: 'invalid_request', message: `وسائط أداة غير صالحة في التاريخ قبل الشبكة: ${parsed.message}` })
      }
    }
    if (!Array.isArray(message.content)) continue
    if (message.content.some((part: any) => part?.type === 'input_audio') && !profile.supports.inputAudio) {
      profileIssues.push({ kind: 'invalid_request', message: `الموديل ${opts.model} لا يثبت دعماً للصوت.` })
    }
    if (message.content.some((part: any) => part?.type === 'image_url') && !profile.supports.vision) {
      profileIssues.push({ kind: 'invalid_request', message: `الموديل ${opts.model} لا يثبت دعماً للصور.` })
    }
  }
  const issue = profileIssues[0] ?? issues[0]
  if (issue) throw new LlmError(issue.kind, `${issue.message} أوقف كيمو الطلب قبل إرسال صيغة غير متوافقة.`)
}

export class LlmError extends Error {
  kind: LlmErrorKind
  status?: number
  retryable: boolean
  partialStream: boolean
  retryAfterMs?: number
  constructor(kind: LlmErrorKind, message: string, status?: number, retryable?: boolean, partialStream = false, retryAfterMs?: number) {
    super(message)
    this.kind = kind
    this.status = status
    this.retryable = retryable ?? (kind === 'network' || kind === 'timeout' || kind === 'rate_limit' || kind === 'server')
    this.partialStream = partialStream
    this.retryAfterMs = retryAfterMs
  }
}

function classifyHttpStatus(status: number): LlmErrorKind {
  if (status === 400 || status === 404 || status === 409 || status === 422) return 'invalid_request'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'server'
  return 'http'
}

function retryAfterMs(res: Response): number | undefined {
  const value = res.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.min(120000, Math.max(0, Math.round(seconds * 1000)))
  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.min(120000, Math.max(0, date - Date.now()))
  return undefined
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

/** يبني payload النهائي مرة واحدة لجميع مسارات النقل، ويطبّق محول المزود قبل الشبكة. */
export function buildChatRequestBody(opts: ChatOpts, stream = false): Record<string, any> {
  assertChatRequest(opts)
  const family = providerWireFamily(opts.provider, opts.model)
  if (family === 'anthropic-messages') {
    return buildAnthropicRequest({
      model: opts.model,
      messages: opts.messages,
      functions: opts.functions,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      stream,
    })
  }
  const profile = resolveModelProfile(opts.provider, opts.model)
  const body: Record<string, any> = {
    model: opts.model,
    messages: serializeChatMessages(opts.provider, opts.model, opts.messages),
  }
  if (stream) {
    body.stream = profile.supports.streaming
    if (profileAllowsParam(profile, 'stream_options')) body.stream_options = { include_usage: true }
  }
  Object.assign(body, providerWireRequestExtras(opts.provider, opts.model, !!opts.functions?.length))
  if (opts.functions?.length && profile.supports.tools) {
    body.tools = opts.functions.map((f) => ({
      type: 'function',
      function: { name: f.name, description: f.description, parameters: f.parameters },
    }))
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens) {
    if (profile.maxTokensField !== 'unknown' && profileAllowsParam(profile, profile.maxTokensField)) body[profile.maxTokensField] = opts.maxTokens
    else body.max_tokens = opts.maxTokens
  }
  return body
}

/**
 * تحليل SSE مع الاحتفاظ بالجزء غير المكتمل بين قراءات الشبكة. بعض المزودين
 * يقسمون JSON داخل data بين chunks؛ لذلك لا يجوز محاولة JSON.parse قبل وصول
 * فاصل الحدث الفارغ (أو نهاية التيار).
 */
export function parseSseBuffer(buf: string, final = false): { events: { data: string }[]; rest: string } {
  const normalized = String(buf ?? '').replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  let rest = blocks.pop() ?? ''
  if (final && rest.trim()) {
    blocks.push(rest)
    rest = ''
  }
  const events = blocks.flatMap((block) => {
    const dataLines = block.split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    return dataLines.length ? [{ data: dataLines.join('\n') }] : []
  })
  return { events, rest }
}

/** تحليل نص SSE مكتمل، مع إبقاء هذه الدالة للتوافق مع أدوات الاختبار والمزودات غير المتدفقة. */
export function splitSse(buf: string): { data: string }[] {
  return parseSseBuffer(buf, true).events
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }
}

async function readProviderError(res: Response): Promise<string> {
  try {
    const payload = await res.json()
    return payload?.error?.message ?? payload?.message ?? JSON.stringify(payload).slice(0, 500)
  } catch {
    return await res.text().catch(() => '')
  }
}

async function postAnthropic(opts: ChatOpts, signal: AbortSignal): Promise<ChatResult> {
  const base = normalizeBaseUrl(opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : opts.provider.baseUrl)
  if (!base) throw new LlmError('unknown', 'رابط Anthropic غير مكتمل — أضفه من إعدادات المساعد')
  if (!opts.apiKey.trim()) throw new LlmError('unknown', 'لا يوجد مفتاح Anthropic API — أضفه من إعدادات المساعد')
  if (!opts.model.trim()) throw new LlmError('unknown', 'لم يتم اختيار موديل Anthropic — اختره من الإعدادات')
  const body = buildChatRequestBody(opts, false)
  let res: Response
  try {
    res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: anthropicHeaders(opts.apiKey),
      body: JSON.stringify(body),
      signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بـAnthropic')
    throw new LlmError('network', `خطأ في الاتصال بـAnthropic: ${e?.message ?? String(e)}`)
  }
  if (!res.ok) {
    const detail = await readProviderError(res)
    throw new LlmError(classifyHttpStatus(res.status), `Anthropic رفض الطلب (${res.status}): ${detail || 'بدون تفاصيل'}`, res.status, undefined, false, retryAfterMs(res))
  }
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new LlmError('parse', 'استجابة Anthropic غير صالحة')
  }
  try {
    return parseAnthropicResponse(data)
  } catch (e: any) {
    throw new LlmError('parse', `استجابة Anthropic لا تطابق عقد tool_use: ${e?.message ?? String(e)}`)
  }
}

async function postAnthropicStream(opts: ChatOpts, signal: AbortSignal): Promise<ChatResult> {
  const base = normalizeBaseUrl(opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : opts.provider.baseUrl)
  if (!base) throw new LlmError('unknown', 'رابط Anthropic غير مكتمل — أضفه من إعدادات المساعد')
  if (!opts.apiKey.trim()) throw new LlmError('unknown', 'لا يوجد مفتاح Anthropic API — أضفه من إعدادات المساعد')
  if (!opts.model.trim()) throw new LlmError('unknown', 'لم يتم اختيار موديل Anthropic — اختره من الإعدادات')
  const body = buildChatRequestBody(opts, true)
  let res: Response
  try {
    res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: anthropicHeaders(opts.apiKey),
      body: JSON.stringify(body),
      signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بـAnthropic أثناء البث')
    throw new LlmError('network', `خطأ في الاتصال بـAnthropic أثناء البث: ${e?.message ?? String(e)}`)
  }
  if (!res.ok) {
    const detail = await readProviderError(res)
    throw new LlmError(classifyHttpStatus(res.status), `Anthropic رفض البث (${res.status}): ${detail || 'بدون تفاصيل'}`, res.status, undefined, false, retryAfterMs(res))
  }
  if (!res.body) throw new LlmError('parse', 'Anthropic لم يرسل تيار استجابة')
  if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')) {
    throw new LlmError('parse', 'Anthropic أعلن streaming لكنه أعاد استجابة غير متدفقة')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let finishReason = 'stop'
  let sawPayload = false
  let malformedEvents = 0
  const calls: Record<string, { id: string; name: string; args: string }> = {}
  let started = false
  const emitCalls = () => Object.values(calls).map((call) => ({ id: call.id, name: call.name, arguments: call.args || '{}', extra: { raw: call } }))
  const consume = (events: { data: string }[]) => {
    for (const event of events) {
      if (!event.data || event.data === '[DONE]') continue
      let payload: any
      try {
        payload = JSON.parse(event.data)
        sawPayload = true
      } catch {
        malformedEvents++
        continue
      }
      if (payload.type === 'content_block_start') {
        const block = payload.content_block
        if (block?.type === 'tool_use') {
          started = true
          calls[String(payload.index ?? Object.keys(calls).length)] = { id: String(block.id ?? ''), name: String(block.name ?? ''), args: '' }
        }
      } else if (payload.type === 'content_block_delta') {
        const delta = payload.delta ?? {}
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          content += delta.text
          started = true
          opts.onDelta?.({ content, toolCalls: emitCalls() })
        } else if (delta.type === 'input_json_delta') {
          const key = String(payload.index ?? Object.keys(calls).length - 1)
          const call = calls[key]
          if (call) {
            call.args += String(delta.partial_json ?? '')
            started = true
            opts.onDelta?.({ content, toolCalls: emitCalls() })
          }
        }
      } else if (payload.type === 'message_delta') {
        finishReason = String(payload.delta?.stop_reason ?? finishReason)
        if (payload.usage) opts.onDelta?.({ content, toolCalls: emitCalls() })
      }
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseBuffer(buffer)
      buffer = parsed.rest
      consume(parsed.events)
    }
    buffer += decoder.decode()
    consume(parseSseBuffer(buffer, true).events)
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بـAnthropic أثناء البث', undefined, true, started)
    if (started) throw new LlmError('network', `انقطع تيار Anthropic بعد بدء الاستجابة: ${e?.message ?? String(e)}`, undefined, true, true)
    throw new LlmError('parse', `خطأ في قراءة تيار Anthropic: ${e?.message ?? String(e)}`)
  }
  const partialStream = started || content.length > 0 || Object.keys(calls).length > 0
  if (!sawPayload) throw new LlmError('parse', 'تيار Anthropic انتهى بلا أحداث JSON صالحة', undefined, false, partialStream)
  if (malformedEvents > 0) throw new LlmError('parse', `تيار Anthropic احتوى ${malformedEvents} حدثاً غير صالح`, undefined, false, partialStream)
  const toolCalls = emitCalls().map((call) => ({ ...call, arguments: call.arguments || '{}' }))
  opts.onDelta?.({ content, toolCalls, done: true })
  return { content: content || null, toolCalls, finishReason }
}

/**
 * استدعاء المزود مع بث مباشر لدفعات النص/الأدوات، مع نفس منطق إعادة المحاولة
 * التصاعدية. يُرجع النتيجة الكاملة (جسم ChatResult) بعد اكتمال البث.
 */
async function postChatStream(opts: ChatOpts, signal: AbortSignal): Promise<ChatResult> {
  assertChatRequest(opts)
  if (providerWireFamily(opts.provider, opts.model) === 'anthropic-messages') return postAnthropicStream(opts, signal)
  const base = normalizeBaseUrl(opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : opts.provider.baseUrl)
  if (!base) throw new LlmError('unknown', 'رابط المزود غير مكتمل — أضف الرابط من إعدادات المساعد')
  if (!opts.apiKey.trim()) throw new LlmError('unknown', 'لا يوجد مفتاح API — أضفه من إعدادات المساعد')
  if (!opts.model.trim()) throw new LlmError('unknown', 'لم يتم اختيار الموديل — اختر موديلاً من الإعدادات')

  const body = buildChatRequestBody(opts, true)

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
    throw new LlmError(classifyHttpStatus(res.status), `المزود رفض الطلب (${res.status}): ${detail || 'بدون تفاصيل'}`, res.status, undefined, false, retryAfterMs(res))
  }

  if (!res.body) throw new LlmError('parse', 'المزود لم يرسل تيار استجابة')
  if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')) {
    throw new LlmError('parse', 'المزود أعلن streaming لكنه أعاد استجابة غير متدفقة')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let finishReason = 'stop'
  let usage: ChatResult['usage']
  let sawPayload = false
  let malformedEvents = 0
  const tcAcc: Record<string, { id: string; name: string; args: string; extra: Record<string, any> }> = {}

  const flushDelta = (done: boolean) => {
    const toolCalls = Object.keys(tcAcc).map((k) => ({
      id: tcAcc[k].id,
      name: tcAcc[k].name,
      arguments: tcAcc[k].args,
      extra: tcAcc[k].extra,
    }))
    opts.onDelta?.({ content: fullContent, toolCalls, done })
  }

  let sseBuffer = ''
  const consumeEvents = (events: { data: string }[]) => {
    for (const ev of events) {
        if (!ev.data || ev.data === '[DONE]') continue
        let payload: any
        try {
          payload = JSON.parse(ev.data)
          sawPayload = true
        } catch {
          malformedEvents++
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
            if (tc.function?.name && !acc.name) acc.name = normalizeProviderToolName(tc.function.name)
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

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const parsed = parseSseBuffer(sseBuffer)
      sseBuffer = parsed.rest
      consumeEvents(parsed.events)
    }
    sseBuffer += decoder.decode()
    consumeEvents(parseSseBuffer(sseBuffer, true).events)
  } catch (e: any) {
    const partialStream = Object.keys(tcAcc).length > 0 || fullContent.length > 0
    if (e?.name === 'AbortError') throw new LlmError('timeout', 'انتهت مهلة الاتصال بالمزود أثناء البث', undefined, true, partialStream)
    throw new LlmError('network', `انقطع تيار الاستجابة: ${e?.message ?? String(e)}`, undefined, true, partialStream)
  }

  const partialStream = Object.keys(tcAcc).length > 0 || fullContent.length > 0
  if (!sawPayload) throw new LlmError('parse', 'تيار المزود انتهى بلا أحداث JSON صالحة', undefined, false, partialStream)
  if (malformedEvents > 0) throw new LlmError('parse', `تيار المزود احتوى ${malformedEvents} حدثاً غير صالح`, undefined, false, partialStream)

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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function postChat(opts: ChatOpts, signal: AbortSignal): Promise<ChatResult> {
  assertChatRequest(opts)
  if (providerWireFamily(opts.provider, opts.model) === 'anthropic-messages') return postAnthropic(opts, signal)
  const base = normalizeBaseUrl(opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : opts.provider.baseUrl)
  if (!base) throw new LlmError('unknown', 'رابط المزود غير مكتمل — أضف الرابط من إعدادات المساعد')
  if (!opts.apiKey.trim()) throw new LlmError('unknown', 'لا يوجد مفتاح API — أضفه من إعدادات المساعد')
  if (!opts.model.trim()) throw new LlmError('unknown', 'لم يتم اختيار الموديل — اختر موديلاً من الإعدادات')

  const body = buildChatRequestBody(opts, false)

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
    throw new LlmError(classifyHttpStatus(res.status), `المزود رفض الطلب (${res.status}): ${detail || 'بدون تفاصيل'}`, res.status, undefined, false, retryAfterMs(res))
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
      id: normalizeToolCallId(tc.id),
      name: normalizeProviderToolName(tc.function?.name ?? ''),
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
      if (opts.onDelta && resolveModelProfile(opts.provider, opts.model).supports.streaming) {
        try {
          result = await postChatStream(opts, controller.signal)
        } catch (streamErr: any) {
          // بعض البوابات قد تعلن البث ثم تعيد استجابة غير متدفقة؛ نعود لطلب عادي مرة واحدة.
          if (controller.signal.aborted || streamErr?.kind !== 'parse' || streamErr?.partialStream) throw streamErr
          result = await postChat(opts, controller.signal)
          opts.onDelta({ content: result.content ?? '', toolCalls: result.toolCalls, done: true })
        }
      } else {
        result = await postChat(opts, controller.signal)
        if (opts.onDelta) opts.onDelta({ content: result.content ?? '', toolCalls: result.toolCalls, done: true })
      }
      clearTimeout(timer)
      return result
    } catch (e: any) {
      clearTimeout(timer)
      const err = e instanceof LlmError ? e : new LlmError('unknown', e?.message ?? String(e), undefined, false)
      lastErr = err
      if (externalSignal?.aborted) throw err
      // بعد بدء stream لا نعيد الطلب؛ قد يكون المزود نفذ الجولة وأرسل tool call
      // بالفعل، وإعادة الإرسال ستنشئ نتيجة مكررة أو تاريخاً غير قابل للربط.
      if (err.partialStream) throw err
      if (attempt >= MAX_ATTEMPTS || !err.retryable) {
        throw err
      }
      // إعادة محاولة بجدول ثابت عند انقطاع/خطأ المزوّد: بعد 3 ثوانٍ، ثم 5، ثم 10، ثم 30، ثم نتوقف
      const RETRY_DELAYS_MS = [3000, 5000, 10000, 30000]
      const delay = err.retryAfterMs ?? (RETRY_DELAYS_MS[attempt - 1] ?? 30000)
      onRetry?.(attempt, delay, err)
      await sleep(delay, externalSignal)
      if (externalSignal?.aborted) throw err
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
