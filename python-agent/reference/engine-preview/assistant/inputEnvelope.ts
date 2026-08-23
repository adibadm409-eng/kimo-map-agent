export type InputAssetKind = 'image' | 'audio' | 'video' | 'document' | 'spreadsheet' | 'text' | 'unknown'
export type InputAssetState = 'captured' | 'stored' | 'inspected' | 'parsed' | 'indexed' | 'linked' | 'failed' | 'purged'

export interface AssetRef {
  id: string
  kind: InputAssetKind
  name: string
  mime: string
  byteSize: number
  sha256: string
  localUri: string
  state: InputAssetState
  source: string
  derivatives: string[]
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface InputAssetDraft {
  uri: string
  name?: string
  mime?: string
  size?: number
  kind?: InputAssetKind
  source?: string
  metadata?: Record<string, unknown>
}

export interface UserTurn {
  id: string
  sessionId: string
  text: string
  assets: AssetRef[]
  createdAt: number
}

export function createUserTurn(sessionId: string, text: string, assets: AssetRef[] = [], id?: string): UserTurn {
  const now = Date.now()
  return {
    id: id ?? `turn-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    sessionId,
    text: text.trim(),
    assets,
    createdAt: now,
  }
}

export function hasPayload(turn: UserTurn): boolean {
  return turn.text.trim().length > 0 || turn.assets.length > 0
}

export function summarizeAssetForModel(asset: AssetRef): Record<string, unknown> {
  return {
    assetId: asset.id,
    kind: asset.kind,
    name: asset.name,
    mime: asset.mime,
    byteSize: asset.byteSize,
    state: asset.state,
    derivatives: asset.derivatives,
    metadata: asset.metadata ?? {},
  }
}
