import { create } from 'zustand'
import type { Message, PendingState } from '../../assistant'
import type { AgentEvent } from '../../assistant/agentRun'
import type { AgentPhase, AgentPlan, AgentDecision, AgentSkill, VisibleAgentEvent } from '../../assistant/agentContract'

export type UiComponent =
  | 'user_bubble'
  | 'assistant_message'
  | 'tool_step'
  | 'link_card'
  | 'file_card'
  | 'ask_card'
  | 'confirm_card'
  | 'error_card'
  | 'system_card'
  | 'decision_card'
  | 'observation_card'
  | 'completion_pulse'

export interface ChatItem {
  id: string
  uiComponent: UiComponent
  message?: Message
  payload?: any
}

export interface ExecutionStep {
  id: string
  kind: 'phase' | 'plan' | 'plan_step' | 'skill' | 'progress' | 'tool'
  label: string
  status?: string
  detail?: string
}

export interface AuditEntry {
  id: string
  at: number
  type: string
  text: string
}

export interface ActiveContext {
  goal: string
  budget?: string
  date?: string
  status: string
}

interface ChatStoreState {
  items: ChatItem[]
  activeContext: ActiveContext
  executionSteps: ExecutionStep[]
  auditTrail: AuditEntry[]
  statusBar: { visible: boolean; phase: AgentPhase; thinking: boolean; steps: string[] }
  streamText: string
  pending: PendingState | null
  _plan: AgentPlan | null
  _seq: number

  setMessages: (messages: Message[]) => void
  applyEvent: (e: AgentEvent) => void
  setPending: (p: PendingState | null) => void
  reset: () => void
}

export const PHASE_LABELS: Record<AgentPhase, string> = {
  understand: 'أفهم طلبك',
  plan: 'أبني الخطة',
  ask: 'أحتاج قرارك',
  execute: 'أنفذ الآن',
  verify: 'أراجع النتيجة',
  recover: 'أعالج تعثراً',
  complete: 'اكتملت المهمة',
  paused: 'متوقف مؤقتاً',
  error: 'تحتاج المهمة إلى معالجة',
}

