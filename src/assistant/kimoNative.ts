import { NativeModules } from 'react-native'
import { emitForSession, type AgentOutcome } from './agentRun'
import { persistAssistantText } from './store'
import { runViaKimo } from './kimoBridge'

// اسم قاعدة بيانات expo-sqlite في التطبيق؛ تطبّقه الطبقة الأصلية لتحديد مسار
// الملف ذاته الذي يفتحه المحرك البايثوني المضمَّن (مصدر بيانات واحد).
export const KIMO_DB_NAME = 'realestate.db'

// الوحدة الأصلية (Kotlin/Chaquopy على أندرويد، Swift/PythonKit على iOS) التي
// تستدعي kimo_embed.run_chat_sync مباشرةً داخل معالج التطبيق.
const NativeKimo = (NativeModules as any).KimoEngine

/**
 * يشغّل المحرك: داخل التطبيق المبني عبر الوحدة الأصلية (بايثون مضمَّن يشارك
 * قاعدة التطبيق)، أو عبر خادم HTTP كاحتياط للتطوير (Expo Go).
 */
export async function runViaKimoNative(
  appSessionId: string,
  text: string,
  opts?: { mock?: boolean },
): Promise<AgentOutcome> {
  if (NativeKimo && typeof NativeKimo.runChat === 'function') {
    const json = await NativeKimo.runChat(
      appSessionId,
      text,
      KIMO_DB_NAME,
      opts?.mock ? 1 : 0,
    )
    const j = typeof json === 'string' ? JSON.parse(json) : json
    for (const e of j.events ?? []) {
      emitForSession(appSessionId, e as any)
    }
    if (j.answer) {
      await persistAssistantText(appSessionId, j.answer, 'text').catch(() => {})
    }
    return j.answer ? 'completed' : 'failed'
  }
  // احتياط التطوير (Expo Go / خادم HTTP منفصل)
  return runViaKimo(appSessionId, text)
}
