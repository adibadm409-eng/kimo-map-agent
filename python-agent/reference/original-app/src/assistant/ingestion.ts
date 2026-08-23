import { File as ExpoFile } from 'expo-file-system'
import { getDB } from '../database/db'
import { addAssetDerivative, getAsset, listAssetDerivatives, updateAssetState } from './assetStore'

export type IngestionKind = 'manifest' | 'text_preview' | 'thumbnail' | 'transcript' | 'dataset_index'
export type IngestionStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface IngestionJob {
  id: string
  assetId: string
  kind: IngestionKind
  version: number
  status: IngestionStatus
  completedUnits: number
  totalUnits: number
  checkpoint: number
  resultRef?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface TextChunkPreview {
  content: string
  bytesRead: number
  lineCount: number
  truncated: boolean
}

let schemaPromise: Promise<void> | null = null

async function ensureIngestionSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const database = await getDB()
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS agent_ingestion_jobs (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'queued',
          completed_units INTEGER NOT NULL DEFAULT 0,
          total_units INTEGER NOT NULL DEFAULT 0,
          checkpoint INTEGER NOT NULL DEFAULT 0,
          result_ref TEXT,
          error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(asset_id, kind, version)
        );
        CREATE INDEX IF NOT EXISTS idx_agent_ingestion_asset ON agent_ingestion_jobs (asset_id, kind, updated_at);
        CREATE INDEX IF NOT EXISTS idx_agent_ingestion_status ON agent_ingestion_jobs (status, updated_at);
      `)
    })().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  await schemaPromise
}

function jobId(assetId: string, kind: IngestionKind, version: number): string {
  return `ing-${assetId}-${kind}-v${version}`
}

export async function getIngestionJob(assetId: string, kind: IngestionKind, version = 1): Promise<IngestionJob | null> {
  await ensureIngestionSchema()
  const database = await getDB()
  const row = await database.getFirstAsync<any>(
    'SELECT * FROM agent_ingestion_jobs WHERE asset_id = ? AND kind = ? AND version = ?',
    assetId,
    kind,
    version,
  )
  return row ? mapJob(row) : null
}

export async function queueIngestionJob(assetId: string, kind: IngestionKind, version = 1): Promise<IngestionJob> {
  await ensureIngestionSchema()
  const database = await getDB()
  const existing = await getIngestionJob(assetId, kind, version)
  if (existing && existing.status === 'completed') return existing
  const now = Date.now()
  const id = jobId(assetId, kind, version)
  await database.runAsync(
    `INSERT INTO agent_ingestion_jobs
      (id, asset_id, kind, version, status, completed_units, total_units, checkpoint, result_ref, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id, kind, version) DO UPDATE SET
       status = 'queued', error = NULL, updated_at = ?`,
    id,
    assetId,
    kind,
    version,
    'queued',
    existing?.completedUnits ?? 0,
    existing?.totalUnits ?? 0,
    existing?.checkpoint ?? 0,
    existing?.resultRef ?? null,
    null,
    existing?.createdAt ?? now,
    now,
    now,
  )
  return (await getIngestionJob(assetId, kind, version)) as IngestionJob
}

export async function runAssetIngestion(assetId: string, kind: IngestionKind = 'manifest', version = 1): Promise<IngestionJob> {
  const asset = await getAsset(assetId)
  if (!asset) throw new Error(`الأصل (${assetId}) غير موجود.`)
  const job = await queueIngestionJob(assetId, kind, version)
  if (job.status === 'completed') return job
  await updateJob(job.id, { status: 'running', totalUnits: Math.max(asset.byteSize, 1), completedUnits: job.completedUnits })
  try {
    const result = kind === 'text_preview'
      ? await buildTextPreview(asset.localUri)
      : await buildManifest(asset, kind)
    const derivative = await addAssetDerivative({
      id: `${job.id}-derivative`,
      assetId,
      kind: result.kind,
      mime: result.mime,
      byteSize: result.byteSize,
      summary: result.summary,
      metadata: result.metadata,
      state: 'available',
    })
    await updateAssetState(assetId, result.assetState, { ingestion: { kind, version, derivativeId: derivative.id, completedAt: Date.now() } })
    return await updateJob(job.id, {
      status: 'completed',
      completedUnits: Math.max(asset.byteSize, 1),
      totalUnits: Math.max(asset.byteSize, 1),
      checkpoint: Math.max(asset.byteSize, 1),
      resultRef: derivative.id,
    })
  } catch (error: any) {
    const message = error?.message ?? 'فشلت معالجة الأصل محلياً.'
    await updateAssetState(assetId, 'failed', { ingestionError: message, ingestionKind: kind }).catch(() => {})
    return await updateJob(job.id, { status: 'failed', error: message })
  }
}

export async function resumeIngestionJob(assetId: string, kind: IngestionKind, version = 1): Promise<IngestionJob> {
  const job = await getIngestionJob(assetId, kind, version)
  if (!job || job.status === 'completed') return job ?? queueIngestionJob(assetId, kind, version)
  return runAssetIngestion(assetId, kind, version)
}

export async function readTextChunkPreview(uri: string, maxBytes = 256_000, maxLines = 100): Promise<TextChunkPreview> {
  if (/^data:/i.test(uri)) {
    throw new Error('القراءة المقطعية للأصول data URI غير متاحة؛ انسخ الأصل إلى تخزين محلي قبل المعالجة.')
  }
  const file = new ExpoFile(uri)
  if (!file.exists) throw new Error('ملف الأصل غير موجود على الجهاز.')
  const handle = file.open()
  try {
    const bytes = handle.readBytes(Math.min(maxBytes, file.size))
    const content = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')
    const lines = content.split(/\r?\n/)
    const truncated = file.size > bytes.byteLength || lines.length > maxLines
    return {
      content: lines.slice(0, maxLines).join('\n'),
      bytesRead: bytes.byteLength,
      lineCount: lines.length,
      truncated,
    }
  } finally {
    handle.close()
  }
}

async function buildTextPreview(uri: string): Promise<{
  kind: string
  mime: string
  byteSize: number
  summary: string
  metadata: Record<string, unknown>
  assetState: 'parsed'
}> {
  const preview = await readTextChunkPreview(uri)
  return {
    kind: 'text_preview',
    mime: 'text/plain',
    byteSize: preview.bytesRead,
    summary: preview.content,
    metadata: {
      bytesRead: preview.bytesRead,
      lineCount: preview.lineCount,
      truncated: preview.truncated,
    },
    assetState: 'parsed',
  }
}

async function buildManifest(asset: NonNullable<Awaited<ReturnType<typeof getAsset>>>, kind: IngestionKind): Promise<{
  kind: string
  mime: string
  byteSize: number
  summary: string
  metadata: Record<string, unknown>
  assetState: 'inspected'
}> {
  const base = {
    assetId: asset.id,
    name: asset.name,
    mime: asset.mime,
    kind: asset.kind,
    byteSize: asset.byteSize,
    state: asset.state,
  }
  if (asset.kind === 'spreadsheet') {
    return {
      kind: 'spreadsheet_manifest',
      mime: asset.mime,
      byteSize: asset.byteSize,
      summary: `مصنف «${asset.name}» محفوظ محلياً. يلزم parser دفعي خاص بالمصنف قبل الاستيراد؛ لم تُحمّل الخلايا كاملة إلى الذاكرة.`,
      metadata: {
        ...base,
        parser: 'deferred',
        requiresChunkedDatasetJob: true,
        warning: 'لا يُعلن الاستيراد أو التنظيم قبل بناء preview/commit قابل للاستئناف.',
      },
      assetState: 'inspected',
    }
  }
  return {
    kind: `${asset.kind}_manifest`,
    mime: asset.mime,
    byteSize: asset.byteSize,
    summary: `${kind} للأصل «${asset.name}»: ${asset.mime}، ${(asset.byteSize / 1024).toFixed(0)} كيلوبايت، الحالة ${asset.state}.`,
    metadata: {
      ...base,
      localOnly: true,
      derivativeCapabilities: asset.kind === 'image' ? ['resize', 'thumbnail'] : asset.kind === 'video' ? ['thumbnail'] : asset.kind === 'audio' ? ['transcript'] : [],
    },
    assetState: 'inspected',
  }
}

async function updateJob(id: string, patch: Partial<Pick<IngestionJob, 'status' | 'completedUnits' | 'totalUnits' | 'checkpoint' | 'resultRef' | 'error'>>): Promise<IngestionJob> {
  await ensureIngestionSchema()
  const database = await getDB()
  const current = await database.getFirstAsync<any>('SELECT * FROM agent_ingestion_jobs WHERE id = ?', id)
  if (!current) throw new Error(`وظيفة المعالجة (${id}) غير موجودة.`)
  await database.runAsync(
    `UPDATE agent_ingestion_jobs SET status = ?, completed_units = ?, total_units = ?, checkpoint = ?, result_ref = ?, error = ?, updated_at = ? WHERE id = ?`,
    patch.status ?? current.status,
    patch.completedUnits ?? current.completed_units ?? 0,
    patch.totalUnits ?? current.total_units ?? 0,
    patch.checkpoint ?? current.checkpoint ?? 0,
    patch.resultRef ?? current.result_ref ?? null,
    patch.error ?? current.error ?? null,
    Date.now(),
    id,
  )
  return (await getIngestionJob(current.asset_id, current.kind, current.version)) as IngestionJob
}

function mapJob(row: any): IngestionJob {
  return {
    id: row.id,
    assetId: row.asset_id,
    kind: row.kind,
    version: row.version,
    status: row.status,
    completedUnits: row.completed_units ?? 0,
    totalUnits: row.total_units ?? 0,
    checkpoint: row.checkpoint ?? 0,
    resultRef: row.result_ref ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