function componentForMessage(m: Message): UiComponent {
  switch (m.kind) {
    case 'tool_call':
    case 'tool':
      return 'tool_step'
    case 'link':
      return 'link_card'
    case 'file':
      return 'file_card'
    case 'ask_user':
      return 'ask_card'
    case 'confirmation':
      return 'confirm_card'
    case 'error':
      return 'error_card'
    case 'system':
      return 'system_card'
    default:
      return m.role === 'user' ? 'user_bubble' : 'assistant_message'
  }
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  items: [],
  activeContext: { goal: '', status: '' },
  executionSteps: [],
  auditTrail: [],
  statusBar: { visible: false, phase: 'understand', thinking: false, steps: [] },
  streamText: '',
  pending: null,
  _plan: null,
  _seq: 0,

  setMessages: (messages) => {
    const items: ChatItem[] = messages
      .filter((m) => m.kind !== 'tool_call')
      .map((m) => ({
        id: m.id,
        uiComponent: componentForMessage(m),
        message: m,
      }))
    set({ items, streamText: '', statusBar: { visible: false, phase: 'understand', thinking: false, steps: [] } })
  },

  applyEvent: (e) => {
    const s = get()
    const seq = s._seq + 1
    const pushAudit = (type: string, text: string) =>
      set((st) => ({
        auditTrail: [...st.auditTrail, { id: `a-${seq}-${type}`, at: Date.now(), type, text }].slice(-200),
      }))

    switch (e.type) {
      case 'phase': {
        const label = (e as Extract<VisibleAgentEvent, { type: 'phase' }>).label
        pushAudit('phase', `${label}: ${e.detail ?? ''}`)
        set((st) => ({
          statusBar: { ...st.statusBar, visible: true, phase: e.phase },
          executionSteps: [...st.executionSteps, { id: `s-${seq}`, kind: 'phase', label, status: e.phase } as ExecutionStep].slice(-40),
        }))
        break
      }
      case 'plan': {
        const plan = (e as Extract<VisibleAgentEvent, { type: 'plan' }>).plan
        pushAudit('plan', plan.goal)
        set((st) => ({
          _plan: plan,
          activeContext: { ...st.activeContext, goal: plan.goal, status: plan.status },
          executionSteps: [...st.executionSteps, { id: `s-${seq}`, kind: 'plan', label: plan.goal } as ExecutionStep].slice(-40),
        }))
        break
      }
      case 'plan_step': {
        const step = (e as Extract<VisibleAgentEvent, { type: 'plan_step' }>).step
        pushAudit('plan_step', `${step.title} — ${step.status}`)
        set((st) => ({
          _plan: st._plan ? { ...st._plan, steps: st._plan.steps.map((x) => (x.id === step.id ? step : x)) } : st._plan,
          executionSteps: [...st.executionSteps, { id: `s-${seq}`, kind: 'plan_step', label: step.title, status: step.status }].slice(-40),
        }))
        break
      }
      case 'skill': {
        const skill = (e as Extract<VisibleAgentEvent, { type: 'skill' }>).skill
        pushAudit('skill', skill.label)
        set((st) => ({ executionSteps: [...st.executionSteps, { id: `s-${seq}`, kind: 'skill', label: skill.label, detail: skill.description }].slice(-40) }))
        break
      }
      case 'progress': {
        pushAudit('progress', e.text)
        set((st) => ({
          statusBar: { ...st.statusBar, visible: true, steps: [...st.statusBar.steps, e.text].slice(-12) },
          executionSteps: [...st.executionSteps, { id: `s-${seq}`, kind: 'progress', label: e.text }].slice(-40),
        }))
        break
      }
      case 'tool': {
        const t = e as Extract<AgentEvent, { type: 'tool' }>
        pushAudit('tool', `${t.name}`)
        set((st) => ({
          executionSteps: [...st.executionSteps, { id: `s-${seq}`, kind: 'tool', label: String(t.name ?? 'execute') }].slice(-40),
        }))
        break
      }
      case 'observation':
      case 'recovery': {
        const o = e as Extract<VisibleAgentEvent, { type: 'observation' }> | Extract<VisibleAgentEvent, { type: 'recovery' }>
        pushAudit(o.type, o.detail)
        set((st) => ({ items: [...st.items, { id: `${o.type}-${seq}`, uiComponent: 'observation_card', payload: o }] }))
        break
      }
      case 'decision': {
        const d = (e as Extract<VisibleAgentEvent, { type: 'decision' }>).decision
        pushAudit('decision', d.title)
        set((st) => {
          const next: ActiveContext = { ...st.activeContext }
          if (d.kind === 'approval' || d.kind === 'result') next.status = d.title
          return {
            activeContext: next,
            items: [...st.items, { id: `decision-${seq}`, uiComponent: 'decision_card', payload: d }],
          }
        })
        break
      }
      case 'thinking': {
        set((st) => ({ statusBar: { ...st.statusBar, visible: true, thinking: true } }))
        break
      }
      case 'text':
      case 'stream': {
        const txt = (e as Extract<AgentEvent, { type: 'text' }> | Extract<AgentEvent, { type: 'stream' }>).content
        if (e.type === 'stream' && !(e as any).done) {
          set((st) => ({ streamText: txt ?? '', statusBar: { ...st.statusBar, visible: true, thinking: false, steps: [] } }))
        } else {
          set({ streamText: '' })
        }
        break
      }
      case 'ask_user': {
        const a = e as Extract<AgentEvent, { type: 'ask_user' }>
        pushAudit('ask_user', a.question)
        break
      }
      case 'confirmation': {
        const c = e as Extract<AgentEvent, { type: 'confirmation' }>
        pushAudit('confirmation', c.title)
        break
      }
      case 'file': {
        const f = e as Extract<AgentEvent, { type: 'file' }>
        pushAudit('file', f.name)
        break
      }
      case 'link': {
        const l = e as Extract<AgentEvent, { type: 'link' }>
        pushAudit('link', `${l.kind}:${l.id}`)
        break
      }
      case 'error': {
        const err = e as Extract<AgentEvent, { type: 'error' }>
        pushAudit('error', err.message)
        set((st) => ({ statusBar: { ...st.statusBar, visible: false, thinking: false }, streamText: '' }))
        break
      }
      case 'done': {
        const o = (e as Extract<AgentEvent, { type: 'done' }>).outcome ?? 'completed'
        pushAudit('done', o)
        set((st) => ({
          statusBar: { ...st.statusBar, visible: false, thinking: false, steps: [] },
          streamText: '',
          activeContext: { ...st.activeContext, status: o === 'completed' ? 'اكتملت المهمة' : o === 'paused' || o === 'cancelled' ? 'متوقف مؤقتاً' : 'تحتاج معالجة' },
          items: [...st.items, { id: `done-${seq}`, uiComponent: 'completion_pulse', payload: { outcome: o } }],
        }))
        break
      }
      default:
        break
    }
    set({ _seq: seq })
  },

  setPending: (p) => set({ pending: p }),

  reset: () =>
    set({
      items: [],
      activeContext: { goal: '', status: '' },
      executionSteps: [],
      auditTrail: [],
      statusBar: { visible: false, phase: 'understand', thinking: false, steps: [] },
      streamText: '',
      pending: null,
      _plan: null,
      _seq: 0,
    }),
}))

export type { ChatStoreState, AgentSkill }
