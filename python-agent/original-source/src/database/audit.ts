import { getDB } from './db'
import * as SQLite from 'expo-sqlite'
import { notifyDataChanged } from './dataSync'

/**
 * سجل التدقيق (Change Log):
 * يوثّق كل عملية كتابة (create/update/delete) جرت على بيانات التطبيق —
 * سواء من الوكيل أو من الواجهة — لأغراض المراجعة وتقييم الأداء والتدقيق.
 *
 * كل سجل يحوي:
 *  - action: create | update | delete | import | restore
 *  - scope:  entity | workspace | workspace_table | workspace_row | attachment
 *  - scope_id: معرّف العنصر المتأثر
 *  - actor:   agent | user | system | undo
 *  - session_id: جلسة الوكيل (اختياري)
 *  - tool:    اسم الأداة التي نفّذت (اختياري)
 *  - before:  صورة JSON قبل التغيير (للتحديث/الحذف)
 *  - after:   صورة JSON بعد التغيير (للتحديث/الإنشاء)
 *  - summary: وصف إنساني مختصر
 *  - created_at: زمن التنفيذ (ميللي ثانية)
 */

export interface ChangeLogEntry {
  id: string
  action: 'create' | 'update' | 'delete' | 'import' | 'restore' | 'dedupe'
  scope: string
  scopeId: string
  actor: 'agent' | 'user' | 'system' | 'undo'
  sessionId?: string
  tool?: string
  before?: any
  after?: any
  summary: string
  createdAt: number
}

export interface AuditQuery {
  action?: string
  scope?: string
  scopeId?: string
  actor?: string
  sessionId?: string
  tool?: string
  fromDate?: number
  toDate?: number
  search?: string
  limit?: number
  offset?: number
}

// ---------- سياق المنفّذ الحالي ----------
// يُحدَّد من الطبقة العليا (الوكيل/الواجهة) حول عملية كتابة واحدة، فتُسجَّل
// كل التعديلات الداخلية التي تحدث ضمنها (وإن كانت عبر دوال قاعدة بيانات
// متعددة) بنفس المنفّذ والجلسة والأداة. الافتراضي: مستخدم يدوي من الواجهة.

export interface AuditActorCtx {
  actor?: 'agent' | 'user' | 'system' | 'undo'
  sessionId?: string
  tool?: string
}

let currentCtx: AuditActorCtx = { actor: 'user' }

export function getAuditCtx(): AuditActorCtx {
  return currentCtx
}

/** تنفيذ callback ضمن سياق منفّذ محدد (وكيل/تراجع...) ثم استعادة السياق السابق. */
export async function withAuditCtx<T>(ctx: AuditActorCtx, fn: () => Promise<T>): Promise<T> {
  const prev = currentCtx
  currentCtx = { ...prev, ...ctx }
  try {
    return await fn()
  } finally {
    currentCtx = prev
  }
}

let ready: Promise<SQLite.SQLiteDatabase> | null = null

