import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveAgentOutcome } from '../src/assistant/agentRun'

describe('false progress and terminal outcome invariants', () => {
  it('maps unfinished task states to non-success outcomes', () => {
    expect(deriveAgentOutcome('completed')).toBe('completed')
    expect(deriveAgentOutcome('awaiting_user')).toBe('paused')
    expect(deriveAgentOutcome('cancelled')).toBe('cancelled')
    expect(deriveAgentOutcome('running')).toBe('failed')
    expect(deriveAgentOutcome('verifying')).toBe('failed')
    expect(deriveAgentOutcome('proposed')).toBe('failed')
    expect(deriveAgentOutcome('failed')).toBe('failed')
    expect(deriveAgentOutcome(undefined, 'error')).toBe('failed')
    expect(deriveAgentOutcome(undefined, 'text')).toBe('completed')
  })

  it('does not leave an unconditional successful done event in the executor', () => {
    const executor = readFileSync(resolve(process.cwd(), 'src/assistant/executor.ts'), 'utf8')
    expect(executor).toContain("emit({ type: 'done', outcome })")
    expect(executor).not.toContain("emit({ type: 'done' })")
    expect(executor).toContain('deriveAgentOutcome(task.status)')
    expect(executor).toContain('noEvidenceRecoveryAttempts')
    expect(executor).toContain("strategy: 'retry'")
  })

  it('does not inject a fixed preflight dialogue before the model response', () => {
    const executor = readFileSync(resolve(process.cwd(), 'src/assistant/executor.ts'), 'utf8')
    expect(executor).not.toContain('buildPreflightText')
    expect(executor).not.toContain("type: 'progress', text: preflight")
  })

  it('does not force the UI into complete when done carries failure', () => {
    const screen = readFileSync(resolve(process.cwd(), 'src/screens/assistant/AssistantScreen.tsx'), 'utf8')
    expect(screen).toContain("const outcome = e.outcome ?? 'completed'")
    expect(screen).toContain("setAgentPhase('error')")
    expect(screen).toContain("setAgentPhase('paused')")
  })

  it('leaves plan disclosure and spoken reasoning to the agent', () => {
    const prompts = readFileSync(resolve(process.cwd(), 'src/assistant/prompts.ts'), 'utf8')
    const executor = readFileSync(resolve(process.cwd(), 'src/assistant/executor.ts'), 'utf8')
    expect(prompts).not.toContain('في أول فقاعة تنفيذ')
    expect(prompts).not.toContain('التفكير بصوت عالٍ عند كل خطوة مفصلية')
    expect(prompts).toContain('خيارات يقررها الوكيل')
    expect(executor).not.toContain('اتبع ترتيب الخطة الظاهر للمستخدم')
  })
})
