import * as FileSystem from 'expo-file-system'
import { getSettings, activeConfig } from './store'
import { chatWithRetry } from './llm'
import { resolveModelProfile } from './modelProfiles'
import { defaultProvider, PROVIDERS, type ProviderDef, type ProviderId } from './providers'

const VISION_EXTRACTION_PROMPT = `أنت محلل بيانات عقارية دقيق ومحترف. مهمتك استخراج البيانات من الصورة المرفقة بدقة تامة.

قواعد صارمة يجب اتباعها:
1. استخرج فقط البيانات التي تظهر بوضوح في الصورة — لا تخترع أو تفترض أي بيانات.
2. إذا كان هناك نص غير واضح أو غير مقروء، اذكر "غير واضح" بدلاً من التخمين.
3. إذا كانت الصورة لا تحتوي على بيانات عقارية واضحة، أخبر المستخدم بذلك.
4. رتب البيانات المستخرجة في تنسيق واضح ومStructured.
5. لا تضيف معلومات غير موجودة في الصورة حتى لو كانت منطقية.
6. إذا كان هناك أكثر من عقار في الصورة، فصل بين بيانات كل عقار.
7. إذا كان هناك أرقام أو أسعار، اكتبها كما تظهر بالضبط في الصورة.

البيانات المطلوب استخراجها إن وُجدت:
- اسم العقار أو وصفه
- النوع (شقة، فيلا، أرض، إلخ)
- السعر (إن وُجد)
- المساحة (إن وُجدت)
- العنوان أو الموقع (إن وُجد)
- حالة العقار (للبيع، مؤجر، إلخ)
- معلومات التواصل (اسم المالك، رقم الهاتف) إن وُجدت
- أي معلومات أخرى تظهر بوضوح في الصورة

أعد النتيجة بالتنسيق التالي:
## البيانات المستخرجة من الصورة
[البيانات هنا]

## ملاحظات
[أي ملاحظات حول جودة الصورة أو البيانات غير الواضحة]`

const VISION_FALLBACK_PROMPT = `أنت مساعد ذكي. أرسل لك صورة من المستخدم لتحليلها. حلل الصورة واستخرج أي بيانات تراها فيها بدقة. إذا كانت الصورة تحتوي على معلومات عقارية، استخرجها. إذا لم تكن الصورة واضحة أو لا تحتوي على بيانات مفيدة، أخبر المستخدم بذلك. لا تختلق أو تفترض أي بيانات غير موجودة في الصورة.`

interface VisionResult {
  success: boolean
  content: string
  usedVisionModel: boolean
  error?: string
}

function providerDefFor(visionKey: string, customProviders: any[]): ProviderDef {
  if (visionKey.startsWith('custom:')) {
    const id = visionKey.slice('custom:'.length)
    const c = customProviders.find((x: any) => x.id === id)
    return c
      ? { id: 'custom', name: c.name, color: '#F59E0B', baseUrl: c.baseUrl, defaultModels: c.models, modelsKind: 'openai', hint: `المزود المخصص ${c.name}` }
      : defaultProvider('custom')
  }
  return defaultProvider(visionKey as ProviderId)
}

async function imageUriToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg'
  const mimeType = ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : ext === 'heic' || ext === 'heif' ? 'image/heic'
    : 'image/jpeg'
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  return { base64, mimeType }
}

async function sendToVisionModel(
  imageUri: string,
  prompt: string,
  settings: any,
): Promise<VisionResult> {
  const visionKey = settings.visionProvider
  const visionModel = settings.visionModel
  if (!visionKey || !visionModel) {
    return { success: false, content: '', usedVisionModel: false, error: 'no_vision_model' }
  }

  const def = providerDefFor(visionKey, settings.customProviders)
  const apiKey = visionKey.startsWith('custom:')
    ? settings.customProviders.find((c: any) => c.id === visionKey.slice(7))?.apiKey ?? ''
    : settings.keys[visionKey] ?? ''

  if (!apiKey) {
    return { success: false, content: '', usedVisionModel: false, error: 'no_api_key' }
  }

  const profile = resolveModelProfile(def, visionModel)
  if (!profile.supports.vision) {
    return { success: false, content: '', usedVisionModel: false, error: 'model_no_vision' }
  }

  try {
    const { base64, mimeType } = await imageUriToBase64(imageUri)
    const dataUrl = `data:${mimeType};base64,${base64}`

    const messages = [
      { role: 'user' as const, content: [
        { type: 'text' as const, text: prompt },
        { type: 'image_url' as const, image_url: { url: dataUrl } },
      ]},
    ]

    const result = await chatWithRetry({
      provider: def,
      baseUrl: def.baseUrl,
      apiKey,
      model: visionModel,
      messages,
      maxTokens: 4096,
    })

    return { success: true, content: result.content || '', usedVisionModel: true }
  } catch (e: any) {
    return { success: false, content: '', usedVisionModel: true, error: e?.message ?? 'vision_failed' }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function analyzeImageWithVision(
  imageUri: string,
  userRequest: string,
): Promise<VisionResult> {
  const settings = await getSettings().catch(() => null)
  if (!settings) {
    return { success: false, content: '', usedVisionModel: false, error: 'no_settings' }
  }

  const isDataExtraction = /استخراج|استخرج|بيانات|عقار|سعر|مساحة|عنوان|معلومات|أضف.*للتطبيق|أدخل.*البيانات|حل.?ل|تمع.?ن/i.test(userRequest)
  const prompt = isDataExtraction ? VISION_EXTRACTION_PROMPT : VISION_FALLBACK_PROMPT

  const RETRY_DELAYS = [5000, 10000, 15000]

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await sendToVisionModel(imageUri, prompt, settings)
    if (result.success) return result
    if (result.error === 'no_vision_model' || result.error === 'no_api_key' || result.error === 'model_no_vision') {
      return result
    }
    if (attempt < 2) await sleep(RETRY_DELAYS[attempt])
  }

  return { success: false, content: '', usedVisionModel: true, error: 'all_retries_failed' }
}