/** يحتفظ السجل محلياً بآخر خمس سنوات افتراضياً، مع تنظيف دوري لمنع نموه بلا حدود. */
export const DEFAULT_AUDIT_RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000
const AUDIT_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000
let lastPrunedAt = 0

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!ready) {
    ready = (async () => {
      const d = await getDB()
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS change_log (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          scope TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          actor TEXT NOT NULL DEFAULT 'system',
          session_id TEXT,
          tool TEXT,
          before TEXT,
          after TEXT,
          summary TEXT DEFAULT '',
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_change_log_created ON change_log (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_change_log_scope ON change_log (scope, scope_id);
        CREATE INDEX IF NOT EXISTS idx_change_log_action ON change_log (action);
        CREATE INDEX IF NOT EXISTS idx_change_log_session ON change_log (session_id);
      `)
      return d
    })()
  }
  return ready
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function jsonify(v: any): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return null
  }
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** حذف السجلات الأقدم من حد الاحتفاظ. لا تسجل هذه العملية نفسها في change_log. */
export async function pruneChangeLog(options: { now?: number; retentionMs?: number } = {}): Promise<number> {
  const now = options.now ?? Date.now()
  const retentionMs = options.retentionMs ?? DEFAULT_AUDIT_RETENTION_MS
  if (!Number.isFinite(retentionMs) || retentionMs < 0) throw new Error('سياسة الاحتفاظ يجب أن تكون مدة غير سالبة.')
  const d = await db()
  const result = await d.runAsync('DELETE FROM change_log WHERE created_at < ?', [now - retentionMs])
  return result.changes ?? 0
}

/** تسجيل عملية في سجل التدقيق؛ لا يكسر العملية الأصلية، لكنه يحذر بوضوح عند تعذر التسجيل. */
export async function logChange(entry: {
  action: ChangeLogEntry['action']
  scope: string
  scopeId: string
  actor?: ChangeLogEntry['actor']
  sessionId?: string
  tool?: string
  before?: any
  after?: any
  summary?: string
}): Promise<string | null> {
  try {
    const d = await db()
    const id = genId()
    const now = Date.now()
    const ctx = currentCtx
    await d.runAsync(
      `INSERT INTO change_log (id, action, scope, scope_id, actor, session_id, tool, before, after, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      entry.action,
      entry.scope,
      String(entry.scopeId ?? ''),
      entry.actor ?? ctx.actor ?? 'system',
      entry.sessionId ?? ctx.sessionId ?? null,
      entry.tool ?? ctx.tool ?? null,
      jsonify(entry.before),
      jsonify(entry.after),
      entry.summary ?? '',
      now,
    )
    // إعلام الواجهة بتغيّر البيانات — أي كتابة (وكيل أو واجهة) تمر بهذه النقطة
    notifyDataChanged(entry.scope)
    if (now - lastPrunedAt >= AUDIT_PRUNE_INTERVAL_MS) {
      lastPrunedAt = now
      try {
        await pruneChangeLog({ now })
      } catch (pruneError) {
        console.warn('[Audit] Failed to prune change_log:', pruneError)
      }
    }
    return id
  } catch (error) {
    console.warn(`[Audit] Failed to record ${entry.action} on ${entry.scope}/${entry.scopeId}:`, error)
    return null
  }
}

/** استعلام سجل التدقيق بفلاتر اختيارية + ترتيب تنازلي بالزمن. */
export async function queryChangeLog(q: AuditQuery = {}): Promise<ChangeLogEntry[]> {
  const d = await db()
  const where: string[] = []
  const params: any[] = []
  if (q.action) { where.push('action = ?'); params.push(q.action) }
  if (q.scope) { where.push('scope = ?'); params.push(q.scope) }
  if (q.scopeId) { where.push('scope_id = ?'); params.push(q.scopeId) }
  if (q.actor) { where.push('actor = ?'); params.push(q.actor) }
  if (q.sessionId) { where.push('session_id = ?'); params.push(q.sessionId) }
  if (q.tool) { where.push('tool = ?'); params.push(q.tool) }
  if (q.fromDate != null) { where.push('created_at >= ?'); params.push(Number(q.fromDate)) }
  if (q.toDate != null) { where.push('created_at <= ?'); params.push(Number(q.toDate)) }
  if (q.search) {
    where.push('(summary LIKE ? OR scope LIKE ? OR tool LIKE ?)')
    const like = `%${String(q.search)}%`
    params.push(like, like, like)
  }
  const limit = Math.max(1, Math.min(2000, Number(q.limit ?? 200)))
  const offset = Math.max(0, Number(q.offset ?? 0))
  const sql = `SELECT * FROM change_log${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)
  const rows = await d.getAllAsync<any>(sql, ...params)
  return rows.map((r: any) => ({
    id: r.id,
    action: r.action,
    scope: r.scope,
    scopeId: r.scope_id,
    actor: r.actor ?? 'system',
    sessionId: r.session_id ?? undefined,
    tool: r.tool ?? undefined,
    before: parseJson<any>(r.before, null),
    after: parseJson<any>(r.after, null),
    summary: r.summary ?? '',
    createdAt: r.created_at ?? 0,
  }))
}

/** إحصائيات اختصارية للسجل: عدد العمليات لكل نوع خلال فترة. */
export async function changeLogStats(q: { fromDate?: number; toDate?: number } = {}): Promise<{ action: string; count: number }[]> {
  const d = await db()
  const where: string[] = []
  const params: any[] = []
  if (q.fromDate != null) { where.push('created_at >= ?'); params.push(Number(q.fromDate)) }
  if (q.toDate != null) { where.push('created_at <= ?'); params.push(Number(q.toDate)) }
  const sql = `SELECT action, COUNT(*) as count FROM change_log${where.length ? ' WHERE ' + where.join(' AND ') : ''} GROUP BY action ORDER BY count DESC`
  const rows = await d.getAllAsync<{ action: string; count: number }>(sql, ...params)
  return rows.map((r) => ({ action: r.action, count: r.count ?? 0 }))
}

/** مسح سجل التدقيق لفترة محددة أو كامل السجل (يحذف السجلات القديمة فقط). */
export async function purgeChangeLog(olderThan?: number): Promise<number> {
  const d = await db()
  if (olderThan == null) {
    const r = await d.runAsync('DELETE FROM change_log')
    return r?.changes ?? 0
  }
  const r = await d.runAsync('DELETE FROM change_log WHERE created_at < ?', Number(olderThan))
  return r?.changes ?? 0
}

/** اطّلاع على عدد عمليات الوكيل اليومية لتقييم الأداء. */
export async function dailyActorStats(days = 14): Promise<{ day: string; actor: string; count: number }[]> {
  const d = await db()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const rows = await d.getAllAsync<any>(
    `SELECT DATE(created_at/1000, 'unixepoch', 'localtime') as day, actor, COUNT(*) as count
     FROM change_log
     WHERE created_at >= ?
     GROUP BY day, actor
     ORDER BY day DESC, count DESC`,
    cutoff,
  )
  return rows.map((r: any) => ({ day: r.day ?? '', actor: r.actor ?? 'system', count: r.count ?? 0 }))
}
