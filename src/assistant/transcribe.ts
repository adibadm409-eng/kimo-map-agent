// تحويل التسجيل الصوتي إلى نص قبل إرساله للنموذج، وفق المسارات الموثّقة:
// جيميني (نقطة generateContent الأصلية التي تقبل m4a/mp3/wav)، مسترال
// (/v1/audio/transcriptions مع voxtral-mini-latest حسب وثائقها)، وOpenAI
// (whisper). هذا يبقي الصوت يعمل دائماً (m4a يسجّله الجهاز افتراضياً) دون
// الاعتماد على input_audio في chat الذي يرفضه بعض المزوّدين بخطأ 400.

const MIME_BY_FORMAT: Record<string, string> = {
  m4a: 'audio/m4a',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  webm: 'audio/webm',
}

const EXT_BY_FORMAT: Record<string, string> = {
  m4a: 'm4a',
  wav: 'wav',
  mp3: 'mp3',
  webm: 'webm',
}

export class TranscribeError extends Error {
  /** true إذا كان المزوّد يدعم التحويل لكن الطلب فشل (شبكة/صيغة)، false إن لم يدعمه أصلاً. */
  supported: boolean
  constructor(message: string, supported: boolean) {
    super(message)
    this.name = 'TranscribeError'
    this.supported = supported
  }
}

export interface TranscribeInput {
  providerId: string
  baseUrl: string
  apiKey: string
  model: string
  audioUri: string
  audioBase64: string
  format: 'm4a' | 'wav' | 'mp3' | 'webm'
}

function normalizeBase(url: string): string {
  const u = (url || '').trim()
  return u.endsWith('/') ? u.slice(0, -1) : u
}

function pickGeminiModel(model: string): string {
  const m = (model || '').trim()
  if (/^gemini[-\w.]*$/i.test(m)) return m
  return 'gemini-2.5-flash'
}

async function transcribeGemini(apiKey: string, model: string, base64: string, mime: string): Promise<string> {
  const name = pickGeminiModel(model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: mime, data: base64 } },
          {
            text: 'حوّل هذا التسجيل الصوتي إلى نص عربي مكتوب حرفياً كما وُسمع، دون أي إضافة أو تعليق أو تصحيح. أعد النص فقط.',
          },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    throw new TranscribeError(`تعذر الاتصال بخدمة تحويل الصوت: ${e?.message ?? String(e)}`, true)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new TranscribeError(`فشل تحويل الصوت عبر جيميني (${res.status}): ${detail.slice(0, 200)}`, true)
  }
  const data = await res.json().catch(() => null)
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = (Array.isArray(parts) ? parts.map((p: any) => p?.text ?? '').join('') : '').trim()
  if (!text) throw new TranscribeError('لم يُستخرج نص من التسجيل الصوتي.', true)
  return text
}

async function transcribeViaFileEndpoint(
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  transcriptionModel: string,
  audioUri: string,
  mime: string,
  format: string,
): Promise<string> {
  const url = `${normalizeBase(baseUrl)}/${endpoint}`
  const form = new FormData()
  form.append('model', transcriptionModel)
  form.append('file', { uri: audioUri, name: `voice.${EXT_BY_FORMAT[format] ?? 'm4a'}`, type: mime } as any)
  form.append('language', 'ar')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch (e: any) {
    throw new TranscribeError(`تعذر الاتصال بخدمة تحويل الصوت: ${e?.message ?? String(e)}`, true)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new TranscribeError(`فشل تحويل الصوت (${res.status}): ${detail.slice(0, 200)}`, true)
  }
  const data = await res.json().catch(() => null)
  const text = (data?.text ?? '').toString().trim()
  if (!text) throw new TranscribeError('لم يُستخرج نص من التسجيل الصوتي.', true)
  return text
}

export async function transcribeAudio(input: TranscribeInput): Promise<string> {
  const { providerId, baseUrl, apiKey, model, audioUri, audioBase64, format } = input
  const mime = MIME_BY_FORMAT[format] ?? 'audio/m4a'
  if (providerId === 'gemini') return transcribeGemini(apiKey, model, audioBase64, mime)
  if (providerId === 'mistral') return transcribeViaFileEndpoint(baseUrl, apiKey, 'audio/transcriptions', 'voxtral-small-latest', audioUri, mime, format)
  if (providerId === 'openai') return transcribeViaFileEndpoint(baseUrl, apiKey, 'audio/transcriptions', 'whisper-1', audioUri, mime, format)
  throw new TranscribeError('المزوّد الحالي لا يدعم تحويل الصوت إلى نص تلقائياً.', false)
}

export function audioMimeFor(format: string): string {
  return MIME_BY_FORMAT[format] ?? 'audio/m4a'
}
