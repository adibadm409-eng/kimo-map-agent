import { getDB } from './db'
import * as FileSystem from 'expo-file-system/legacy'
import * as SQLite from 'expo-sqlite'
import { logChange } from './audit'

/**
 * مساحة العمل المرنة (Flexible Workspace):
 * نموذج حر للمشاريع العقارية بجداول وأعمدة وصفوف غير محدودة يمكن للوكيل بناءه من الصفر
 * أو استيراده من ملفات المستخدم (Excel/CSV) — ويبقى نموذج projects/blocks/plots القالب الافتراضي فقط.
 */

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'select'

export interface WorkspaceColumn {
  id: string
  label: string
  key: string
  type: ColumnType
  options?: string[]
}

export interface Workspace {
  id: string
  name: string
  description: string
  origin: 'manual' | 'template' | 'import'
  sourceFile: string | null
  createdAt: number
  updatedAt: number
}

export interface WorkspaceTable {
  id: string
  workspaceId: string
  name: string
  columns: WorkspaceColumn[]
  rowCount: number
  createdAt: number
}

export interface WorkspaceRow {
  id: string
  tableId: string
  workspaceId: string
  values: Record<string, string>
  createdAt: number
  updatedAt: number
}

export type MediaTargetType = 'property' | 'offer'

export interface AttachmentRecord {
  id: string
  sessionId: string
  name: string
  uri: string
  size: number
  mime: string | null
  createdAt: number
}

export interface EntityMediaLink {
  id: string
  sourceAttachmentId: string
  targetType: MediaTargetType
  targetId: string
  name: string
  uri: string
  size: number
  mime: string | null
  createdAt: number
}

