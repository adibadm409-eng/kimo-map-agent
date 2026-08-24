// جسر يربط تطبيق مدير العقارات بالمحرك البايثوني الجديد (kimo_serve).
// المحرك البايثوني يبعث أحداثاً متطابقة مع assistant/runtimeEvents.ts،
// فيُعاد توجيهها كما هي إلى واجهة التطبيق دون أي تحويل.

import { emitForSession, markRunning, clearRunning, type AgentOutcome } from './agentRun'

// عنوان خادم المحرك البايثوني. الافتراضي localhost يناسب تشغيلاً على نفس
// الجهاز (ترمكس + إكسبو غو على الهاتف). إن اتصلت من جهاز مختلف على الشبكة،
// استبدله بعنوان IP لجهاز الخادم، مثل: http://192.168.1.10:8000
export const KIMO_ENGINE_URL = 'http://localhost:8000'

// فعّل المحرك البايثوني. اضبطه على false للرجوع إلى المحرك القديم (TS) داخل التطبيق.
export const KIMO_ENGINE_ENABLED = true

const appToKimo = new Map<string, string>()

async function ensureKimoSession(appSessionId: string): Promise<string> {
  let kimo = appToKimo.get(appSessionId)
  if (!kimo) {
    const r = await fetch(`${KIMO_ENGINE_URL}/api/session`, { method: 'POST' })
    const j = await r.json()
    kimo = j.session_id as string
    appToKimo.set(appSessionId, kimo)
  }
  return kimo
}

/**
 * يرسل رسالة المستخدم إلى المحرك البايثوني ويعيد توجيه أحداثه إلى الواجهة.
 * يُرجع نتيجة المهمة ليُعلم بها التطبيق.
 */
export async function runViaKimo(
  appSessionId: string,
  text: string,
): Promise<AgentOutcome> {
  if (!KIMO_ENGINE_ENABLED) return 'failed'
  markRunning(appSessionId)
  try {
    const kimo = await ensureKimoSession(appSessionId)
    const r = await fetch(`${KIMO_ENGINE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: kimo, text }),
    })
    const j = (await r.json()) as { answer?: string; events?: any[] }
    for (const e of j.events ?? []) {
      emitForSession(appSessionId, e as any)
    }
    const outcome: AgentOutcome = j.answer ? 'completed' : 'failed'
    emitForSession(appSessionId, { type: 'done', outcome } as any)
    return outcome
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    emitForSession(appSessionId, {
      type: 'error',
      message: `تعذّر الاتصال بمحرك كيمو على ${KIMO_ENGINE_URL}: ${msg}`,
    } as any)
    emitForSession(appSessionId, { type: 'done', outcome: 'failed' } as any)
    return 'failed'
  } finally {
    clearRunning(appSessionId)
  }
}
