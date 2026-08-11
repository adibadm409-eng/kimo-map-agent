import { getDB } from '../database/db'
import { defaultProvider, type CustomProviderDef, type ProviderId } from './providers'
import * as SQLite from 'expo-sqlite'

export type AgentMode = 'read' | 'edit'
export type MessageKind = 'text' | 'tool' | 'tool_call' | 'ask_user' | 'confirmation' | 'file' | 'link' | 'error' | 'system' | 'progress'

export interface AgentSettings {
  activeProvider: string
  models: Record<string, string>
  keys: Record<string, string>
  /**
   * قوائم الموديلات المجلوبة من كل مزود (تُحفظ محلياً بعد "جلب قائمة الموديلات"
   * حتى لا يضطر المستخدم لإعادة الجلب في كل مرة).
   */
  modelLists: Record<string, string[]>
  customProviders: CustomProviderDef[]
  mode: AgentMode
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  providerLabel: string
  model: string
  mode: AgentMode
  messageCount: number
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  kind: MessageKind
  content: string
  meta?: Record<string, any>
  createdAt: number
}

export interface UndoEntry {
  id: string
  sessionId: string
  kind: 'create' | 'update' | 'delete'
  entity: string
  entityId: string
  before?: any
  summary: string
  createdAt: number
}

export interface PendingDeleteItem {
  tool: string
  id: string
  entity?: string
  preview: string
}

