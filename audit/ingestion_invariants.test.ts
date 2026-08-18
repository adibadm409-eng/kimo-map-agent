import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('local ingestion invariants', () => {
  const ingestion = readFileSync(resolve(process.cwd(), 'src/assistant/ingestion.ts'), 'utf8')
  const registry = readFileSync(resolve(process.cwd(), 'src/agent/registry.ts'), 'utf8')
  const workspace = readFileSync(resolve(process.cwd(), 'src/database/workspace.ts'), 'utf8')

  it('persists resumable ingestion jobs with status and checkpoint', () => {
    expect(ingestion).toContain('CREATE TABLE IF NOT EXISTS agent_ingestion_jobs')
    expect(ingestion).toContain('checkpoint INTEGER NOT NULL')
    expect(ingestion).toContain('UNIQUE(asset_id, kind, version)')
    expect(ingestion).toContain('resumeIngestionJob')
    expect(ingestion).toContain('readBytes')
  })

  it('does not claim full Excel streaming when the parser is deferred', () => {
    expect(ingestion).toContain('requiresChunkedDatasetJob: true')
    expect(ingestion).toContain('لم تُحمّل الخلايا كاملة إلى الذاكرة')
    expect(ingestion).not.toContain('streaming: true')
  })

  it('uses import jobs and row checkpoints for spreadsheet commits', () => {
    expect(workspace).toContain('CREATE TABLE IF NOT EXISTS workspace_import_jobs')
    expect(workspace).toContain('current_row INTEGER NOT NULL')
    expect(workspace).toContain('while (offset < data.rows.length)')
    expect(workspace).toContain('data.rows.slice(offset, offset + 250)')
    expect(workspace).toContain('maxSafeFullParseBytes = 20 * 1024 * 1024')
    expect(workspace).toContain('لم أحمّله كاملاً ولم أعلن الاستيراد')
  })

  it('routes inspect_asset through ingestion and returns a refreshed asset state', () => {
    expect(registry).toContain("name: 'inspect_asset'")
    expect(registry).toContain("runAssetIngestion(target.id, 'manifest')")
    expect(registry).toContain('const refreshed = await getAsset(target.id)')
  })
})