let ready: Promise<SQLite.SQLiteDatabase> | null = null

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!ready) {
    ready = (async () => {
      const d = await getDB()
      // ترحيل أي جدول قديم كان يستخدم اسم العمود المحجوز values (مرفوض في SQLite)
      try {
        await d.execAsync(`
          ALTER TABLE workspace_rows RENAME COLUMN values TO data;
        `)
      } catch {}
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY, name TEXT, description TEXT, origin TEXT, source_file TEXT,
          created_at INTEGER, updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS workspace_tables (
          id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, columns TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS workspace_rows (
          id TEXT PRIMARY KEY, table_id TEXT, workspace_id TEXT, data TEXT, created_at INTEGER, updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_attachments (
          id TEXT PRIMARY KEY, session_id TEXT, name TEXT, uri TEXT, size INTEGER, mime TEXT, created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS project_memory (
          id TEXT PRIMARY KEY, workspace_id TEXT, kind TEXT, body TEXT, created_at INTEGER, updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS agent_generated_files (
          id TEXT PRIMARY KEY, session_id TEXT, name TEXT, uri TEXT, format TEXT, size INTEGER, created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_prj_mem_ws ON project_memory (workspace_id);
        CREATE INDEX IF NOT EXISTS idx_ws_tables ON workspace_tables (workspace_id);
        CREATE INDEX IF NOT EXISTS idx_ws_rows ON workspace_rows (table_id);
        CREATE INDEX IF NOT EXISTS idx_ws_rows_ws ON workspace_rows (workspace_id);
        CREATE INDEX IF NOT EXISTS idx_ws_rows_created ON workspace_rows (table_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_ws_attach_session ON agent_attachments (session_id);
        CREATE INDEX IF NOT EXISTS idx_ws_attach_created ON agent_attachments (created_at);
        CREATE INDEX IF NOT EXISTS idx_gen_files_session ON agent_generated_files (session_id);
      `)
      return d
    })()
  }
  return ready
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export function slugify(label: string): string {
  const base = String(label ?? '') as string
  const slug = base
    .trim()
    .replace(/[\s\u00A0\u200f\u200e\u0640]+/g, '_')
    .replace(/^\d+/g, '')
    .replace(/[^\p{L}\p{N}_]/gu, '')
  const ascii = (slug || 'column').replace(/[^\x00-\x7F]/gu, '').replace(/\s/g, '')
  return (slug || ascii || 'column') ? (slug || 'column') : 'column'
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// ---------- مساحات العمل ----------

export async function createWorkspace(data: {
  name: string
  description?: string
  origin?: Workspace['origin']
  sourceFile?: string
}): Promise<string> {
  const d = await db()
  // منع إنشاء مساحة عمل بنفس الاسم (يسبّب تكرار المشاريع عند إعادة الإضافة)
  const same = await d.getFirstAsync<any>('SELECT id FROM workspaces WHERE name = ? COLLATE NOCASE LIMIT 1', data.name)
  if (same) return same.id
  const id = genId()
  const now = Date.now()
  await d.runAsync(
    'INSERT INTO workspaces (id, name, description, origin, source_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    data.name,
    data.description ?? '',
    data.origin ?? 'manual',
    data.sourceFile ?? null,
    now,
    now
  )
  await logChange({ action: 'create', scope: 'workspace', scopeId: id, after: data, summary: `إنشاء مساحة عمل "${data.name}"` })
  return id
}

export async function listWorkspaces(): Promise<(Workspace & { tablesCount: number; rowsCount: number })[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(`
    SELECT w.*,
      (SELECT COUNT(*) FROM workspace_tables t WHERE t.workspace_id = w.id) AS tables_count,
      (SELECT COUNT(*) FROM workspace_rows r WHERE r.workspace_id = w.id) AS rows_count
    FROM workspaces w ORDER BY w.updated_at DESC
  `)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    origin: r.origin ?? 'manual',
    sourceFile: r.source_file ?? null,
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
    tablesCount: r.tables_count ?? 0,
    rowsCount: r.rows_count ?? 0,
  }))
}

export async function getWorkspace(id: string, opts?: { includeRows?: boolean }): Promise<any | null> {
  const d = await db()
  const w = await d.getFirstAsync<any>('SELECT * FROM workspaces WHERE id = ?', id)
  if (!w) return null
  const tables = await d.getAllAsync<any>('SELECT * FROM workspace_tables WHERE workspace_id = ? ORDER BY created_at ASC', id)
  const outRowsCount = await d.getFirstAsync<any>(
    'SELECT COUNT(*) AS c FROM workspace_rows WHERE workspace_id = ?',
    id
  )
  const outTables = await Promise.all(
    tables.map(async (t: any) => {
      const columns = safeJson<WorkspaceColumn[]>(t.columns, [])
      const base: any = {
        id: t.id,
        workspaceId: t.workspace_id,
        name: t.name,
        columns,
        createdAt: t.created_at ?? 0,
      }
      if (opts?.includeRows) {
        const rows = await d.getAllAsync<any>(
          'SELECT * FROM workspace_rows WHERE table_id = ? ORDER BY created_at ASC',
          t.id
        )
        base.rows = rows.map((r: any) => ({
          id: r.id,
          tableId: r.table_id,
          workspaceId: r.workspace_id,
values: safeJson<Record<string, string>>(r.data, {}),
          createdAt: r.created_at ?? 0,
          updatedAt: r.updated_at ?? 0,
        }))
        base.rowCount = base.rows.length
      } else {
        const c = await d.getFirstAsync<any>('SELECT COUNT(*) AS c FROM workspace_rows WHERE table_id = ?', t.id)
        base.rowCount = c?.c ?? 0
      }
      return base
    })
  )
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? '',
    origin: w.origin ?? 'manual',
    sourceFile: w.source_file ?? null,
    createdAt: w.created_at ?? 0,
    updatedAt: w.updated_at ?? 0,
    tablesCount: tables.length,
    rowsCount: outRowsCount?.c ?? 0,
    tables: outTables,
  }
}

export async function updateWorkspace(id: string, patch: { name?: string; description?: string }): Promise<void> {
  const d = await db()
  const before = await d.getFirstAsync<any>('SELECT * FROM workspaces WHERE id = ?', id)
  await d.runAsync('UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?',
    patch.name ?? '',
    patch.description ?? '',
    Date.now(),
    id
  )
  await logChange({ action: 'update', scope: 'workspace', scopeId: id, before, after: patch, summary: `تعديل مساحة عمل "${before?.name ?? id}"` })
}

export async function deleteWorkspace(id: string): Promise<void> {
  const d = await db()
  const before = await d.getFirstAsync<any>('SELECT name FROM workspaces WHERE id = ?', id)
  await d.withTransactionAsync(async () => {
    const tables = await d.getAllAsync<any>('SELECT id FROM workspace_tables WHERE workspace_id = ?', id)
    for (const t of tables) {
      await d.runAsync('DELETE FROM workspace_rows WHERE table_id = ?', t.id)
    }
    await d.runAsync('DELETE FROM workspace_tables WHERE workspace_id = ?', id)
    await d.runAsync('DELETE FROM workspaces WHERE id = ?', id)
  })
  await logChange({ action: 'delete', scope: 'workspace', scopeId: id, before, summary: `حذف مساحة عمل "${before?.name ?? id}"` })
}

// ---------- الجداول ----------

export async function createTable(workspaceId: string, name: string, columnsInput: (string | (Partial<WorkspaceColumn> & { label: string }))[]): Promise<string> {
  const d = await db()
  // منع إنشاء جدول بنفس الاسم داخل المساحة نفسها (يمنع تكرار الجداول عند إعادة الإضافة)
  const same = await d.getFirstAsync<any>('SELECT id FROM workspace_tables WHERE workspace_id = ? AND name = ? COLLATE NOCASE LIMIT 1', workspaceId, name)
  if (same) return same.id
  const id = genId()
  const columns = (columnsInput ?? []).map((c) => normalizeColumn(c, columnsInput as any))
  await d.runAsync(
    'INSERT INTO workspace_tables (id, workspace_id, name, columns, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    workspaceId,
    name,
    JSON.stringify(columns),
    Date.now()
  )
  await logChange({ action: 'create', scope: 'workspace_table', scopeId: id, after: { workspace_id: workspaceId, name, columns }, summary: `إنشاء جدول "${name}" (${columns.length} عمود)` })
  return id
}

export async function getTable(tableId: string, opts?: { includeRows?: boolean }): Promise<any | null> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT * FROM workspace_tables WHERE id = ?', tableId)
  if (!t) return null
  const base: any = {
    id: t.id,
    workspaceId: t.workspace_id,
    name: t.name,
    columns: safeJson<WorkspaceColumn[]>(t.columns, []),
    createdAt: t.created_at ?? 0,
  }
  if (opts?.includeRows) {
    const rows = await d.getAllAsync<any>('SELECT * FROM workspace_rows WHERE table_id = ? ORDER BY created_at ASC', tableId)
    base.rows = rows.map((r: any) => ({
      id: r.id,
      values: safeJson<Record<string, string>>(r.data, {}),
      createdAt: r.created_at ?? 0,
    }))
    base.rowCount = base.rows.length
  } else {
    const c = await d.getFirstAsync<any>('SELECT COUNT(*) AS c FROM workspace_rows WHERE table_id = ?', tableId)
    base.rowCount = c?.c ?? 0
  }
  return base
}

export async function renameTable(tableId: string, name: string): Promise<void> {
  const d = await db()
  const before = await d.getFirstAsync<any>('SELECT name FROM workspace_tables WHERE id = ?', tableId)
  await d.runAsync('UPDATE workspace_tables SET name = ? WHERE id = ?', name, tableId)
  await logChange({ action: 'update', scope: 'workspace_table', scopeId: tableId, before, after: { name }, summary: `إعادة تسمية جدول إلى "${name}"` })
}

export async function deleteTable(tableId: string): Promise<void> {
  const d = await db()
  const before = await d.getFirstAsync<any>('SELECT name FROM workspace_tables WHERE id = ?', tableId)
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM workspace_rows WHERE table_id = ?', tableId)
    await d.runAsync('DELETE FROM workspace_tables WHERE id = ?', tableId)
  })
  await logChange({ action: 'delete', scope: 'workspace_table', scopeId: tableId, before, summary: `حذف جدول "${before?.name ?? tableId}"` })
}

function normalizeColumn(c: string | (Partial<WorkspaceColumn> & { label: string }), _all: any[]): WorkspaceColumn {
  if (typeof c === 'string') {
    const label = c.trim() || 'عمود'
    return { id: genId(), label, key: uniqueKey(label, _all), type: 'text' }
  }
  const label = (c.label ?? '').trim() || 'عمود'
  return {
    id: genId(),
    label,
    key: c.key || uniqueKey(label, _all),
    type: c.type ?? 'text',
    options: c.options,
  }
}

function uniqueKey(label: string, all: any[]): string {
  let key = slugify(label) || 'column'
  const existing = new Set(
    all.map((x: any) => (typeof x === 'string' ? slugify(x) : x?.key || slugify(x?.label ?? '')))
  )
  let i = 2
  const base = key
  while (existing.has(key)) {
    key = `${base}_${i++}`
  }
  return key
}

// ---------- الأعمدة ----------

export async function addColumn(tableId: string, column: string | (Partial<WorkspaceColumn> & { label: string })): Promise<void> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT columns FROM workspace_tables WHERE id = ?', tableId)
  if (!t) throw new Error('الجدول غير موجود')
  const columns = safeJson<WorkspaceColumn[]>(t.columns, [])
  const col = normalizeColumn(column, [...columns, column])
  columns.push(col)
  await d.runAsync('UPDATE workspace_tables SET columns = ? WHERE id = ?', JSON.stringify(columns), tableId)
  await logChange({ action: 'update', scope: 'workspace_table', scopeId: tableId, after: { added_column: col }, summary: `إضافة عمود "${col.label}" للجدول (${tableId})` })
}

export async function renameColumn(tableId: string, key: string, newKey: string, newLabel?: string): Promise<void> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT columns FROM workspace_tables WHERE id = ?', tableId)
  if (!t) return
  const columns = safeJson<WorkspaceColumn[]>(t.columns, [])
  const col = columns.find((c) => c.key === key)
  if (!col) return
  const finalKey = newKey || key
  col.key = finalKey
  if (newLabel) col.label = newLabel
  await d.runAsync('UPDATE workspace_tables SET columns = ? WHERE id = ?', JSON.stringify(columns), tableId)
  const rows = await d.getAllAsync<any>('SELECT id, data FROM workspace_rows WHERE table_id = ?', tableId)
  for (const r of rows) {
    const v = safeJson<Record<string, string>>(r.data, {})
    if (key in v) {
      v[finalKey] = v[key] ?? ''
      if (finalKey !== key) delete v[key]
      await d.runAsync('UPDATE workspace_rows SET data = ? WHERE id = ?', JSON.stringify(v), r.id)
    }
  }
  await logChange({ action: 'update', scope: 'workspace_table', scopeId: tableId, before: { key }, after: { new_key: finalKey, new_label: newLabel }, summary: `إعادة تسمية عمود "${key}" في الجدول (${tableId})` })
}

export async function removeColumn(tableId: string, key: string): Promise<void> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT columns FROM workspace_tables WHERE id = ?', tableId)
  if (!t) return
  const columns = safeJson<WorkspaceColumn[]>(t.columns, []).filter((c) => c.key !== key)
  if (columns.length === safeJson<WorkspaceColumn[]>(t.columns, []).length) return
  await d.runAsync('UPDATE workspace_tables SET columns = ? WHERE id = ?', JSON.stringify(columns), tableId)
  const rows = await d.getAllAsync<any>('SELECT id, data FROM workspace_rows WHERE table_id = ?', tableId)
  for (const r of rows) {
    const v = safeJson<Record<string, string>>(r.data, {})
    if (key in v) {
      delete v[key]
      await d.runAsync('UPDATE workspace_rows SET data = ? WHERE id = ?', JSON.stringify(v), r.id)
    }
  }
  await logChange({ action: 'update', scope: 'workspace_table', scopeId: tableId, before: { removed_key: key }, summary: `حذف عمود "${key}" من الجدول (${tableId})` })
}

// ---------- الصفوف ----------

export async function getRow(rowId: string): Promise<any | null> {
  const d = await db()
  const r = await d.getFirstAsync<any>('SELECT * FROM workspace_rows WHERE id = ?', rowId)
  if (!r) return null
  return {
    id: r.id,
    tableId: r.table_id,
    workspaceId: r.workspace_id,
    values: safeJson<Record<string, string>>(r.data, {}),
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
  }
}

export async function setTableColumns(tableId: string, columns: WorkspaceColumn[]): Promise<void> {
  const d = await db()
  const before = await d.getFirstAsync<any>('SELECT columns FROM workspace_tables WHERE id = ?', tableId)
  await d.runAsync('UPDATE workspace_tables SET columns = ? WHERE id = ?', JSON.stringify(columns), tableId)
  await logChange({ action: 'update', scope: 'workspace_table', scopeId: tableId, before: { columns: before?.columns }, after: { columns }, summary: `ضبط أعمدة الجدول (${tableId})` })
}

export async function createRow(tableId: string, values: Record<string, any>): Promise<string> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT workspace_id FROM workspace_tables WHERE id = ?', tableId)
  if (!t) throw new Error('الجدول غير موجود: table_id غير صالح (قد يكون معرف مساحة العمل أو الصف — تأكد من إرسال معرف جدول فعلي)')
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    if (v == null) clean[k] = ''
    else clean[k] = typeof v === 'string' ? v : String(v)
  }
  // تجاوز التكرار: إذا وُجد صف مطابق تماماً للقيم نفسها فلا ننشئ مزيّفاً، بل نعيد
  // المعرف الموجود — يمنع الوكيلَ من تكديس صفوف مكررة عند إعادة الإضافة.
  const dup = await findDuplicateRow(d, tableId, clean)
  if (dup) {
    await logChange({ action: 'dedupe', scope: 'workspace_row', scopeId: dup.id, after: { table_id: tableId, values: clean }, summary: `تجاهل إضافة صف مكرر للجدول (${tableId})` })
    return dup.id
  }
  const id = genId()
  const now = Date.now()
  await d.runAsync(
    'INSERT INTO workspace_rows (id, table_id, workspace_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    tableId,
    t.workspace_id,
    JSON.stringify(clean),
    now,
    now
  )
  await touchWorkspace(t.workspace_id)
  await logChange({ action: 'create', scope: 'workspace_row', scopeId: id, after: { table_id: tableId, values: clean }, summary: `إضافة صف للجدول (${tableId})` })
  return id
}

/** البحث عن صف مكرر بقيم مطابقة تماماً للقيم المعطاة داخل جدول — لتفادي التكرار. */
async function findDuplicateRow(d: SQLite.SQLiteDatabase, tableId: string, clean: Record<string, string>): Promise<{ id: string; data: string } | null> {
  const rows = await d.getAllAsync<{ id: string; data: string }>('SELECT id, data FROM workspace_rows WHERE table_id = ?', tableId)
  const target = JSON.stringify(clean)
  for (const r of rows) {
    if (JSON.stringify(safeJson<Record<string, string>>(r.data, {})) === target) return r
  }
  return null
}

/** فحص سريع: هل يوجد صف بنفس القيم تماماً في الجدول؟ يُستخدم للكشف عن التكرار قبل الإضافة. */
export async function findRowByValues(tableId: string, values: Record<string, any>): Promise<string | null> {
  const d = await db()
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    clean[k] = v == null ? '' : typeof v === 'string' ? v : String(v)
  }
  const dup = await findDuplicateRow(d, tableId, clean)
  return dup ? dup.id : null
}

export async function updateRow(rowId: string, values: Record<string, any>): Promise<void> {
  const d = await db()
  const r = await d.getFirstAsync<any>('SELECT data, table_id FROM workspace_rows WHERE id = ?', rowId)
  if (!r) throw new Error('الصف غير موجود')
  const merged: Record<string, string> = { ...safeJson<Record<string, string>>(r.data, {}) }
  for (const [k, v] of Object.entries(values ?? {})) {
    merged[k] = v == null ? '' : typeof v === 'string' ? v : String(v)
  }
  await d.runAsync('UPDATE workspace_rows SET data = ?, updated_at = ? WHERE id = ?', JSON.stringify(merged), Date.now(), rowId)
  const t = await d.getFirstAsync<any>('SELECT workspace_id FROM workspace_tables WHERE id = ?', r.table_id)
  if (t) await touchWorkspace(t.workspace_id)
  await logChange({ action: 'update', scope: 'workspace_row', scopeId: rowId, before: { values: safeJson<Record<string, string>>(r.data, {}) }, after: { values: merged }, summary: `تعديل صف (${rowId})` })
}

export async function deleteRow(rowId: string): Promise<void> {
  const d = await db()
  const r = await d.getFirstAsync<any>('SELECT workspace_id, table_id, data FROM workspace_rows WHERE id = ?', rowId)
  await d.runAsync('DELETE FROM workspace_rows WHERE id = ?', rowId)
  if (r) await touchWorkspace(r.workspace_id)
  await logChange({ action: 'delete', scope: 'workspace_row', scopeId: rowId, before: r ? { values: safeJson<Record<string, string>>(r.data, {}) } : null, summary: `حذف صف (${rowId})` })
}

export async function bulkInsertRows(tableId: string, rows: (string | number)[][] | Record<string, any>[], columns?: WorkspaceColumn[]): Promise<{ inserted: number; skipped: number; rowIds: string[] }> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT workspace_id, columns FROM workspace_tables WHERE id = ?', tableId)
  if (!t) throw new Error('الجدول غير موجود')
  const cols = columns ?? safeJson<WorkspaceColumn[]>(t.columns, [])

  // القيم الموجودة بالفعل في الجدول — نقارن بها لتفادي إعادة إدخال صفوف مكررة
  const existingSig = new Set<string>()
  const existing = await d.getAllAsync<{ data: string }>('SELECT data FROM workspace_rows WHERE table_id = ?', tableId)
  for (const r of existing) existingSig.add(JSON.stringify(safeJson<Record<string, string>>(r.data, {})))

  const now = Date.now()
  const seen = new Set<string>()
  const prepared: { id: string; json: string }[] = []
  let skipped = 0
  for (const row of rows) {
    let values: Record<string, string> = {}
    if (Array.isArray(row)) {
      row.forEach((v, i) => {
        if (cols[i]) values[cols[i].key] = v == null ? '' : String(v)
      })
    } else {
      for (const [k, v] of Object.entries(row ?? {})) {
        values[k] = v == null ? '' : typeof v === 'string' ? v : String(v)
      }
    }
    if (!Object.keys(values).some((k) => values[k] !== '')) continue
    const sig = JSON.stringify(values)
    // تجاهل الصفوف المكررة: المطابقة للقيم الموجودة، أو المتكررة داخل الدفعة نفسها
    if (existingSig.has(sig) || seen.has(sig)) {
      skipped++
      continue
    }
    seen.add(sig)
    prepared.push({ id: genId(), json: sig })
  }

  let inserted = 0
  const COL_COUNT = 6
  const CHUNK = 120 // عدد الصفوف لكل جملة INSERT (6 أعمدة × 120 = 720 معامل)
  await d.withTransactionAsync(async () => {
    for (let i = 0; i < prepared.length; i += CHUNK) {
      const chunk = prepared.slice(i, i + CHUNK)
      const placeholders = chunk.map(() => `(?,?,?,?,?,?)`).join(', ')
      const flat: any[] = []
      for (const p of chunk) {
        flat.push(p.id, tableId, t.workspace_id, p.json, now, now)
      }
      await d.runAsync(
        `INSERT INTO workspace_rows (id, table_id, workspace_id, data, created_at, updated_at) VALUES ${placeholders}`,
        ...flat
      )
      inserted += chunk.length
    }
  })
  await touchWorkspace(t.workspace_id)
  if (inserted > 0) {
    await logChange({ action: 'import', scope: 'workspace_table', scopeId: tableId, after: { inserted, skipped }, summary: `استيراد ${inserted} صف للجدول (${tableId}) (تجاهل ${skipped} مكرر)` })
  }
  return { inserted, skipped, rowIds: prepared.map((p) => p.id) }
}

async function touchWorkspace(workspaceId: string): Promise<void> {
  const d = await db()
  await d.runAsync('UPDATE workspaces SET updated_at = ? WHERE id = ?', Date.now(), workspaceId)
}

// ---------- قدرات الجداول المتقدمة ----------

/** تعديل تعريف عمود (مفتاح/ملصق/نوع) مع ترحيل قيم صفوفه عند تغيّر المفتاح. */
export async function setColumnMeta(tableId: string, key: string, patch: { new_key?: string; new_label?: string; type?: string }): Promise<void> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT columns FROM workspace_tables WHERE id = ?', tableId)
  if (!t) throw new Error('الجدول غير موجود')
  const columns = safeJson<WorkspaceColumn[]>(t.columns, [])
  const col = columns.find((c) => c.key === key)
  if (!col) return
  const finalKey = patch.new_key || key
  if (patch.new_label) col.label = patch.new_label
  if (patch.type) col.type = (patch.type as ColumnType) ?? col.type
  col.key = finalKey
  await d.runAsync('UPDATE workspace_tables SET columns = ? WHERE id = ?', JSON.stringify(columns), tableId)
  const rows = await d.getAllAsync<any>('SELECT id, data FROM workspace_rows WHERE table_id = ?', tableId)
  for (const r of rows) {
    const v = safeJson<Record<string, string>>(r.data, {})
    if (key in v) {
      v[finalKey] = v[key] ?? ''
      if (finalKey !== key) delete v[key]
      await d.runAsync('UPDATE workspace_rows SET data = ? WHERE id = ?', JSON.stringify(v), r.id)
    }
  }
  await logChange({ action: 'update', scope: 'workspace_table', scopeId: tableId, before: { key }, after: patch, summary: `تعديل تعريف عمود "${key}" في الجدول (${tableId})` })
}

/** إنشاء جدول متكامل دفعة واحدة: هيكل + بيانات أولية. */
export async function createFullTable(
  workspaceId: string,
  name: string,
  columns: (string | (Partial<WorkspaceColumn> & { label: string }))[],
  rows?: Record<string, any>[] | (string | number)[][]
): Promise<{ tableId: string; inserted: number }> {
  const tableId = await createTable(workspaceId, name, columns)
  if (rows && rows.length) {
    const ins = await bulkInsertRows(tableId, rows)
    return { tableId, inserted: ins.inserted }
  }
  return { tableId, inserted: 0 }
}

/** نسخ جدول كامل (هيكل + صفوف) إلى جدول جديد. */
export async function duplicateTable(tableId: string, name?: string, targetWorkspaceId?: string): Promise<{ id: string; name: string }> {
  const d = await db()
  const t = await d.getFirstAsync<any>('SELECT workspace_id, name, columns FROM workspace_tables WHERE id = ?', tableId)
  if (!t) throw new Error('الجدول غير موجود')
  const destinationWorkspaceId = targetWorkspaceId ?? t.workspace_id
  const destination = await d.getFirstAsync<{ id: string }>('SELECT id FROM workspaces WHERE id = ?', destinationWorkspaceId)
  if (!destination) throw new Error('مساحة العمل الهدف غير موجودة')
  const newName = name || `${t.name ?? 'جدول'} (نسخة)`
  const newId = await createTable(destinationWorkspaceId, newName, safeJson<WorkspaceColumn[]>(t.columns, []))
  const rows = await d.getAllAsync<any>('SELECT data FROM workspace_rows WHERE table_id = ?', tableId)
  if (rows.length) await bulkInsertRows(newId, rows.map((r) => safeJson<Record<string, string>>(r.data, {})))
  return { id: newId, name: newName }
}

/** نسخ مساحة عمل كاملة بكل جداولها وصفوفها إلى مساحة جديدة. */
export async function duplicateWorkspace(workspaceId: string, name?: string): Promise<{ id: string; name: string; tables: number }> {
  const d = await db()
  const w = await d.getFirstAsync<any>('SELECT * FROM workspaces WHERE id = ?', workspaceId)
  if (!w) throw new Error('مساحة العمل غير موجودة')
  const baseName = name || `${(w.name ?? 'مساحة').trim()} (نسخة)`
  let newName = baseName
  let suffix = 2
  while (await d.getFirstAsync<{ id: string }>('SELECT id FROM workspaces WHERE name = ? COLLATE NOCASE LIMIT 1', newName)) {
    newName = `${baseName} ${suffix++}`
  }
  const newId = await createWorkspace({ name: newName, description: w.description ?? '' })
  const tables = await d.getAllAsync<any>('SELECT id, name FROM workspace_tables WHERE workspace_id = ?', workspaceId)
  for (const t of tables) {
    await duplicateTable(t.id, t.name, newId)
  }
  return { id: newId, name: newName, tables: tables.length }
}

// ---------- المرفقات ----------

export async function saveAttachment(data: { sessionId: string; name: string; uri: string; size: number; mime?: string }): Promise<void> {
  const d = await db()
  const id = genId()
  await d.runAsync('INSERT INTO agent_attachments (id, session_id, name, uri, size, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, data.sessionId, data.name, data.uri, data.size ?? 0, data.mime ?? null, Date.now())
  await logChange({ action: 'create', scope: 'attachment', scopeId: data.name, after: { session_id: data.sessionId, name: data.name, size: data.size ?? 0 }, summary: `رفع مرفق "${data.name}"` })
}

export async function listAttachments(): Promise<AttachmentRecord[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>('SELECT * FROM agent_attachments ORDER BY created_at DESC LIMIT 100')
  return rows.map((r: any) => ({
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    uri: r.uri,
    size: r.size ?? 0,
    mime: r.mime ?? null,
    createdAt: r.created_at ?? 0,
  }))
}

function parseMediaList(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value as Record<string, any>[]
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function linkAttachmentToEntity(input: { attachmentId?: string; attachmentName?: string; targetType: MediaTargetType; targetId: string }): Promise<{ link: EntityMediaLink; target: { type: MediaTargetType; id: string; name: string } }> {
  const d = await db()
  const targetTable = input.targetType === 'property' ? 'properties' : 'offers'
  const target = await d.getFirstAsync<any>(`SELECT id, name, media FROM ${targetTable}${input.targetType === 'offer' ? ' WHERE id = ?' : ' WHERE id = ?'}`, input.targetId)
  if (!target) throw new Error(input.targetType === 'property' ? 'العقار الهدف غير موجود.' : 'العرض الهدف غير موجود.')

  const all = await listAttachments()
  const candidates = input.attachmentId
    ? all.filter((item) => item.id === input.attachmentId)
    : all.filter((item) => item.name === String(input.attachmentName || '').trim())
  if (!candidates.length) throw new Error('المرفق المطلوب غير موجود في مرفقات المحادثة.')
  if (candidates.length > 1) throw new Error('يوجد أكثر من مرفق مطابق؛ استخدم اسم الملف الكامل أو معرف المرفق.')
  const attachment = candidates[0]
  const existing = await d.getFirstAsync<any>('SELECT * FROM entity_media WHERE source_attachment_id = ? AND entity_type = ? AND entity_id = ?', attachment.id, input.targetType, input.targetId)
  if (existing) {
    return {
      link: { id: existing.id, sourceAttachmentId: existing.source_attachment_id, targetType: existing.entity_type, targetId: existing.entity_id, name: existing.name, uri: existing.uri, size: existing.size ?? 0, mime: existing.mime ?? null, createdAt: existing.created_at ?? 0 },
      target: { type: input.targetType, id: target.id, name: target.name ?? (input.targetType === 'offer' ? 'العرض' : 'العقار') },
    }
  }

  const media = parseMediaList(target.media)
  const asset = { id: attachment.id, sourceAttachmentId: attachment.id, name: attachment.name, uri: attachment.uri, size: attachment.size, mime: attachment.mime, linkedAt: new Date().toISOString() }
  const linkId = genId()
  await d.withTransactionAsync(async () => {
    await d.runAsync('INSERT INTO entity_media (id, source_attachment_id, entity_type, entity_id, name, uri, size, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', linkId, attachment.id, input.targetType, input.targetId, attachment.name, attachment.uri, attachment.size ?? 0, attachment.mime ?? '', Date.now())
    await d.runAsync(`UPDATE ${targetTable} SET media = ? WHERE id = ?`, JSON.stringify([...media, asset]), input.targetId)
  })
  await logChange({ action: 'update', scope: input.targetType, scopeId: input.targetId, after: { mediaAttachmentId: attachment.id, mediaName: attachment.name }, summary: `ربط الوسيط "${attachment.name}" بـ${input.targetType === 'offer' ? 'العرض' : 'العقار'}` })
  return {
    link: { id: linkId, sourceAttachmentId: attachment.id, targetType: input.targetType, targetId: input.targetId, name: attachment.name, uri: attachment.uri, size: attachment.size ?? 0, mime: attachment.mime ?? null, createdAt: Date.now() },
    target: { type: input.targetType, id: target.id, name: target.name ?? (input.targetType === 'offer' ? 'العرض' : 'العقار') },
  }
}

function findAttachment(attachments: AttachmentRecord[], name: string): AttachmentRecord | undefined {
  const n = name.trim()
  return (
    attachments.find((a) => a.name === n) ??
    attachments.find((a) => a.name.toLowerCase().endsWith((n || '').toLowerCase())) ??
    attachments.find((a) => a.name.toLowerCase().includes((n || '').toLowerCase()))
  )
}

async function getAttachmentByName(name: string): Promise<AttachmentRecord | null> {
  const all = await listAttachments()
  const found = findAttachment(all, name)
  return found ?? null
}

export function extensionOf(name: string): string {
  const m = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

// ---------- فك ترميز ----------

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ---------- قراءة الملفات المرفوعة ----------

export async function filePreview(name: string, maxTextChars = 4000, maxRows = 50): Promise<{ contentType: string; text: string }> {
  const att = await getAttachmentByName(name)
  if (!att) return { contentType: 'missing', text: `لا يوجد مرفق باسم "${name}". استخدم list_attachments لرؤية المرفقات المتاحة.` }
  const ext = extensionOf(att.name)
  const base64 = await FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 })
  if (ext === 'xlsx' || ext === 'xls') {
    return excelPreview(att.name, base64, maxRows)
  }
  if (ext === 'csv') {
    const { Workbook } = await import('exceljs/dist/exceljs.bare.js')
    void Workbook
    const b64 = await FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 })
    const utf8 = atob(b64)
    const lines = utf8.split(/\r?\n/).filter((l) => l.trim())
    const previewLines = lines.slice(0, maxRows)
    const text = ['ملف CSV مرفوع:', `عدد الأسطر: ${lines.length}`, '---', previewLines.join('\n')].join('\n')
    return { contentType: 'csv', text: text.slice(0, maxTextChars * 2) }
  }
  try {
    const utf8 = await FileSystem.readAsStringAsync(att.uri)
    return {
      contentType: 'text',
      text: `محتوى الملف "${att.name}":\n${utf8.slice(0, maxTextChars)}`,
    }
  } catch {
    return {
      contentType: 'binary',
      text: `ملف ثنائي "${att.name}" (${(att.size / 1024).toFixed(0)} كيلوبايت). يمكن استيراده إن كان Excel/CSV عبر import_project_file.`,
    }
  }
}

async function workbookFromBase64(base64: string): Promise<any> {
  const { Workbook } = await import('exceljs/dist/exceljs.bare.js')
  const wb = new Workbook()
  try {
    await wb.xlsx.load(base64ToBytes(base64) as any)
    return wb
  } catch (e: any) {
    throw new Error(`تعذر قراءة ملف Excel: ${e?.message ?? 'صيغة غير مدعومة'}`)
  }
}

function sheetToTableData(worksheet: any, sheetRowsCap = 8000): { name: string; columns: string[]; rows: (string | number)[][] } | null {
  let values: any[][] = []
  try {
    const rows = worksheet.getSheetValues() as any[][]
    for (const row of rows) {
      if (!row) continue
      values.push(Array.from({ length: row.length }, (_, i) => row[i + 1]))
    }
  } catch {
    return null
  }
  values = values.filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
  if (!values.length) return null
  const header = values[0].map((c) => String(c ?? '').trim())
  const dataRows = values.slice(1, sheetRowsCap + 1)
  return { name: worksheet.name || 'جدول', columns: header, rows: dataRows }
}

async function excelPreview(name: string, base64: string, maxRows: number): Promise<{ contentType: string; text: string }> {
  try {
    const wb = await workbookFromBase64(base64)
    const out: string[] = [`ملف Excel مرفوع: ${name}`, `عدد الأوراق: ${wb.worksheets.length}`]
    wb.worksheets.forEach((ws: any, i: number) => {
      const data = sheetToTableData(ws, 30)
      out.push(`\n=== ورقة ${i + 1}: ${ws.name} ===`)
      if (!data) {
        out.push('(فارغة)')
        return
      }
      out.push(`أعمدة: ${data.columns.join(' | ')}`)
      out.push(`أول ${Math.min(5, data.rows.length)} صفوف:`)
      data.rows.slice(0, 5).forEach((r) => out.push(r.map((c) => String(c ?? '')).join(' | ')))
    })
    return { contentType: 'xlsx', text: out.join('\n').slice(0, 8000) }
  } catch (e: any) {
    return { contentType: 'xlsx', text: `تعذر معاينة الملف: ${e?.message ?? 'خطأ'}` }
  }
}

// ---------- استيراد المشروع من الملفات ----------

export interface ImportResult {
  workspaceId: string
  workspaceName: string
  tables: { name: string; rowCount: number; columns: string[] }[]
}

export async function importProjectFile(name: string, opts?: { workspaceName?: string; maxRowsPerSheet?: number }): Promise<ImportResult> {
  const att = await getAttachmentByName(name)
  if (!att) throw new Error(`لا يوجد مرفق باسم "${name}"`)
  const ext = extensionOf(att.name)
  const base = String(opts?.workspaceName ?? att.name).replace(/\.[a-z0-9]+$/i, '')
  const workspaceId = await createWorkspace({
    name: base,
    description: `مستورد من الملف "${att.name}"`,
    origin: 'import',
    sourceFile: att.name,
  })

  const tables: ImportResult['tables'] = []

  if (ext === 'xlsx' || ext === 'xls') {
    const base64 = await FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 })
    const wb = await workbookFromBase64(base64)
    for (const ws of wb.worksheets) {
      const data = sheetToTableData(ws, opts?.maxRowsPerSheet ?? 8000)
      if (!data) continue
      const tableId = await createTable(workspaceId, data.name ?? 'جدول', data.columns.map((c) => c || 'عمود'))
      await bulkInsertRows(tableId, data.rows)
      tables.push({ name: data.name ?? 'جدول', rowCount: data.rows.length, columns: data.columns })
    }
    if (!tables.length) throw new Error('لم يتم العثور على بيانات قابلة للاستيراد في ملف الـ Excel')
  } else if (ext === 'csv') {
    const b64 = await FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 })
    const lines = atob(b64).split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 1) throw new Error('ملف CSV فارغ')
    const parseLine = (line: string): string[] => {
      const out: string[] = []
      let cur = ''
      let inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQ) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              cur += '"'
              i++
            } else inQ = false
          } else cur += ch
        } else if (ch === '"') {
          inQ = true
        } else if (ch === ',') {
          out.push(cur.trim())
          cur = ''
        } else cur += ch
      }
      out.push(cur.trim())
      return out
    }
    const header = parseLine(lines[0]).map((c) => c || 'عمود')
    const tableId = await createTable(workspaceId, 'الملف', header.map((c) => c || 'عمود'))
    const rows = lines.slice(1, (opts?.maxRowsPerSheet ?? 8000) + 1).map(parseLine)
    await bulkInsertRows(tableId, rows)
    tables.push({ name: 'الملف', rowCount: rows.length, columns: header })
  } else {
    await deleteWorkspace(workspaceId)
    throw new Error('صيغة غير مدعومة للاستيراد — ارفع ملف Excel (.xlsx) أو CSV')
  }

  await logChange({ action: 'import', scope: 'workspace', scopeId: workspaceId, after: { tables: tables.map((t) => ({ name: t.name, rowCount: t.rowCount })) }, summary: `استيراد مشروع "${base}" من الملف "${att.name}" (${tables.length} جدول، ${tables.reduce((s, t) => s + t.rowCount, 0)} صف)` })

  return { workspaceId, workspaceName: base, tables }
}

/** حذف مرفق باسمه. */
export async function removeAttachment(name: string): Promise<boolean> {
  const att = await getAttachmentByName(name)
  if (!att) return false
  const d = await db()
  await d.runAsync('DELETE FROM agent_attachments WHERE id = ?', att.id)
  try {
    await FileSystem.deleteAsync(att.uri, { idempotent: true })
  } catch {}
  await logChange({ action: 'delete', scope: 'attachment', scopeId: name, before: { name, size: att.size }, summary: `حذف مرفق "${name}"` })
  return true
}

// ---------- الملفات المولّدة من الوكيل (يستطيع مراجعتها لاحقاً) ----------

export interface GeneratedFileRecord {
  id: string
  sessionId: string
  name: string
  uri: string
  format: string
  size: number
  createdAt: number
}

/** تسجيل ملف وُلّد للتو حتى يستطيع الوكيل قراءته ومراجعته لاحقاً. */
export async function registerGeneratedFile(args: { sessionId: string; name: string; uri: string; format: string }): Promise<void> {
  const d = await db()
  let size = 0
  try {
    const info = await FileSystem.getInfoAsync(args.uri)
    if (info.exists && 'size' in info) size = info.size ?? 0
  } catch {}
  await d.runAsync(
    'INSERT INTO agent_generated_files (id, session_id, name, uri, format, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    genId(), args.sessionId, args.name, args.uri, args.format || 'file', size, Date.now()
  )
}

/** قائمة الملفات المولّدة (كل الجلسات) — الأحدث أولاً. */
export async function listGeneratedFiles(limit = 50): Promise<GeneratedFileRecord[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(
    'SELECT * FROM agent_generated_files ORDER BY created_at DESC LIMIT ?',
    limit
  )
  return rows.map((r: any) => ({
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    uri: r.uri,
    format: r.format ?? 'file',
    size: r.size ?? 0,
    createdAt: r.created_at ?? 0,
  }))
}

function findGeneratedFile(files: GeneratedFileRecord[], name: string): GeneratedFileRecord | undefined {
  const n = name.trim()
  return (
    files.find((f) => f.name === n) ??
    files.find((f) => f.name.toLowerCase().endsWith((n || '').toLowerCase())) ??
    files.find((f) => f.name.toLowerCase().includes((n || '').toLowerCase()))
  )
}

/** فحص صحة ملف مولّد فعلياً: وجوده، حجمه، وقراءة محتواه حسب الصيغة. */
export async function reviewGeneratedFile(name: string): Promise<{ ok: boolean; contentType: string; text: string }> {
  const all = await listGeneratedFiles(200)
  const rec = findGeneratedFile(all, name)
  if (!rec) {
    return {
      ok: false,
      contentType: 'missing',
      text: `لا يوجد ملف مولّد باسم "${name}". استخدم list_generated_files لرؤية الملفات المولّدة المتاحة.`,
    }
  }
  let exists = false
  let size = 0
  try {
    const info = await FileSystem.getInfoAsync(rec.uri)
    exists = info.exists
    if (info.exists && 'size' in info) size = info.size ?? 0
  } catch {}
  if (!exists) {
    return { ok: false, contentType: 'missing', text: `الملف "${rec.name}" مسجّل لكن مساره غير موجود على الجهاز (${rec.uri}).` }
  }
  const fmt = (rec.format || '').toLowerCase()
  const ext = extensionOf(rec.name)
  if (ext === 'xlsx' || ext === 'xls' || fmt === 'excel' || fmt === 'xlsx') {
    try {
      const base64 = await FileSystem.readAsStringAsync(rec.uri, { encoding: FileSystem.EncodingType.Base64 })
      const wb = await workbookFromBase64(base64)
      const out: string[] = [`[تحقق] الملف "${rec.name}" سليم — ${(size / 1024).toFixed(1)} كيلوبايت.`, `عدد الأوراق: ${wb.worksheets.length}`]
      wb.worksheets.forEach((ws: any, i: number) => {
        const data = sheetToTableData(ws, 15)
        out.push(`\n=== ورقة ${i + 1}: ${ws.name} ===`)
        if (!data) { out.push('(فارغة)'); return }
        out.push(`أعمدة: ${data.columns.join(' | ')}`)
        data.rows.slice(0, 8).forEach((r) => out.push(r.map((c) => String(c ?? '')).join(' | ')))
      })
      return { ok: true, contentType: 'xlsx', text: out.join('\n').slice(0, 9000) }
    } catch (e: any) {
      return { ok: false, contentType: 'xlsx', text: `[فشل] الملف "${rec.name}" لا يُقرأ كـ Excel: ${e?.message ?? String(e)}` }
    }
  }
  if (ext === 'csv' || fmt === 'csv') {
    try {
      const b64 = await FileSystem.readAsStringAsync(rec.uri, { encoding: FileSystem.EncodingType.Base64 })
      const utf8 = atob(b64)
      const lines = utf8.split(/\r?\n/).filter((l) => l.trim())
      return {
        ok: true,
        contentType: 'csv',
        text: `[تحقق] الملف "${rec.name}" سليم — ${(size / 1024).toFixed(1)} كيلوبايت، ${lines.length} سطر.\n${lines.slice(0, 30).join('\n')}`.slice(0, 9000),
      }
    } catch (e: any) {
      return { ok: false, contentType: 'csv', text: `[فشل] الملف "${rec.name}" لا يُقرأ كـ CSV: ${e?.message ?? String(e)}` }
    }
  }
  if (ext === 'pdf' || fmt === 'pdf') {
    try {
      const base64 = await FileSystem.readAsStringAsync(rec.uri, { encoding: FileSystem.EncodingType.Base64 })
      const head = base64.slice(0, 5).toUpperCase()
      const valid = head === '%PDF-'
      return {
        ok: valid,
        contentType: 'pdf',
        text: valid
          ? `[تحقق] الملف "${rec.name}" PDF سليم — ${(size / 1024).toFixed(1)} كيلوبايت، رأس صالح (%PDF).`
          : `[فشل] الملف "${rec.name}" ليس PDF صالحاً (رأس غير مطابق).`,
      }
    } catch (e: any) {
      return { ok: false, contentType: 'pdf', text: `[فشل] تعذر قراءة الملف PDF: ${e?.message ?? String(e)}` }
    }
  }
  if (ext === 'docx' || ext === 'doc' || fmt === 'word' || fmt === 'docx') {
    try {
      const base64 = await FileSystem.readAsStringAsync(rec.uri, { encoding: FileSystem.EncodingType.Base64 })
      const valid = base64.slice(0, 2) === 'UE' && base64.includes('eG1s')
      return {
        ok: valid,
        contentType: 'word',
        text: valid
          ? `[تحقق] الملف "${rec.name}" Word سليم — ${(size / 1024).toFixed(1)} كيلوبايت، بنية DOCX صالحة (ZIP بمحتوى XML).`
          : `[فشل] الملف "${rec.name}" ليس مستند Word صالحاً.`,
      }
    } catch (e: any) {
      return { ok: false, contentType: 'word', text: `[فشل] تعذر قراءة الملف Word: ${e?.message ?? String(e)}` }
    }
  }
  try {
    const utf8 = await FileSystem.readAsStringAsync(rec.uri)
    return { ok: true, contentType: 'text', text: `[تحقق] الملف "${rec.name}" سليم — ${(size / 1024).toFixed(1)} كيلوبايت.\n${utf8.slice(0, 6000)}` }
  } catch {
    return { ok: false, contentType: 'binary', text: `[فشل] الملف "${rec.name}" ثنائي ولا يُقرأ كنص (${(size / 1024).toFixed(1)} كيلوبايت).` }
  }
}

// ---------- ذاكرة مشروع الوكيل (خفيّة عن المستخدم) ----------

export interface ProjectMemoryEntry {
  id: string
  workspaceId: string
  kind: string
  body: string
  createdAt: number
  updatedAt: number
}

/** إضافة سطر ذاكرة للمشروع — يكتبه الوكيل ليفهم بنية المشروع في أي جلسة لاحقة. */
export async function addProjectMemory(workspaceId: string, kind: string, body: string): Promise<string> {
  const d = await db()
  const id = genId()
  const now = Date.now()
  await d.runAsync(
    'INSERT INTO project_memory (id, workspace_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, workspaceId, kind, String(body ?? ''), now, now
  )
  return id
}

/** قراءة كل ذاكرة المشروع مرتبة من الأقدم للأحدث. */
export async function listProjectMemory(workspaceId: string, limit = 60): Promise<ProjectMemoryEntry[]> {
  const d = await db()
  const rows = await d.getAllAsync<any>(
    'SELECT * FROM project_memory WHERE workspace_id = ? ORDER BY created_at ASC LIMIT ?',
    workspaceId, limit
  )
  return rows.map((r: any) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind ?? '',
    body: r.body ?? '',
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
  }))
}

/** مسح ذاكرة المشروع (ترتيب مؤكد عند طلب الوكيل). */
export async function clearProjectMemory(workspaceId: string): Promise<void> {
  const d = await db()
  await d.runAsync('DELETE FROM project_memory WHERE workspace_id = ?', workspaceId)
}

/** حذف مذكرة واحدة بمعرفها — تُستخدم من الواجهة لتحكم المستخدم في ملاحظات الوكيل. */
export async function deleteProjectMemoryEntry(id: string): Promise<void> {
  const d = await db()
  await d.runAsync('DELETE FROM project_memory WHERE id = ?', id)
}

/** نص مختصر جاهز لحقنه في سياق الموديل عند العمل على مشروع. */
export async function projectMemorySummary(workspaceId: string): Promise<string> {
  const entries = await listProjectMemory(workspaceId)
  if (!entries.length) return ''
  const lines = entries.map((e) => `[${e.kind}] ${e.body}`)
  return `ذاكرة بنية هذا المشروع (كتبها الوكيل في جلسات سابقة):\n${lines.join('\n')}`
}