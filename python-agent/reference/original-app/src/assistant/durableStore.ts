import * as SQLite from 'expo-sqlite'
import { getDB } from '../database/db'

export type DurableStepStatus = 'pending' | 'running' | 'awaiting_user' | 'blocked' | 'verified' | 'failed' | 'cancelled'
export type DurableOperationStatus = 'started' | 'succeeded' | 'failed' | 'verified' | 'skipped'
export type DurableArtifactState = 'available' | 'processing' | 'failed' | 'purged'

export interface DurableTaskStep {
  id: string
  taskId: string
  ordinal: number
  title: string
  status: DurableStepStatus
  precondition?: unknown
  operation?: unknown
  postcondition?: unknown
  toolName?: string
  toolCallId?: string
  resultRef?: string
  verificationStatus: 'pending' | 'verified' | 'failed' | 'blocked'
  attempt: number
  lastError?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface DurableCheckpoint {
  id: string
  taskId: string
  stepId?: string
  version: number
  state: string
  nextAction?: string
  payload: unknown
  createdAt: number
}

export interface DurableOperation {
  operationId: string
  taskId: string
  stepId?: string
  idempotencyKey: string
  toolName: string
  argsHash?: string
  status: DurableOperationStatus
  resultRef?: string
  affected?: unknown
  errorCode?: string
  errorMessage?: string
  startedAt: number
  completedAt?: number
}

export interface DurableUserTurn {
  id: string
  sessionId: string
  text: string
  assetIds: string[]
  state: 'accepted' | 'processing' | 'ready' | 'failed'
  createdAt: number
}

export interface DurableOperationSummary {
  total: number
  successful: number
  verified: number
  pendingWrites: number
  failed: number
  complete: boolean
}

export interface DurableVerificationSummary {
  required: number
  verified: number
  pending: number
  failed: number
  complete: boolean
  requiredStepIds: string[]
  verifiedStepIds: string[]
}

export interface DurableArtifact {
  id: string
  taskId?: string
  stepId?: string
  kind: string
  uri?: string
  mime?: string
  byteSize?: number
  checksum?: string
  state: DurableArtifactState
  summary?: string
  metadata?: unknown
  createdAt: number
}

export interface CreateTaskStepInput {
  taskId: string
  ordinal: number
  title?: string
  precondition?: unknown
  operation?: unknown
  postcondition?: unknown
  toolName?: string
  status?: DurableStepStatus
  verificationStatus?: DurableTaskStep['verificationStatus']
  resultRef?: string
  lastError?: string
}

export interface RecordCheckpointInput {
  taskId: string
  stepId?: string
  state: string
  nextAction?: string
  payload?: unknown
}

export interface RecordOperationInput {
  operationId: string
  taskId: string
  stepId?: string
  idempotencyKey: string
  toolName: string
  argsHash?: string
  status?: DurableOperationStatus
  resultRef?: string
  affected?: unknown
  errorCode?: string
  errorMessage?: string
}

export interface CreateArtifactInput {
  id: string
  taskId?: string
  stepId?: string
  kind: string
  uri?: string
  mime?: string
  byteSize?: number
  checksum?: string
  state?: DurableArtifactState
  summary?: string
  metadata?: unknown
}

let schemaPromise: Promise<void> | null = null

function id(): string {
  return `dur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function encode(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value ?? null)
}

function decode(value: string | null | undefined): unknown {
  if (!value) return undefined
  try { return JSON.parse(value) } catch { return { raw: value } }
}

export async function ensureDurableSchema(database?: SQLite.SQLiteDatabase): Promise<void> {
  if (database) {
    await createDurableSchema(database)
    return
  }
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await createDurableSchema(await getDB())
    })().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  await schemaPromise
}

async function createDurableSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS agent_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      asset_ids TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL DEFAULT 'accepted',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_turns_session ON agent_turns (session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_turns_state ON agent_turns (state, created_at);

    CREATE TABLE IF NOT EXISTS agent_task_steps (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      precondition TEXT,
      operation TEXT,
      postcondition TEXT,
      tool_name TEXT,
      tool_call_id TEXT,
      result_ref TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      attempt INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(task_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_task_steps_task ON agent_task_steps (task_id, ordinal);
    CREATE INDEX IF NOT EXISTS idx_agent_task_steps_status ON agent_task_steps (task_id, status, verification_status);

    CREATE TABLE IF NOT EXISTS agent_checkpoints (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step_id TEXT,
      version INTEGER NOT NULL,
      state TEXT NOT NULL,
      next_action TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      UNIQUE(task_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_task ON agent_checkpoints (task_id, version DESC);

    CREATE TABLE IF NOT EXISTS agent_operation_ledger (
      operation_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step_id TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      tool_name TEXT NOT NULL,
      args_hash TEXT,
      status TEXT NOT NULL,
      result_ref TEXT,
      affected TEXT,
      error_code TEXT,
      error_message TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_operations_task ON agent_operation_ledger (task_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_agent_operations_status ON agent_operation_ledger (status, started_at);

    CREATE TABLE IF NOT EXISTS agent_artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      step_id TEXT,
      kind TEXT NOT NULL,
      uri TEXT,
      mime TEXT,
      byte_size INTEGER,
      checksum TEXT,
      state TEXT NOT NULL DEFAULT 'available',
      summary TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_task ON agent_artifacts (task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_checksum ON agent_artifacts (checksum);
  `)
}

