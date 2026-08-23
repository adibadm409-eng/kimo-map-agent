import * as FileSystem from 'expo-file-system/legacy'
import { getDB } from '../database/db'
import { saveAttachment } from '../database/workspace'
import type { AssetKind, AssetState } from '../database/workspace'
import type { AssetRef, InputAssetDraft } from './inputEnvelope'

export interface AssetDerivativeInput {
  id?: string
  assetId: string
  kind: string
  uri?: string
  mime?: string
  byteSize?: number
  checksum?: string
  state?: 'available' | 'processing' | 'failed' | 'purged'
  summary?: string
  metadata?: Record<string, unknown>
}

export interface AssetDerivative extends AssetDerivativeInput {
  id: string
  createdAt: number
  updatedAt: number
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let assetSchemaReady: Promise<void> | null = null

async function ensureAssetSchema(): Promise<void> {
  if (!assetSchemaReady) {
    assetSchemaReady = (async () => {
      const database = await getDB()
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS agent_assets (
          id TEXT PRIMARY KEY,
          attachment_id TEXT NOT NULL UNIQUE,
          session_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'unknown',
          name TEXT NOT NULL,
          mime TEXT DEFAULT '',
          byte_size INTEGER NOT NULL DEFAULT 0,
          local_uri TEXT NOT NULL,
          sha256 TEXT DEFAULT '',
          state TEXT NOT NULL DEFAULT 'captured',
          source TEXT DEFAULT 'user',
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (attachment_id) REFERENCES agent_attachments (id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS agent_asset_derivatives (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          uri TEXT,
          mime TEXT DEFAULT '',
          byte_size INTEGER DEFAULT 0,
          checksum TEXT DEFAULT '',
          state TEXT NOT NULL DEFAULT 'available',
          summary TEXT DEFAULT '',
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (asset_id) REFERENCES agent_assets (id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_agent_assets_session ON agent_assets (session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_assets_state ON agent_assets (state, updated_at);
        CREATE INDEX IF NOT EXISTS idx_agent_asset_derivatives_asset ON agent_asset_derivatives (asset_id, created_at);
      `)
    })().catch((error) => {
      assetSchemaReady = null
      throw error
    })
  }
  await assetSchemaReady
}

function inferMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'm4a') return 'audio/mp4'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === 'xls') return 'application/vnd.ms-excel'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'txt' || ext === 'md') return 'text/plain'
  return 'application/octet-stream'
}

function inferKind(name: string, mime: string): AssetKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.includes('spreadsheet') || /\.(xlsx?|csv)$/i.test(name)) return 'spreadsheet'
  if (mime.startsWith('text/')) return 'text'
  if (mime !== 'application/octet-stream') return 'document'
  return 'unknown'
}

async function fileInfo(uri: string): Promise<{ exists: boolean; size: number; localUri: string }> {
  if (/^data:/i.test(uri)) {
    const comma = uri.indexOf(',')
    const payload = comma >= 0 ? uri.slice(comma + 1) : ''
    const size = /^data:[^,]+;base64,/i.test(uri)
      ? Math.max(0, Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0))
      : payload.length
    return { exists: true, size, localUri: uri }
  }
  const info = await FileSystem.getInfoAsync(uri)
  return {
    exists: info.exists,
    size: info.exists && 'size' in info ? info.size ?? 0 : 0,
    localUri: info.exists && 'uri' in info ? info.uri ?? uri : uri,
  }
}

export async function saveAsset(sessionId: string, draft: InputAssetDraft): Promise<AssetRef> {
  const name = (draft.name ?? draft.uri.split('/').pop() ?? 'ملف').trim() || 'ملف'
  const info = await fileInfo(draft.uri)
  if (!info.exists || info.size <= 0) throw new Error(`الأصل «${name}» غير موجود أو فارغ.`)
  const mime = draft.mime ?? inferMime(name)
  const kind = draft.kind ?? inferKind(name, mime)
  const now = Date.now()
  const attachmentId = await saveAttachment({
    sessionId,
    name,
    uri: info.localUri,
    size: draft.size ?? info.size,
    mime,
  })
  await ensureAssetSchema()
  const database = await getDB()
  await database.runAsync(
    `INSERT OR REPLACE INTO agent_assets
      (id, attachment_id, session_id, kind, name, mime, byte_size, local_uri, sha256, state, source, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    attachmentId,
    attachmentId,
    sessionId,
    kind,
    name,
    mime,
    draft.size ?? info.size,
    info.localUri,
    '',
    'stored',
    draft.source ?? 'user',
    JSON.stringify(draft.metadata ?? {}),
    now,
    now,
  )
  return {
    id: attachmentId,
    kind,
    name,
    mime,
    byteSize: draft.size ?? info.size,
    sha256: '',
    localUri: info.localUri,
    state: 'stored',
    source: draft.source ?? 'user',
    derivatives: [],
    metadata: draft.metadata,
    createdAt: now,
    updatedAt: now,
  }
}

export async function getAsset(assetId: string): Promise<AssetRef | null> {
  await ensureAssetSchema()
  const database = await getDB()
  const row = await database.getFirstAsync<any>('SELECT * FROM agent_assets WHERE id = ?', assetId)
  if (!row) return null
  const derivatives = await database.getAllAsync<any>('SELECT id FROM agent_asset_derivatives WHERE asset_id = ? ORDER BY created_at ASC', assetId)
  return mapAsset(row, derivatives.map((item) => item.id))
}

export async function listAssets(sessionId?: string): Promise<AssetRef[]> {
  await ensureAssetSchema()
  const database = await getDB()
  const rows = sessionId
    ? await database.getAllAsync<any>('SELECT * FROM agent_assets WHERE session_id = ? ORDER BY created_at DESC', sessionId)
    : await database.getAllAsync<any>('SELECT * FROM agent_assets ORDER BY created_at DESC')
  const output: AssetRef[] = []
  for (const row of rows) {
    const derivatives = await database.getAllAsync<any>('SELECT id FROM agent_asset_derivatives WHERE asset_id = ? ORDER BY created_at ASC', row.id)
    output.push(mapAsset(row, derivatives.map((item) => item.id)))
  }
  return output
}

export async function updateAssetState(assetId: string, state: AssetState, metadata?: Record<string, unknown>): Promise<void> {
  await ensureAssetSchema()
  const database = await getDB()
  const current = await database.getFirstAsync<any>('SELECT metadata FROM agent_assets WHERE id = ?', assetId)
  if (!current) throw new Error(`الأصل (${assetId}) غير موجود.`)
  let currentMetadata: Record<string, unknown> = {}
  try { currentMetadata = JSON.parse(current.metadata || '{}') } catch {}
  await database.runAsync(
    'UPDATE agent_assets SET state = ?, metadata = ?, updated_at = ? WHERE id = ?',
    state,
    JSON.stringify({ ...currentMetadata, ...(metadata ?? {}) }),
    Date.now(),
    assetId,
  )
}

export async function addAssetDerivative(input: AssetDerivativeInput): Promise<AssetDerivative> {
  await ensureAssetSchema()
  const database = await getDB()
  const asset = await database.getFirstAsync<{ id: string }>('SELECT id FROM agent_assets WHERE id = ?', input.assetId)
  if (!asset) throw new Error(`الأصل (${input.assetId}) غير موجود.`)
  const now = Date.now()
  const derivative: AssetDerivative = {
    ...input,
    id: input.id ?? id('derivative'),
    state: input.state ?? 'available',
    createdAt: now,
    updatedAt: now,
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO agent_asset_derivatives
      (id, asset_id, kind, uri, mime, byte_size, checksum, state, summary, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    derivative.id,
    derivative.assetId,
    derivative.kind,
    derivative.uri ?? null,
    derivative.mime ?? null,
    derivative.byteSize ?? 0,
    derivative.checksum ?? '',
    derivative.state ?? 'available',
    derivative.summary ?? '',
    JSON.stringify(derivative.metadata ?? {}),
    now,
    now,
  )
  return derivative
}

export async function listAssetDerivatives(assetId: string): Promise<AssetDerivative[]> {
  await ensureAssetSchema()
  const database = await getDB()
  const rows = await database.getAllAsync<any>('SELECT * FROM agent_asset_derivatives WHERE asset_id = ? ORDER BY created_at ASC', assetId)
  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    kind: row.kind,
    uri: row.uri ?? undefined,
    mime: row.mime ?? undefined,
    byteSize: row.byte_size ?? 0,
    checksum: row.checksum ?? '',
    state: row.state,
    summary: row.summary ?? '',
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function mapAsset(row: any, derivatives: string[]): AssetRef {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mime: row.mime ?? '',
    byteSize: row.byte_size ?? 0,
    sha256: row.sha256 ?? '',
    localUri: row.local_uri,
    state: row.state,
    source: row.source ?? 'user',
    derivatives,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
