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
  appendItems: (items: ChatItem[]) => void
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

  appendItems: (items) => {
    if (!items.length) return
    const ids = new Set(items.map((i) => i.id))
    set((s) => ({ items: [...s.items.filter((i) => !ids.has(i.id)), ...items] }))
  },

  applyEvent: (e) => {
    const s = get()
    const seq = s._seq + 1
    const auditEntry = (type: string, text: string) => ({ id: `a-${seq}-${type}`, at: Date.now(), type, text })

    // تجميع كل التغييرات في set() واحدة فقط لتجنب الحلقة اللانهائية
    const patch: Partial<ChatStoreState> = { _seq: seq }

    switch (e.type) {
      case 'phase': {
        const label = (e as Extract<VisibleAgentEvent, { type: 'phase' }>).label
        patch.auditTrail = [...s.auditTrail, auditEntry('phase', `${label}: ${e.detail ?? ''}`)].slice(-200)
        patch.statusBar = { ...s.statusBar, visible: true, phase: e.phase }
        patch.executionSteps = [...s.executionSteps, { id: `s-${seq}`, kind: 'phase', label, status: e.phase } as ExecutionStep].slice(-40)
        break
      }
      case 'plan': {
        const plan = (e as Extract<VisibleAgentEvent, { type: 'plan' }>).plan
        patch.auditTrail = [...s.auditTrail, auditEntry('plan', plan.goal)].slice(-200)
        patch._plan = plan
        patch.activeContext = { ...s.activeContext, goal: plan.goal, status: plan.status }
        patch.executionSteps = [...s.executionSteps, { id: `s-${seq}`, kind: 'plan', label: plan.goal } as ExecutionStep].slice(-40)
        break
      }
      case 'plan_step': {
        const step = (e as Extract<VisibleAgentEvent, { type: 'plan_step' }>).step
        patch.auditTrail = [...s.auditTrail, auditEntry('plan_step', `${step.title} — ${step.status}`)].slice(-200)
        patch._plan = s._plan ? { ...s._plan, steps: s._plan.steps.map((x) => (x.id === step.id ? step : x)) } : s._plan
        patch.executionSteps = [...s.executionSteps, { id: `s-${seq}`, kind: 'plan_step', label: step.title, status: step.status } as ExecutionStep].slice(-40)
        break
      }
      case 'skill': {
        const skill = (e as Extract<VisibleAgentEvent, { type: 'skill' }>).skill
        patch.auditTrail = [...s.auditTrail, auditEntry('skill', skill.label)].slice(-200)
        patch.executionSteps = [...s.executionSteps, { id: `s-${seq}`, kind: 'skill', label: skill.label, detail: skill.description } as ExecutionStep].slice(-40)
        break
      }
      case 'progress': {
        patch.auditTrail = [...s.auditTrail, auditEntry('progress', e.text)].slice(-200)
        patch.statusBar = { ...s.statusBar, visible: true, steps: [...s.statusBar.steps, e.text].slice(-12) }
        patch.executionSteps = [...s.executionSteps, { id: `s-${seq}`, kind: 'progress', label: e.text } as ExecutionStep].slice(-40)
        break
      }
      case 'tool': {
        const t = e as Extract<AgentEvent, { type: 'tool' }>
        patch.auditTrail = [...s.auditTrail, auditEntry('tool', toolLabel(t.name))].slice(-200)
        patch.executionSteps = [...s.executionSteps, { id: `s-${seq}`, kind: 'tool', label: toolLabel(String(t.name ?? 'execute')) } as ExecutionStep].slice(-40)
        break
      }
      case 'observation':
      case 'recovery': {
        const o = e as Extract<VisibleAgentEvent, { type: 'observation' }> | Extract<VisibleAgentEvent, { type: 'recovery' }>
        patch.auditTrail = [...s.auditTrail, auditEntry(o.type, o.detail)].slice(-200)
        patch.items = [...s.items, { id: `${o.type}-${seq}`, uiComponent: 'observation_card', payload: o }]
        break
      }
      case 'decision': {
        const d = (e as Extract<VisibleAgentEvent, { type: 'decision' }>).decision
        patch.auditTrail = [...s.auditTrail, auditEntry('decision', d.title)].slice(-200)
        const next: ActiveContext = { ...s.activeContext }
        if (d.kind === 'approval' || d.kind === 'result') next.status = d.title
        patch.activeContext = next
        patch.items = [...s.items, { id: `decision-${seq}`, uiComponent: 'decision_card', payload: d }]
        break
      }
      case 'thinking': {
        patch.statusBar = { ...s.statusBar, visible: true, thinking: true }
        break
      }
      case 'text': {
        const txt = (e as Extract<AgentEvent, { type: 'text' }>).content
        if (txt) {
          patch.items = [...s.items, {
            id: `text-${seq}`,
            uiComponent: 'assistant_message',
            message: { id: `text-${seq}`, sessionId: (e as any).sessionId ?? '', role: 'assistant', kind: 'text', content: txt, createdAt: Date.now() } as any,
          }]
        }
        patch.streamText = ''
        break
      }
      case 'stream': {
        const txt = (e as Extract<AgentEvent, { type: 'stream' }>).content
        if (!(e as any).done) {
          patch.streamText = txt ?? ''
          patch.statusBar = { ...s.statusBar, visible: true, thinking: false }
        } else {
          patch.streamText = ''
        }
        break
      }
      case 'ask_user': {
        const a = e as Extract<AgentEvent, { type: 'ask_user' }>
        patch.auditTrail = [...s.auditTrail, auditEntry('ask_user', a.question)].slice(-200)
        break
      }
      case 'confirmation': {
        const c = e as Extract<AgentEvent, { type: 'confirmation' }>
        patch.auditTrail = [...s.auditTrail, auditEntry('confirmation', c.title)].slice(-200)
        break
      }
      case 'file': {
        const f = e as Extract<AgentEvent, { type: 'file' }>
        patch.auditTrail = [...s.auditTrail, auditEntry('file', f.name)].slice(-200)
        break
      }
      case 'link': {
        const l = e as Extract<AgentEvent, { type: 'link' }>
        patch.auditTrail = [...s.auditTrail, auditEntry('link', `${l.kind}:${l.id}`)].slice(-200)
        break
      }
      case 'done': {
        const o = (e as Extract<AgentEvent, { type: 'done' }>).outcome ?? 'completed'
        patch.auditTrail = [...s.auditTrail, auditEntry('done', o)].slice(-200)
        patch.statusBar = { ...s.statusBar, visible: false, thinking: false, steps: [] }
        patch.streamText = ''
        patch.activeContext = { ...s.activeContext, status: o === 'completed' ? 'اكتملت المهمة' : o === 'paused' || o === 'cancelled' ? 'متوقف مؤقتاً' : 'تحتاج معالجة' }
        patch.items = [...s.items, { id: `done-${seq}`, uiComponent: 'completion_pulse', payload: { outcome: o } }]
        if (o === 'completed' || o === 'failed' || o === 'cancelled') patch._plan = null
        break
      }
      case 'error': {
        const err = (e as Extract<AgentEvent, { type: 'error' }>).message
        if (typeof err === 'string' && err.startsWith('تعذر الوصول للمزود (محاولة')) break
        patch.auditTrail = [...s.auditTrail, auditEntry('error', String(err ?? ''))].slice(-200)
        patch.statusBar = { ...s.statusBar, visible: false, thinking: false }
        patch.streamText = ''
        patch._plan = null
        break
      }
      default:
        break
    }
    set(patch)
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
