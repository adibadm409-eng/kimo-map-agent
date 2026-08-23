export type AgentPhase =
  | 'understand'
  | 'plan'
  | 'ask'
  | 'execute'
  | 'verify'
  | 'recover'
  | 'complete'
  | 'paused'
  | 'error'

export type PlanStepStatus = 'pending' | 'active' | 'done' | 'blocked' | 'skipped'

export interface AgentPlanStep {
  id: string
  title: string
  detail?: string
  skillId?: string
  status: PlanStepStatus
  startedAt?: number
  completedAt?: number
  resultSummary?: string
  error?: string
}

export interface AgentPlan {
  id: string
  goal: string
  summary: string
  skillId?: string
  steps: AgentPlanStep[]
  currentStepId?: string
  status: 'draft' | 'active' | 'waiting_user' | 'verifying' | 'complete' | 'failed' | 'cancelled'
  createdAt: number
  updatedAt: number
}

export type AgentDecisionKind = 'assumption' | 'question' | 'approval' | 'replan' | 'rollback' | 'guard' | 'result'

export interface AgentDecision {
  id: string
  kind: AgentDecisionKind
  title: string
  detail: string
  options?: string[]
  selected?: string
  reversible?: boolean
  createdAt: number
}

export interface AgentSkill {
  id: string
  label: string
  description: string
  triggers: string[]
  preferredTools: string[]
  readTools: string[]
  writeTools: string[]
  requiredInputs: string[]
  questionPolicy: 'ask_on_missing' | 'safe_defaults' | 'never_guess'
  verificationTools: string[]
  recoveryPolicy: 'retry' | 'replan' | 'rollback' | 'ask_user'
  systemGuidance: string
}

export interface SkillMatch {
  skill: AgentSkill
  score: number
  missingInputs: string[]
  reasons: string[]
}

export interface AgentRuntimeSnapshot {
  sessionId: string
  phase: AgentPhase
  plan: AgentPlan | null
  activeSkill: AgentSkill | null
  decisions: AgentDecision[]
  currentAction?: string
  currentObservation?: string
  startedAt?: number
  updatedAt: number
}

export type VisibleAgentEvent =
  | { type: 'phase'; phase: AgentPhase; label: string; detail?: string }
  | { type: 'plan'; plan: AgentPlan }
  | { type: 'plan_step'; step: AgentPlanStep }
  | { type: 'skill'; skill: Pick<AgentSkill, 'id' | 'label' | 'description'> }
  | { type: 'decision'; decision: AgentDecision }
  | { type: 'observation'; title: string; detail: string; status: 'info' | 'success' | 'warning' | 'error' }
  | { type: 'recovery'; title: string; detail: string; strategy: 'retry' | 'replan' | 'rollback' | 'ask_user' }

export function makePlan(goal: string, steps: Omit<AgentPlanStep, 'status'>[], skillId?: string): AgentPlan {
  const now = Date.now()
  const normalized = steps.map((step, index) => ({
    ...step,
    id: step.id || `step-${index + 1}`,
    status: index === 0 ? 'active' as const : 'pending' as const,
    startedAt: index === 0 ? now : undefined,
  }))
  return {
    id: `plan-${now.toString(36)}`,
    goal,
    summary: `${normalized.length} مراحل منظمة`,
    skillId,
    steps: normalized,
    currentStepId: normalized[0]?.id,
    status: normalized.length ? 'active' : 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

export function completePlanStep(plan: AgentPlan, stepId: string, resultSummary?: string): AgentPlan {
  const now = Date.now()
  const index = plan.steps.findIndex((step) => step.id === stepId)
  if (index < 0) return plan
  const steps = plan.steps.map((step, i) => {
    if (i === index) return { ...step, status: 'done' as const, completedAt: now, resultSummary }
    if (i === index + 1 && step.status === 'pending') return { ...step, status: 'active' as const, startedAt: now }
    return step
  })
  const next = steps.find((step) => step.status === 'active')
  return { ...plan, steps, currentStepId: next?.id, status: next ? 'active' : 'complete', updatedAt: now }
}

export function blockPlan(plan: AgentPlan, stepId: string, error: string): AgentPlan {
  const steps = plan.steps.map((step) => step.id === stepId ? { ...step, status: 'blocked' as const, error } : step)
  return { ...plan, steps, currentStepId: stepId, status: 'waiting_user', updatedAt: Date.now() }
}
