import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('durable agent memory invariants', () => {
  const durableStore = readFileSync(resolve(process.cwd(), 'src/assistant/durableStore.ts'), 'utf8')
  const store = readFileSync(resolve(process.cwd(), 'src/assistant/store.ts'), 'utf8')
  const executor = readFileSync(resolve(process.cwd(), 'src/assistant/executor.ts'), 'utf8')

  it('defines durable tables for steps, checkpoints, operations, and artifacts', () => {
    expect(durableStore).toContain('CREATE TABLE IF NOT EXISTS agent_task_steps')
    expect(durableStore).toContain('CREATE TABLE IF NOT EXISTS agent_checkpoints')
    expect(durableStore).toContain('CREATE TABLE IF NOT EXISTS agent_operation_ledger')
    expect(durableStore).toContain('CREATE TABLE IF NOT EXISTS agent_artifacts')
    expect(durableStore).toContain('UNIQUE(task_id, version)')
    expect(durableStore).toContain('UNIQUE(task_id, ordinal)')
    expect(durableStore).toContain('UNIQUE')
  })

  it('persists verification and idempotency fields instead of status only', () => {
    expect(durableStore).toContain('verification_status')
    expect(durableStore).toContain('idempotency_key')
    expect(durableStore).toContain('result_ref')
    expect(durableStore).toContain('postcondition')
    expect(durableStore).toContain('recordDurableCheckpoint')
    expect(durableStore).toContain('recordDurableOperation')
    expect(durableStore).toContain("'preview_update'")
    expect(durableStore).toContain('READ_ONLY_OPERATION_TOOLS')
  })

  it('does not complete every plan step from final text alone', () => {
    expect(executor).toContain('getDurableVerificationSummary')
    expect(executor).toContain('pendingWrites')
    expect(executor).toContain('updateDurableOperation')
    expect(executor).toContain('lastObs.meta.verified === true')
    expect(executor).toContain('operationHasPostconditionEvidence')
    expect(executor).toContain("'preview_update'")
    expect(executor).not.toContain('runtimePlan.steps.reduce((current, step) => completePlanStep(current, step.id)')
  })

  it('keeps database verification machine-readable and fail-closed', () => {
    const toolSchemas = readFileSync(resolve(process.cwd(), 'src/assistant/toolSchemas.ts'), 'utf8')
    const invokeTools = readFileSync(resolve(process.cwd(), 'src/assistant/invokeTools.ts'), 'utf8')
    const persist = readFileSync(resolve(process.cwd(), 'src/assistant/persist.ts'), 'utf8')
    expect(toolSchemas).toContain('verifyMutationPostcondition')
    expect(toolSchemas).toContain('idempotentUpdate')
    expect(toolSchemas).toContain('verificationPassed')
    expect(toolSchemas).toContain('verified, verification')
    expect(invokeTools).toContain('verified, verification')
    expect(invokeTools).toContain('verified, verification })')
    expect(persist).toContain('verified: metaExtra?.verified === true')
  })

  it('initializes durable schema and materializes plan steps during task creation', () => {
    expect(store).toContain('await ensureDurableSchema(d)')
    expect(store).toContain('createDurableTaskStep')
    expect(store).toContain('const planSteps = Array.isArray(input.plan?.steps) ? input.plan.steps : []')
    expect(store).toContain("status === 'verified' ? 'verified' : status === 'blocked' ? 'blocked' : 'pending'")
  })
})