export async function recordDurableUserTurn(input: Omit<DurableUserTurn, 'createdAt'> & { createdAt?: number }): Promise<DurableUserTurn> {
  await ensureDurableSchema()
  const database = await getDB()
  const turn: DurableUserTurn = {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO agent_turns (id, session_id, text, asset_ids, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    turn.id,
    turn.sessionId,
    turn.text,
    JSON.stringify(turn.assetIds),
    turn.state,
    turn.createdAt,
  )
  return turn
}

export async function getLatestDurableUserTurn(sessionId: string): Promise<DurableUserTurn | null> {
  await ensureDurableSchema()
  const database = await getDB()
  const row = await database.getFirstAsync<any>('SELECT * FROM agent_turns WHERE session_id = ? ORDER BY created_at DESC LIMIT 1', sessionId)
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text ?? '',
    assetIds: decode(row.asset_ids) as string[] ?? [],
    state: row.state,
    createdAt: row.created_at,
  }
}

export async function createDurableTaskStep(input: CreateTaskStepInput): Promise<DurableTaskStep> {
  await ensureDurableSchema()
  const database = await getDB()
  const now = Date.now()
  const taskStep: DurableTaskStep = {
    id: id(),
    taskId: input.taskId,
    ordinal: input.ordinal,
    title: input.title ?? '',
    status: input.status ?? 'pending',
    precondition: input.precondition,
    operation: input.operation,
    postcondition: input.postcondition,
    toolName: input.toolName,
    verificationStatus: input.verificationStatus ?? 'pending',
    attempt: 0,
    resultRef: input.resultRef,
    lastError: input.lastError,
    createdAt: now,
    updatedAt: now,
  }
  await database.runAsync(
    `INSERT OR IGNORE INTO agent_task_steps
      (id, task_id, ordinal, title, status, precondition, operation, postcondition, tool_name,
       verification_status, attempt, result_ref, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    taskStep.id,
    taskStep.taskId,
    taskStep.ordinal,
    taskStep.title,
    taskStep.status,
    encode(taskStep.precondition),
    encode(taskStep.operation),
    encode(taskStep.postcondition),
    taskStep.toolName ?? null,
    taskStep.verificationStatus,
    taskStep.attempt,
    taskStep.resultRef ?? null,
    taskStep.lastError ?? null,
    now,
    now,
  )
  const stored = await database.getFirstAsync<any>(
    'SELECT * FROM agent_task_steps WHERE task_id = ? AND ordinal = ?',
    taskStep.taskId,
    taskStep.ordinal,
  )
  return mapTaskStep(stored ?? taskStep)
}

export async function listDurableTaskSteps(taskId: string): Promise<DurableTaskStep[]> {
  await ensureDurableSchema()
  const database = await getDB()
  const rows = await database.getAllAsync<any>('SELECT * FROM agent_task_steps WHERE task_id = ? ORDER BY ordinal ASC', taskId)
  return rows.map(mapTaskStep)
}

export async function ensureDurablePlanSteps(taskId: string, planSteps: { id: string; title?: string; detail?: string; status?: string; resultSummary?: string; error?: string }[]): Promise<void> {
  const existing = await listDurableTaskSteps(taskId)
  const existingPlanIds = new Set(existing.map((step) => step.operation && typeof step.operation === 'object' ? String((step.operation as Record<string, unknown>).planStepId ?? '') : ''))
  for (const [index, step] of planSteps.entries()) {
    if (existingPlanIds.has(step.id)) continue
    const status: DurableStepStatus = step.status === 'done'
      ? 'verified'
      : step.status === 'blocked'
        ? 'blocked'
        : step.status === 'skipped'
          ? 'cancelled'
          : step.status === 'active'
            ? 'running'
            : 'pending'
    await createDurableTaskStep({
      taskId,
      ordinal: index,
      title: step.title ?? '',
      operation: {
        planStepId: step.id,
        detail: step.detail ?? '',
        requiresVerification: !['understand', 'plan', 'answer', 'present', 'decide'].includes(step.id),
      },
      status,
      verificationStatus: status === 'verified' ? 'verified' : status === 'blocked' ? 'blocked' : 'pending',
      resultRef: step.resultSummary,
      lastError: step.error,
    })
  }
}

export async function findDurableTaskStep(taskId: string, planStepId: string): Promise<DurableTaskStep | null> {
  const steps = await listDurableTaskSteps(taskId)
  const match = steps.find((step) => {
    if (!step.operation || typeof step.operation !== 'object') return false
    return String((step.operation as Record<string, unknown>).planStepId ?? '') === planStepId
  })
  return match ?? null
}

export async function getDurableVerificationSummary(taskId: string): Promise<DurableVerificationSummary> {
  const steps = await listDurableTaskSteps(taskId)
  const requiredSteps = steps.filter((step) => {
    if (!step.operation || typeof step.operation !== 'object') return true
    return (step.operation as Record<string, unknown>).requiresVerification !== false
  })
  const verifiedSteps = requiredSteps.filter((step) => step.verificationStatus === 'verified' || step.status === 'verified')
  const failedSteps = requiredSteps.filter((step) => step.verificationStatus === 'failed' || step.status === 'failed')
  return {
    required: requiredSteps.length,
    verified: verifiedSteps.length,
    pending: Math.max(0, requiredSteps.length - verifiedSteps.length - failedSteps.length),
    failed: failedSteps.length,
    complete: requiredSteps.length > 0 && verifiedSteps.length === requiredSteps.length,
    requiredStepIds: requiredSteps.map((step) => step.id),
    verifiedStepIds: verifiedSteps.map((step) => step.id),
  }
}

export async function updateDurableTaskStep(
  stepId: string,
  patch: Partial<Pick<DurableTaskStep, 'status' | 'toolCallId' | 'resultRef' | 'verificationStatus' | 'attempt' | 'lastError' | 'precondition' | 'operation' | 'postcondition'>>,
): Promise<void> {
  await ensureDurableSchema()
  const database = await getDB()
  const current = await database.getFirstAsync<any>('SELECT * FROM agent_task_steps WHERE id = ?', stepId)
  if (!current) throw new Error(`الخطوة المستديمة (${stepId}) غير موجودة.`)
  const nextStatus = patch.status ?? current.status
  const nextVerification = patch.verificationStatus ?? current.verification_status
  const completedAt = ['verified', 'failed', 'cancelled'].includes(nextStatus) ? Date.now() : current.completed_at
  await database.runAsync(
    `UPDATE agent_task_steps SET
      status = ?, tool_call_id = ?, result_ref = ?, verification_status = ?, attempt = ?,
      last_error = ?, precondition = ?, operation = ?, postcondition = ?, updated_at = ?, completed_at = ?
     WHERE id = ?`,
    nextStatus,
    patch.toolCallId ?? current.tool_call_id ?? null,
    patch.resultRef ?? current.result_ref ?? null,
    nextVerification,
    patch.attempt ?? current.attempt ?? 0,
    patch.lastError ?? current.last_error ?? null,
    patch.precondition === undefined ? current.precondition : encode(patch.precondition),
    patch.operation === undefined ? current.operation : encode(patch.operation),
    patch.postcondition === undefined ? current.postcondition : encode(patch.postcondition),
    Date.now(),
    completedAt,
    stepId,
  )
}

export async function recordDurableCheckpoint(input: RecordCheckpointInput): Promise<DurableCheckpoint> {
  await ensureDurableSchema()
  const database = await getDB()
  const current = await database.getFirstAsync<{ version: number }>(
    'SELECT version FROM agent_checkpoints WHERE task_id = ? ORDER BY version DESC LIMIT 1',
    input.taskId,
  )
  const checkpoint: DurableCheckpoint = {
    id: id(),
    taskId: input.taskId,
    stepId: input.stepId,
    version: (current?.version ?? 0) + 1,
    state: input.state,
    nextAction: input.nextAction,
    payload: input.payload ?? {},
    createdAt: Date.now(),
  }
  await database.runAsync(
    `INSERT INTO agent_checkpoints (id, task_id, step_id, version, state, next_action, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    checkpoint.id,
    checkpoint.taskId,
    checkpoint.stepId ?? null,
    checkpoint.version,
    checkpoint.state,
    checkpoint.nextAction ?? null,
    JSON.stringify(checkpoint.payload ?? {}),
    checkpoint.createdAt,
  )
  return checkpoint
}

export async function getLatestDurableCheckpoint(taskId: string): Promise<DurableCheckpoint | null> {
  await ensureDurableSchema()
  const database = await getDB()
  const row = await database.getFirstAsync<any>(
    'SELECT * FROM agent_checkpoints WHERE task_id = ? ORDER BY version DESC LIMIT 1',
    taskId,
  )
  return row ? mapCheckpoint(row) : null
}

export async function recordDurableOperation(input: RecordOperationInput): Promise<DurableOperation> {
  await ensureDurableSchema()
  const database = await getDB()
  const now = Date.now()
  const operation: DurableOperation = {
    operationId: input.operationId,
    taskId: input.taskId,
    stepId: input.stepId,
    idempotencyKey: input.idempotencyKey,
    toolName: input.toolName,
    argsHash: input.argsHash,
    status: input.status ?? 'started',
    resultRef: input.resultRef,
    affected: input.affected,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    startedAt: now,
  }
  await database.runAsync(
    `INSERT INTO agent_operation_ledger
      (operation_id, task_id, step_id, idempotency_key, tool_name, args_hash, status, result_ref,
       affected, error_code, error_message, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO UPDATE SET
       operation_id = excluded.operation_id,
       task_id = excluded.task_id,
       step_id = excluded.step_id,
       tool_name = excluded.tool_name,
       args_hash = excluded.args_hash,
       status = excluded.status,
       result_ref = excluded.result_ref,
       affected = excluded.affected,
       error_code = excluded.error_code,
       error_message = excluded.error_message`,
    operation.operationId,
    operation.taskId,
    operation.stepId ?? null,
    operation.idempotencyKey,
    operation.toolName,
    operation.argsHash ?? null,
    operation.status,
    operation.resultRef ?? null,
    encode(operation.affected),
    operation.errorCode ?? null,
    operation.errorMessage ?? null,
    operation.startedAt,
  )
  return operation
}

const READ_ONLY_OPERATION_TOOLS = new Set([
  'preview_update',
  'property_change_preview',
  'project_import_preview',
  'inspect_asset',
  'file_preview',
  'read_uploaded_file',
  'query',
  'get',
  'data_snapshot',
  'catalog',
  'list_attachments',
  'list_reminders',
])

export function toolRequiresPostcondition(toolName: string): boolean {
  const name = toolName.toLowerCase()
  if (READ_ONLY_OPERATION_TOOLS.has(name)) return false
  return /(?:^|_)(?:create|update|delete|mutate|import|record|set|attach|link|remove|commit|write|save|bulk)(?:$|_)/.test(name)
    || ['create', 'update', 'delete', 'mutate_record', 'import_project_file', 'project_import_commit', 'workspace_import_rows'].includes(name)
}

export async function listDurableOperations(taskId: string): Promise<DurableOperation[]> {
  await ensureDurableSchema()
  const database = await getDB()
  const rows = await database.getAllAsync<any>('SELECT * FROM agent_operation_ledger WHERE task_id = ? ORDER BY started_at ASC', taskId)
  return rows.map((row) => ({
    operationId: row.operation_id,
    taskId: row.task_id,
    stepId: row.step_id ?? undefined,
    idempotencyKey: row.idempotency_key,
    toolName: row.tool_name,
    argsHash: row.args_hash ?? undefined,
    status: row.status,
    resultRef: row.result_ref ?? undefined,
    affected: decode(row.affected),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
  }))
}

export async function markLatestPendingWriteVerified(taskId: string, resultRef?: string): Promise<DurableOperation | null> {
  const operations = await listDurableOperations(taskId)
  const pending = [...operations].reverse().find((operation) => operation.status === 'succeeded' && toolRequiresPostcondition(operation.toolName))
  if (!pending) return null
  await updateDurableOperation(pending.operationId, { status: 'verified', resultRef: resultRef ?? pending.resultRef })
  return { ...pending, status: 'verified', resultRef: resultRef ?? pending.resultRef }
}

export async function getDurableOperationSummary(taskId: string): Promise<DurableOperationSummary> {
  const operations = await listDurableOperations(taskId)
  const writes = operations.filter((operation) => toolRequiresPostcondition(operation.toolName))
  const successful = operations.filter((operation) => operation.status === 'succeeded' || operation.status === 'verified')
  const verified = operations.filter((operation) => operation.status === 'verified')
  const pendingWrites = writes.filter((operation) => operation.status === 'succeeded').length
  const failed = operations.filter((operation) => operation.status === 'failed').length
  return {
    total: operations.length,
    successful: successful.length,
    verified: verified.length,
    pendingWrites,
    failed,
    complete: pendingWrites === 0 && failed === 0,
  }
}

export async function updateDurableOperation(
  operationId: string,
  patch: Partial<Pick<DurableOperation, 'status' | 'resultRef' | 'affected' | 'errorCode' | 'errorMessage'>>,
): Promise<void> {
  await ensureDurableSchema()
  const database = await getDB()
  const current = await database.getFirstAsync<any>('SELECT * FROM agent_operation_ledger WHERE operation_id = ?', operationId)
  if (!current) throw new Error(`العملية المستديمة (${operationId}) غير موجودة.`)
  const status = patch.status ?? current.status
  await database.runAsync(
    `UPDATE agent_operation_ledger SET status = ?, result_ref = ?, affected = ?, error_code = ?,
      error_message = ?, completed_at = ? WHERE operation_id = ?`,
    status,
    patch.resultRef ?? current.result_ref ?? null,
    patch.affected === undefined ? current.affected : encode(patch.affected),
    patch.errorCode ?? current.error_code ?? null,
    patch.errorMessage ?? current.error_message ?? null,
    ['succeeded', 'failed', 'verified', 'skipped'].includes(status) ? Date.now() : current.completed_at,
    operationId,
  )
}

export async function createDurableArtifact(input: CreateArtifactInput): Promise<DurableArtifact> {
  await ensureDurableSchema()
  const database = await getDB()
  const artifact: DurableArtifact = {
    id: input.id,
    taskId: input.taskId,
    stepId: input.stepId,
    kind: input.kind,
    uri: input.uri,
    mime: input.mime,
    byteSize: input.byteSize,
    checksum: input.checksum,
    state: input.state ?? 'available',
    summary: input.summary,
    metadata: input.metadata,
    createdAt: Date.now(),
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO agent_artifacts
      (id, task_id, step_id, kind, uri, mime, byte_size, checksum, state, summary, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    artifact.id,
    artifact.taskId ?? null,
    artifact.stepId ?? null,
    artifact.kind,
    artifact.uri ?? null,
    artifact.mime ?? null,
    artifact.byteSize ?? null,
    artifact.checksum ?? null,
    artifact.state,
    artifact.summary ?? null,
    encode(artifact.metadata),
    artifact.createdAt,
  )
  return artifact
}

export async function listDurableArtifacts(taskId: string): Promise<DurableArtifact[]> {
  await ensureDurableSchema()
  const database = await getDB()
  const rows = await database.getAllAsync<any>('SELECT * FROM agent_artifacts WHERE task_id = ? ORDER BY created_at ASC', taskId)
  return rows.map(mapArtifact)
}

function mapTaskStep(row: any): DurableTaskStep {
  return {
    id: row.id,
    taskId: row.task_id,
    ordinal: row.ordinal,
    title: row.title ?? '',
    status: row.status,
    precondition: decode(row.precondition),
    operation: decode(row.operation),
    postcondition: decode(row.postcondition),
    toolName: row.tool_name ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    resultRef: row.result_ref ?? undefined,
    verificationStatus: row.verification_status,
    attempt: row.attempt ?? 0,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  }
}

function mapCheckpoint(row: any): DurableCheckpoint {
  return {
    id: row.id,
    taskId: row.task_id,
    stepId: row.step_id ?? undefined,
    version: row.version,
    state: row.state,
    nextAction: row.next_action ?? undefined,
    payload: decode(row.payload) ?? {},
    createdAt: row.created_at,
  }
}

function mapArtifact(row: any): DurableArtifact {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    stepId: row.step_id ?? undefined,
    kind: row.kind,
    uri: row.uri ?? undefined,
    mime: row.mime ?? undefined,
    byteSize: row.byte_size ?? undefined,
    checksum: row.checksum ?? undefined,
    state: row.state,
    summary: row.summary ?? undefined,
    metadata: decode(row.metadata),
    createdAt: row.created_at,
  }
}
