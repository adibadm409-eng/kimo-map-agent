/**
 * تعلم من التفاعلات السابقة — حفظ أنماط استخدام المستخدم
 * لتحسين التصنيف والتنبؤ بالأدوات المطلوبة.
 */

import { getDB } from '../database/db'

export interface UserPattern {
  id: string
  sessionId: string
  intent: string        // نوع النية
  entity?: string       // الكيان المستخدم
  tools: string[]       // الأدوات المستخدمة
  timestamp: number
  success: boolean      // هل نجحت المهمة؟
}

// تهيئة الجدول
export async function initPatternStore(): Promise<void> {
  const db = await getDB()
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_patterns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      intent TEXT NOT NULL,
      entity TEXT,
      tools TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_intent ON user_patterns(intent);
    CREATE INDEX IF NOT EXISTS idx_patterns_entity ON user_patterns(entity);
  `)
}

// تسجيل نمط
export async function recordPattern(pattern: Omit<UserPattern, 'id'>): Promise<void> {
  const db = await getDB()
  const id = `pat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  await db.runAsync(
    `INSERT INTO user_patterns (id, session_id, intent, entity, tools, timestamp, success)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, pattern.sessionId, pattern.intent, pattern.entity ?? null, JSON.stringify(pattern.tools), pattern.timestamp, pattern.success ? 1 : 0]
  )
}

// تحليل أنماط المستخدم
export async function analyzePatterns(sessionId?: string): Promise<{
  topIntents: { intent: string; count: number }[]
  topEntities: { entity: string; count: number }[]
  topTools: { tool: string; count: number }[]
  successRate: number
}> {
  const db = await getDB()
  const where = sessionId ? 'WHERE session_id = ?' : ''
  const params = sessionId ? [sessionId] : []

  // أكثر النيات
  const intents = await db.getAllAsync<{ intent: string; count: number }>(
    `SELECT intent, COUNT(*) as count FROM user_patterns ${where} GROUP BY intent ORDER BY count DESC LIMIT 5`,
    params
  )

  // أكثر الكيانات
  const entities = await db.getAllAsync<{ entity: string; count: number }>(
    `SELECT entity, COUNT(*) as count FROM user_patterns ${where} WHERE entity IS NOT NULL GROUP BY entity ORDER BY count DESC LIMIT 5`,
    params
  )

  // أكثر الأدوات
  const toolsRaw = await db.getAllAsync<{ tools: string }>(
    `SELECT tools FROM user_patterns ${where}`,
    params
  )
  const toolCounts = new Map<string, number>()
  for (const row of toolsRaw) {
    const tools = JSON.parse(row.tools) as string[]
    for (const t of tools) {
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1)
    }
  }
  const topTools = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }))

  // نسبة النجاح
  const total = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM user_patterns ${where}`,
    params
  )
  const successful = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM user_patterns ${where} ${where ? 'AND' : 'WHERE'} success = 1`,
    params
  )

  return {
    topIntents: intents,
    topEntities: entities,
    topTools,
    successRate: total?.count ? (successful?.count ?? 0) / total.count : 0,
  }
}

// توقع الأدوات المطلوبة بناءً على النية والكيان
export async function predictTools(intent: string, entity?: string): Promise<string[]> {
  const db = await getDB()
  const rows = await db.getAllAsync<{ tools: string }>(
    `SELECT tools FROM user_patterns WHERE intent = ? ${entity ? 'AND entity = ?' : ''} ORDER BY timestamp DESC LIMIT 20`,
    entity ? [intent, entity] : [intent]
  )

  // عد الأدوات واختيار الأكثر تكراراً
  const toolCounts = new Map<string, number>()
  for (const row of rows) {
    const tools = JSON.parse(row.tools) as string[]
    for (const t of tools) {
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1)
    }
  }

  return [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool]) => tool)
}