export interface PendingState {
  sessionId: string
  kind: 'ask_user' | 'confirmation'
  question: string
  choices?: string[]
  allowFreeText?: boolean
  title?: string
  details?: string
  action?: { type: 'delete'; tool: string; id: string; args?: Record<string, any> }
  items?: PendingDeleteItem[]
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await getDB()
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS agent_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER,
          provider_label TEXT, model TEXT, mode TEXT
        );
        CREATE TABLE IF NOT EXISTS agent_messages (
          id TEXT PRIMARY KEY, session_id TEXT, role TEXT, kind TEXT, content TEXT, meta TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_undo (
          id TEXT PRIMARY KEY, session_id TEXT, kind TEXT, entity TEXT, entity_id TEXT, before TEXT, summary TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_pending (
          session_id TEXT PRIMARY KEY, kind TEXT, payload TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_brain (
          id TEXT PRIMARY KEY, session_id TEXT, kind TEXT, body TEXT, created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_agent_msgs ON agent_messages (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_undo ON agent_undo (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_brain ON agent_brain (session_id, created_at);
      `)
      return d
    })()
  }
  return dbPromise
}

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- الإعدادات ----------

const DEFAULT_SETTINGS: AgentSettings = {
  activeProvider: 'deepseek',
  models: {},
  keys: {},
  modelLists: {},
  customProviders: [],
  mode: 'read',
}

export async function getSettings(): Promise<AgentSettings> {
  const d = await db()
  const rows = await d.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM agent_settings')
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const s = { ...DEFAULT_SETTINGS }
  if (map.has('activeProvider')) s.activeProvider = map.get('activeProvider')!
  if (map.has('models')) { try { s.models = JSON.parse(map.get('models')!) } catch {} }
  if (map.has('keys')) { try { s.keys = JSON.parse(map.get('keys')!) } catch {} }
  if (map.has('customProviders')) { try { s.customProviders = JSON.parse(map.get('customProviders')!) } catch {} }
  if (map.has('modelLists')) { try { s.modelLists = JSON.parse(map.get('modelLists')!) } catch {} }
  if (map.has('mode')) s.mode = map.get('mode') === 'edit' ? 'edit' : 'read'
  return s
}

export async function setSetting<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]): Promise<void> {
  const d = await db()
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  await d.runAsync(
    'INSERT OR REPLACE INTO agent_settings (key, value) VALUES (?, ?)',
    key as string,
    serialized
  )
}

export async function setSettings(patch: Partial<AgentSettings>): Promise<AgentSettings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  const d = await db()
  await d.withTransactionAsync(async () => {
    const entries: [string, string][] = [
      ['activeProvider', next.activeProvider],
      ['models', JSON.stringify(next.models)],
      ['keys', JSON.stringify(next.keys)],
      ['customProviders', JSON.stringify(next.customProviders)],
      ['modelLists', JSON.stringify(next.modelLists)],
      ['mode', next.mode],
    ]
    for (const [k, v] of entries) {
      await d.runAsync('INSERT OR REPLACE INTO agent_settings (key, value) VALUES (?, ?)', k, v)
    }
  })
  return next
}

/** المزود النشط + الموديل النشط + المفتاح (مع المزود المخصص). */
export async function activeConfig(settings?: AgentSettings): Promise<{
  providerId: string
  providerName: string
  baseUrl: string
  model: string
  apiKey: string
  isCustom: boolean
}> {
  const s = settings ?? (await getSettings())
  const isCustom = s.activeProvider.startsWith('custom:')
  if (isCustom) {
    const customId = s.activeProvider.slice('custom:'.length)
    const custom = s.customProviders.find((c) => c.id === customId)
    if (!custom) return { providerId: s.activeProvider, providerName: 'مزود مخصص (محذوف)', baseUrl: '', model: '', apiKey: '', isCustom: true }
    return {
      providerId: s.activeProvider,
      providerName: custom.name,
      baseUrl: custom.baseUrl,
      model: s.models[s.activeProvider] ?? custom.models[0] ?? '',
      apiKey: custom.apiKey || s.keys[s.activeProvider] || '',
      isCustom: true,
    }
  }
  const def = defaultProvider(s.activeProvider as ProviderId)
  return {
    providerId: s.activeProvider,
    providerName: def.name,
    baseUrl: def.baseUrl,
    model: s.models[s.activeProvider] ?? def.defaultModels[0] ?? '',
    apiKey: s.keys[s.activeProvider] ?? '',
    isCustom: false,
  }
}

// ---------- الجلسات ----------

export async function listSessions(): Promise<SessionMeta[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(`
    SELECT s.*, (SELECT COUNT(*) FROM agent_messages m WHERE m.session_id = s.id) AS message_count
    FROM agent_sessions s ORDER BY s.updated_at DESC
  `)
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? 'محادثة بدون عنوان',
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
    providerLabel: r.provider_label ?? '',
    model: r.model ?? '',
    mode: (r.mode ?? 'read') as AgentMode,
    messageCount: r.message_count ?? 0,
  }))
}

export async function getSession(id: string): Promise<SessionMeta | null> {
  const d = await db()
  const r = await d.getFirstAsync<any>('SELECT * FROM agent_sessions WHERE id = ?', id)
  if (!r) return null
  return {
    id: r.id,
    title: r.title ?? '',
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
    providerLabel: r.provider_label ?? '',
    model: r.model ?? '',
    mode: (r.mode ?? 'read') as AgentMode,
    messageCount: 0,
  }
}

export async function createSession(title?: string): Promise<string> {
  const id = genId()
  const s = await getSettings()
  const now = Date.now()
  const d = await db()
  await d.runAsync(
    'INSERT INTO agent_sessions (id, title, created_at, updated_at, provider_label, model, mode) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    title ?? 'محادثة جديدة',
    now,
    now,
    s.activeProvider,
    s.models[s.activeProvider] ?? '',
    s.mode
  )
  return id
}

export async function updateSessionMeta(id: string, patch: Partial<Pick<SessionMeta, 'title' | 'providerLabel' | 'model' | 'mode' | 'updatedAt'>>): Promise<void> {
  const d = await db()
  const current = await getSession(id).catch(() => null)
  await d.runAsync(
    'UPDATE agent_sessions SET title = ?, provider_label = ?, model = ?, mode = ?, updated_at = ? WHERE id = ?',
    patch.title ?? current?.title ?? 'محادثة',
    patch.providerLabel ?? current?.providerLabel ?? '',
    patch.model ?? current?.model ?? '',
    patch.mode ?? current?.mode ?? 'read',
    patch.updatedAt ?? Date.now(),
    id
  )
}

export async function touchSession(id: string): Promise<void> {
  const d = await db()
  await d.runAsync('UPDATE agent_sessions SET updated_at = ? WHERE id = ?', Date.now(), id)
}

export async function deleteSession(id: string): Promise<void> {
  const d = await db()
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM agent_messages WHERE session_id = ?', id)
    await d.runAsync('DELETE FROM agent_undo WHERE session_id = ?', id)
    await d.runAsync('DELETE FROM agent_pending WHERE session_id = ?', id)
    await d.runAsync('DELETE FROM agent_sessions WHERE id = ?', id)
  })
}

// ---------- الرسائل ----------

export async function getMessages(sessionId: string): Promise<Message[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(
    'SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC',
    sessionId
  )
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    kind: (r.kind ?? 'text') as MessageKind,
    content: r.content ?? '',
    meta: r.meta ? safeJson(r.meta) : undefined,
    createdAt: r.created_at ?? 0,
  }))
}

export async function addMessage(m: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
  const msg: Message = { ...m, id: genId(), createdAt: Date.now() }
  const d = await db()
  await d.runAsync(
    'INSERT INTO agent_messages (id, session_id, role, kind, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    msg.id,
    msg.sessionId,
    msg.role,
    msg.kind,
    msg.content ?? '',
    msg.meta ? JSON.stringify(msg.meta) : null,
    msg.createdAt
  )
  await touchSession(msg.sessionId)
  return msg
}

export async function searchSessions(query: string): Promise<{ session: SessionMeta; snippet: string }[]> {
  const d = await db()
  const q = `%${query}%`
  const rows = await d.getAllAsync<any>(
    `SELECT s.*, m.content AS snippet,
            (SELECT COUNT(*) FROM agent_messages mm WHERE mm.session_id = s.id) AS message_count
     FROM agent_sessions s
     LEFT JOIN agent_messages m ON m.session_id = s.id AND (m.content LIKE ? OR m.meta LIKE ?)
     WHERE s.title LIKE ? OR m.content LIKE ? OR m.meta LIKE ?
     GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 30`,
    q, q, q, q, q
  )
  return rows.map((r) => ({
    session: {
      id: r.id,
      title: r.title ?? 'محادثة',
      createdAt: r.created_at ?? 0,
      updatedAt: r.updated_at ?? 0,
      providerLabel: r.provider_label ?? '',
      model: r.model ?? '',
      mode: (r.mode ?? 'read') as AgentMode,
      messageCount: r.message_count ?? 0,
    },
    snippet: r.snippet ? String(r.snippet).slice(0, 140) : '',
  }))
}

// ---------- سجل التراجع ----------

export async function pushUndo(entry: Omit<UndoEntry, 'id' | 'createdAt'>): Promise<void> {
  const d = await db()
  await d.runAsync(
    'INSERT INTO agent_undo (id, session_id, kind, entity, entity_id, before, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    genId(),
    entry.sessionId,
    entry.kind,
    entry.entity,
    entry.entityId,
    entry.before ? JSON.stringify(entry.before) : null,
    entry.summary,
    Date.now()
  )
}

export async function listUndo(sessionId: string): Promise<UndoEntry[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(
    'SELECT * FROM agent_undo WHERE session_id = ? ORDER BY created_at DESC',
    sessionId
  )
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    kind: r.kind,
    entity: r.entity,
    entityId: r.entity_id,
    before: r.before ? safeJson(r.before) : undefined,
    summary: r.summary ?? '',
    createdAt: r.created_at ?? 0,
  }))
}

export async function popUndo(sessionId: string): Promise<UndoEntry | null> {
  const all = await listUndo(sessionId)
  if (!all.length) return null
  const entry = all[0]
  const d = await db()
  await d.runAsync('DELETE FROM agent_undo WHERE id = ?', entry.id)
  return entry
}

// ---------- الحالة المعلّقة (سؤال/موافقة) ----------

export async function getPending(sessionId: string): Promise<PendingState | null> {
  const d = await db()
  const r = await d.getFirstAsync<any>('SELECT * FROM agent_pending WHERE session_id = ?', sessionId)
  if (!r || !r.payload) return null
  return { sessionId, kind: r.kind ?? 'ask_user', ...safeJson(r.payload) }
}

export async function setPending(state: PendingState): Promise<void> {
  const d = await db()
  const { sessionId, kind, ...rest } = state
  await d.runAsync(
    'INSERT OR REPLACE INTO agent_pending (session_id, kind, payload, created_at) VALUES (?, ?, ?, ?)',
    sessionId,
    kind,
    JSON.stringify(rest),
    Date.now()
  )
}

export async function clearPending(sessionId: string): Promise<void> {
  const d = await db()
  await d.runAsync('DELETE FROM agent_pending WHERE session_id = ?', sessionId)
}

// ---------- العقل المفكر (ذاكرة العمل المؤقتة) ----------

export interface BrainOp {
  id: string
  sessionId: string
  kind: string
  body: string
  createdAt: number
}

export async function addBrainOp(sessionId: string, kind: string, body: string): Promise<void> {
  const d = await db()
  await d.runAsync(
    'INSERT INTO agent_brain (id, session_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)',
    genId(),
    sessionId,
    kind,
    String(body).slice(0, 500),
    Date.now()
  )
}

export async function listBrain(sessionId: string, limit = 30): Promise<BrainOp[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(
    'SELECT * FROM agent_brain WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
    sessionId,
    limit
  )
  return rows
    .map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      kind: r.kind ?? 'op',
      body: r.body ?? '',
      createdAt: r.created_at ?? 0,
    }))
    .reverse()
}

export async function clearBrain(sessionId: string): Promise<void> {
  const d = await db()
  await d.runAsync('DELETE FROM agent_brain WHERE session_id = ?', sessionId)
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
