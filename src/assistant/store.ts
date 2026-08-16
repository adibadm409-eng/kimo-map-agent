import { getDB } from '../database/db'
import { defaultProvider, PROVIDERS, type CustomProviderDef, type ProviderId } from './providers'
import * as SQLite from 'expo-sqlite'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

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
  after?: any
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
        CREATE TABLE IF NOT EXISTS agent_secret_values (
          secret_id TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER,
          provider_label TEXT, model TEXT, mode TEXT
        );
        CREATE TABLE IF NOT EXISTS agent_messages (
          id TEXT PRIMARY KEY, session_id TEXT, role TEXT, kind TEXT, content TEXT, meta TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_undo (
          id TEXT PRIMARY KEY, session_id TEXT, kind TEXT, entity TEXT, entity_id TEXT, before TEXT, after TEXT, summary TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_pending (
          session_id TEXT PRIMARY KEY, kind TEXT, payload TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_brain (
          id TEXT PRIMARY KEY, session_id TEXT, kind TEXT, body TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_runtime_events (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_task_runs (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_request TEXT NOT NULL,
          skill_id TEXT, intent TEXT, confidence REAL, status TEXT NOT NULL,
          plan TEXT, current_step_id TEXT, evidence TEXT, last_error TEXT,
          started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_task_events (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL, event_type TEXT NOT NULL,
          from_status TEXT, to_status TEXT, payload TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_msgs ON agent_messages (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_undo ON agent_undo (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_brain ON agent_brain (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_runtime_events ON agent_runtime_events (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_task_runs ON agent_task_runs (session_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_agent_task_events ON agent_task_events (task_id, created_at);

        -- ترحيل قواعد البيانات التي أنشئت قبل إضافة صورة after لسجل التراجع.
      `)
      try { await d.runAsync('ALTER TABLE agent_undo ADD COLUMN after TEXT') } catch {}
      return d
    })()
  }
  return dbPromise
}

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface AgentRuntimeEvent {
  id: string
  sessionId: string
  eventType: string
  payload: any
  createdAt: number
}

export type AgentTaskStatus = 'proposed' | 'awaiting_user' | 'running' | 'verifying' | 'completed' | 'failed' | 'cancelled'

export interface AgentTaskRun {
  id: string
  sessionId: string
  userRequest: string
  skillId?: string
  intent?: string
  confidence?: number
  status: AgentTaskStatus
  plan?: any
  currentStepId?: string
  evidence: any[]
  lastError?: string
  startedAt: number
  updatedAt: number
  completedAt?: number
}

export async function createTaskRun(input: Pick<AgentTaskRun, 'sessionId' | 'userRequest' | 'skillId' | 'intent' | 'confidence' | 'plan'>): Promise<AgentTaskRun> {
  const d = await db()
  const now = Date.now()
  const task: AgentTaskRun = { id: `task-${genId()}`, sessionId: input.sessionId, userRequest: input.userRequest, skillId: input.skillId, intent: input.intent, confidence: input.confidence, status: 'proposed', plan: input.plan, evidence: [], startedAt: now, updatedAt: now }
  await d.runAsync('INSERT INTO agent_task_runs (id, session_id, user_request, skill_id, intent, confidence, status, plan, evidence, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', task.id, task.sessionId, task.userRequest, task.skillId ?? null, task.intent ?? null, task.confidence ?? null, task.status, task.plan ? JSON.stringify(task.plan) : null, '[]', now, now)
  await appendTaskEvent(task.id, undefined, 'proposed', { userRequest: task.userRequest })
  return task
}

const TASK_TRANSITIONS: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  proposed: ['running', 'awaiting_user', 'cancelled', 'failed'],
  awaiting_user: ['running', 'cancelled', 'failed'],
  running: ['awaiting_user', 'verifying', 'cancelled', 'failed'],
  verifying: ['completed', 'running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

export function canTransitionTask(from: AgentTaskStatus, to: AgentTaskStatus): boolean {
  return from === to || TASK_TRANSITIONS[from]?.includes(to) === true
}

export async function transitionTaskRun(taskId: string, status: AgentTaskStatus, patch: Partial<Pick<AgentTaskRun, 'currentStepId' | 'evidence' | 'lastError' | 'plan'>> = {}): Promise<void> {
  const d = await db()
  const row = await d.getFirstAsync<{ status: AgentTaskStatus }>('SELECT status FROM agent_task_runs WHERE id = ?', taskId)
  if (!row || !canTransitionTask(row.status, status)) return
  if (status === 'completed' && (!patch.evidence || patch.evidence.length === 0)) return
  const now = Date.now()
  const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? now : null
  await d.runAsync('UPDATE agent_task_runs SET status = ?, current_step_id = COALESCE(?, current_step_id), evidence = COALESCE(?, evidence), last_error = COALESCE(?, last_error), plan = COALESCE(?, plan), updated_at = ?, completed_at = ? WHERE id = ?', status, patch.currentStepId ?? null, patch.evidence ? JSON.stringify(patch.evidence) : null, patch.lastError ?? null, patch.plan ? JSON.stringify(patch.plan) : null, now, completedAt, taskId)
  await appendTaskEvent(taskId, row.status, status, patch)
}

async function appendTaskEvent(taskId: string, fromStatus: AgentTaskStatus | undefined, toStatus: AgentTaskStatus, payload: any): Promise<void> {
  const d = await db()
  await d.runAsync('INSERT INTO agent_task_events (id, task_id, event_type, from_status, to_status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', genId(), taskId, 'status', fromStatus ?? null, toStatus, JSON.stringify(payload ?? {}), Date.now())
}

export async function getLatestTaskRun(sessionId: string): Promise<AgentTaskRun | null> {
  const d = await db()
  const row = await d.getFirstAsync<any>('SELECT * FROM agent_task_runs WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1', sessionId)
  if (!row) return null
  return { id: row.id, sessionId: row.session_id, userRequest: row.user_request, skillId: row.skill_id ?? undefined, intent: row.intent ?? undefined, confidence: row.confidence ?? undefined, status: row.status, plan: row.plan ? JSON.parse(row.plan) : undefined, currentStepId: row.current_step_id ?? undefined, evidence: row.evidence ? JSON.parse(row.evidence) : [], lastError: row.last_error ?? undefined, startedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? undefined }
}

export async function saveRuntimeEvent(sessionId: string, eventType: string, payload: any): Promise<void> {
  const d = await db()
  await d.runAsync(
    'INSERT INTO agent_runtime_events (id, session_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    genId(), sessionId, eventType, JSON.stringify(payload ?? {}), Date.now(),
  )
}

export async function listRuntimeEvents(sessionId: string, limit = 120): Promise<AgentRuntimeEvent[]> {
  const d = await db()
  const rows = await d.getAllAsync<{ id: string; session_id: string; event_type: string; payload: string; created_at: number }>(
    'SELECT * FROM agent_runtime_events WHERE session_id = ? ORDER BY created_at ASC LIMIT ?', sessionId, limit,
  )
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    payload: (() => { try { return JSON.parse(row.payload) } catch { return { raw: row.payload } } })(),
    createdAt: row.created_at,
  }))
}

export async function clearRuntimeEvents(sessionId: string): Promise<void> {
  const d = await db()
  await d.runAsync('DELETE FROM agent_runtime_events WHERE session_id = ?', sessionId)
}

// ---------- الإعدادات ----------

const SECRET_PREFIX = 'property-manager.secret.'

function secretKey(id: string): string {
  return `${SECRET_PREFIX}${encodeURIComponent(id)}`
}

async function readDatabaseSecret(id: string): Promise<string> {
  const d = await db()
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM agent_secret_values WHERE secret_id = ?', id)
  return row?.value ?? ''
}

async function writeDatabaseSecret(id: string, value: string): Promise<void> {
  const d = await db()
  if (value) {
    await d.runAsync(
      'INSERT OR REPLACE INTO agent_secret_values (secret_id, value, updated_at) VALUES (?, ?, ?)',
      id,
      value,
      Date.now(),
    )
  } else {
    await d.runAsync('DELETE FROM agent_secret_values WHERE secret_id = ?', id)
  }
}

async function readSecret(id: string, legacy?: string): Promise<string> {
  const databaseValue = await readDatabaseSecret(id).catch(() => '')
  if (databaseValue) {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(secretKey(id), databaseValue, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }).catch(() => {})
    }
    return databaseValue
  }
  if (Platform.OS !== 'web') {
    try {
      const stored = await SecureStore.getItemAsync(secretKey(id))
      if (stored) {
        await writeDatabaseSecret(id, stored).catch(() => {})
        return stored
      }
    } catch {}
  }
  if (legacy) {
    await writeDatabaseSecret(id, legacy).catch(() => {})
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(secretKey(id), legacy, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }).catch(() => {})
    }
    return legacy
  }
  return ''
}

async function writeSecret(id: string, value: string): Promise<void> {
  await writeDatabaseSecret(id, value)
  if (Platform.OS === 'web') return
  try {
    if (value) await SecureStore.setItemAsync(secretKey(id), value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
    else await SecureStore.deleteItemAsync(secretKey(id))
  } catch {}
}

async function hydrateSecrets(keys: Record<string, string>, customProviders: CustomProviderDef[]): Promise<{ keys: Record<string, string>; customProviders: CustomProviderDef[] }> {
  const hydratedKeys: Record<string, string> = {}
  for (const [provider, legacy] of Object.entries(keys ?? {})) hydratedKeys[provider] = await readSecret(`provider:${provider}`, legacy)
  const hydratedCustom = await Promise.all((customProviders ?? []).map(async (provider) => ({
    ...provider,
    apiKey: await readSecret(`custom:${provider.id}`, provider.apiKey ?? ''),
  })))
  return { keys: hydratedKeys, customProviders: hydratedCustom }
}

async function persistSecrets(keys: Record<string, string>, customProviders: CustomProviderDef[]): Promise<{ keys: Record<string, string>; customProviders: CustomProviderDef[] }> {
  for (const [provider, value] of Object.entries(keys ?? {})) await writeSecret(`provider:${provider}`, value)
  const sanitizedCustom = await Promise.all((customProviders ?? []).map(async (provider) => {
    await writeSecret(`custom:${provider.id}`, provider.apiKey ?? '')
    return { ...provider, apiKey: '' }
  }))
  // agent_settings يحتفظ بمؤشرات المزودات، بينما القيمة الفعلية محفوظة في
  // agent_secret_values داخل SQLite ومكررة في SecureStore على المنصات الأصلية.
  // لذلك لا يؤدي حفظ الإعدادات العامة أو مغادرة الشاشة إلى تفريغ المفتاح.
  const keyMarkers = Object.fromEntries(Object.keys(keys ?? {}).map((provider) => [provider, '']))
  return { keys: keyMarkers, customProviders: sanitizedCustom }
}

export async function saveAgentApiKey(providerId: string, value: string): Promise<string> {
  const normalized = value.trim()
  const current = await getSettings()
  if (providerId.startsWith('custom:')) {
    const customId = providerId.slice('custom:'.length)
    const customProviders = current.customProviders.map((provider) => provider.id === customId ? { ...provider, apiKey: normalized } : provider)
    await setSettings({ customProviders })
  } else {
    await setSettings({ keys: { ...current.keys, [providerId]: normalized } })
  }
  const verified = await getSettings()
  const saved = providerId.startsWith('custom:')
    ? verified.customProviders.find((provider) => provider.id === providerId.slice('custom:'.length))?.apiKey ?? ''
    : verified.keys[providerId] ?? ''
  if (saved !== normalized) throw new Error('تعذر التحقق من حفظ مفتاح API داخل قاعدة البيانات المحلية.')
  return saved
}

export async function clearStoredAgentSecrets(): Promise<void> {
  const current = await getSettings()
  for (const provider of Object.keys(current.keys)) await writeSecret(`provider:${provider}`, '')
  for (const provider of current.customProviders) await writeSecret(`custom:${provider.id}`, '')
}

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
  // ترحيل مفاتيح الإصدارات التي كانت تكتب keys={} في SQLite: نقرأ كل مزود
  // مدمج من SecureStore حتى لا يضيع المفتاح الموجود فعلاً بسبب غياب المؤشر القديم.
  const knownProviders = new Set([
    ...Object.keys(s.keys),
    ...PROVIDERS.filter((provider) => provider.id !== 'custom').map((provider) => provider.id),
  ])
  const keyInputs = Object.fromEntries([...knownProviders].map((provider) => [provider, s.keys[provider] ?? '']))
  const hydrated = await hydrateSecrets(keyInputs, s.customProviders)
  s.keys = hydrated.keys
  s.customProviders = hydrated.customProviders
  return s
}

export async function setSetting<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]): Promise<void> {
  const d = await db()
  let valueToPersist: any = value
  if (key === 'keys') {
    const stored = await persistSecrets(value as AgentSettings['keys'], (await getSettings()).customProviders)
    valueToPersist = stored.keys
  } else if (key === 'customProviders') {
    const stored = await persistSecrets((await getSettings()).keys, value as AgentSettings['customProviders'])
    valueToPersist = stored.customProviders
  }
  const serialized = typeof valueToPersist === 'string' ? valueToPersist : JSON.stringify(valueToPersist)
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
  const secretState = await persistSecrets(next.keys, next.customProviders)
  await d.withTransactionAsync(async () => {
    const entries: [string, string][] = [
      ['activeProvider', next.activeProvider],
      ['models', JSON.stringify(next.models)],
      ['keys', JSON.stringify(secretState.keys)],
      ['customProviders', JSON.stringify(secretState.customProviders)],
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
    'INSERT INTO agent_undo (id, session_id, kind, entity, entity_id, before, after, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    genId(),
    entry.sessionId,
    entry.kind,
    entry.entity,
    entry.entityId,
    entry.before ? JSON.stringify(entry.before) : null,
    entry.after ? JSON.stringify(entry.after) : null,
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
    after: r.after ? safeJson(r.after) : undefined,
    summary: r.summary ?? '',
    createdAt: r.created_at ?? 0,
  }))
}

export async function peekUndo(sessionId: string): Promise<UndoEntry | null> {
  const all = await listUndo(sessionId)
  return all[0] ?? null
}

export async function removeUndo(id: string): Promise<void> {
  const d = await db()
  await d.runAsync('DELETE FROM agent_undo WHERE id = ?', id)
}

/** توافق خلفي مع المستدعي القديم؛ يستهلك السجل فوراً. استخدم peekUndo/removeUndo لمسار آمن. */
export async function popUndo(sessionId: string): Promise<UndoEntry | null> {
  const entry = await peekUndo(sessionId)
  if (!entry) return null
  await removeUndo(entry.id)
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
