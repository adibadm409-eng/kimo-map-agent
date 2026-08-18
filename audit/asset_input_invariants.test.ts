import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('canonical input and asset store invariants', () => {
  const envelope = readFileSync(resolve(process.cwd(), 'src/assistant/inputEnvelope.ts'), 'utf8')
  const assets = readFileSync(resolve(process.cwd(), 'src/assistant/assetStore.ts'), 'utf8')
  const executor = readFileSync(resolve(process.cwd(), 'src/assistant/executor.ts'), 'utf8')
  const workspace = readFileSync(resolve(process.cwd(), 'src/database/workspace.ts'), 'utf8')

  it('defines one canonical turn carrying stable asset references', () => {
    expect(envelope).toContain('export interface UserTurn')
    expect(envelope).toContain('assets: AssetRef[]')
    expect(envelope).toContain('export interface AssetRef')
    expect(envelope).toContain("state: InputAssetState")
    expect(envelope).toContain('hasPayload')
  })

  it('persists assets and derivatives with lifecycle state', () => {
    expect(assets).toContain('agent_assets')
    expect(assets).toContain('agent_asset_derivatives')
    expect(assets).toContain('saveAsset')
    expect(assets).toContain('updateAssetState')
    expect(assets).toContain('addAssetDerivative')
    expect(assets).toContain("state: 'stored'")
  })

  it('routes sendUserMessage through Asset Store and durable turn persistence', () => {
    expect(executor).toContain('saveAsset(sessionId')
    expect(executor).toContain('createUserTurn(sessionId, text, assets)')
    expect(executor).toContain('recordDurableUserTurn')
    expect(executor).not.toContain('saveAttachment({ sessionId, name, uri: audio.uri')
    expect(executor).not.toContain('mimeOf(name)')
  })

  it('exposes asset lifecycle metadata to legacy attachment tools', () => {
    expect(workspace).toContain('LEFT JOIN agent_assets')
    expect(workspace).toContain('asset_state')
    expect(workspace).toContain('asset_metadata')
  })
})
