/**
 * Agent Worker — عامل تنفيذ مستمر في الواجهة الأمامية.
 *
 * يبقى متصلاً بالمزود وينفّذ المهام خطوة بخطوة عبر المحرك الموجود.
 * يتتبع ما أنجزه وما فشل وما لم يُنجز بعد، ويبث أحداث التقدم للواجهة.
 *
 * الفكرة: العامل يتفكيك الهدف إلى خطوات، ثم يمرر كل خطوة إلى sendUserMessage
 * (التي تستخدم KIMO_ENGINE_ENABLED أو runGuarded حسب الإعداد)، ويتتبع النتيجة.
 * السجل يبقى متصلاً عبر SessionStore.
 */

import { getMessages, getSettings, activeConfig, type AgentSettings } from './store'
import { persistUser, persistAssistantText } from './persist'
import { chatWithRetry, type ChatMessage } from './llm'
import { emitForSession, isCancelled, type AgentEvent, type AgentOutcome } from './agentRun'
import { runViaKimoNative } from './kimoNative'
import { KIMO_ENGINE_ENABLED } from './kimoBridge'
import { defaultProvider, type ProviderDef, type ProviderId } from './providers'

// ── types ──────────────────────────────────────────────────────────────────

export interface WorkerStep {
  id: string
  title: string
  description: string
  intent: 'read' | 'write' | 'verify' | 'ask' | 'general'
  status: 'pending' | 'active' | 'done' | 'failed' | 'skipped'
  toolHint?: string
  result?: { ok: boolean; output: string; error?: string }
  startedAt?: number
  finishedAt?: number
}

export interface WorkerTask {
  id: string
  sessionId: string
  goal: string
  steps: WorkerStep[]
  currentIndex: number
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  updatedAt: number
}

export type WorkerEvent =
  | { type: 'task_started'; task: WorkerTask }
  | { type: 'step_started'; task: WorkerTask; step: WorkerStep; stepIndex: number }
  | { type: 'step_completed'; task: WorkerTask; step: WorkerStep; stepIndex: number }
  | { type: 'step_failed'; task: WorkerTask; step: WorkerStep; stepIndex: number; error: string }
  | { type: 'task_completed'; task: WorkerTask; summary: string }
  | { type: 'task_failed'; task: WorkerTask; error: string }
  | { type: 'progress'; message: string }

export type WorkerListener = (event: WorkerEvent) => void

// ── helpers ────────────────────────────────────────────────────────────────

function providerProxy(conn: { providerId: string; baseUrl: string; providerName: string }): ProviderDef {
  if (conn.providerId.startsWith('custom:')) {
    return { id: 'custom', name: conn.providerName, color: '#888888', baseUrl: conn.baseUrl, defaultModels: [], modelsKind: 'openai' }
  }
  const def = defaultProvider(conn.providerId as ProviderId)
  return { ...def, baseUrl: conn.baseUrl || def.baseUrl }
}

function makeTaskId(): string {
  return `wt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function makeStepId(index: number, title: string): string {
  const slug = title.toLowerCase().replace(/[^\w\u0600-\u06FF]+/g, '_').slice(0, 20)
  return `ws-${index}_${slug}`
}

// ── plan decomposition (via LLM) ───────────────────────────────────────────

async function decomposeGoal(
  goal: string,
  conn: { providerId: string; baseUrl: string; apiKey: string; providerName: string; model: string },
  settings: AgentSettings,
): Promise<WorkerStep[]> {
  const prompt = `أنت مُنسّق مهام في تطبيق إدارة العقارات.
حلّل الطلب التالي إلى خطوات تنفيذية متسلسلة.

الأدوات المتاحة: query, get, list, mutate_record, record_payment, project_tree, project_financials, installment_schedule, payment_ledger, project_integrity_check, buyer_summary, dashboard_kpis, ask_user, request_confirmation.

الطلب: ${goal}

أعد الناتج كـ JSON حصرياً (بدون نص آخر):
{
  "steps": [
    {"title": "عنوان", "description": "وصف", "intent": "read|write|verify|ask|general", "tool_hint": "اسم الأداة أو فارغ"}
  ]
}

- إذا كان الطلب بسيطاً (سؤال، عرض واحد)، أعد خطوة واحدة.
- intent="verify" للتحقق بعد تعديل/حذف.
- لا تكرر الخطوات.`

  const system: ChatMessage = {
    role: 'system',
    content: `أنت مساعد ذكي في تطبيق إدارة العقارات. المزود: ${conn.providerName} — الموديل: ${conn.model}.`,
  }

  try {
    const result = await chatWithRetry(
      {
        provider: providerProxy(conn),
        baseUrl: conn.baseUrl,
        apiKey: conn.apiKey,
        model: conn.model,
        messages: [system, { role: 'user', content: prompt }],
        functions: [],
        maxTokens: 1500,
      },
      () => {},
      new AbortController().signal,
    )

    const text = (result.content || '').trim()
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    const jsonStr = fence ? fence[1] : text
    const start = jsonStr.indexOf('{')
    const end = jsonStr.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const data = JSON.parse(jsonStr.slice(start, end + 1))
      const rawSteps = data.steps || []
      if (rawSteps.length > 0) {
        return rawSteps.map((s: any, i: number) => ({
          id: makeStepId(i, s.title || `خطوة ${i + 1}`),
          title: s.title || `خطوة ${i + 1}`,
          description: s.description || '',
          intent: s.intent || 'general',
          status: 'pending' as const,
          toolHint: s.tool_hint || '',
        }))
      }
    }
  } catch {}

  // Fallback: single step
  return [{
    id: makeStepId(0, 'تنفيذ'),
    title: 'تنفيذ الطلب',
    description: goal,
    intent: 'general',
    status: 'pending',
  }]
}

// ── AgentWorker ────────────────────────────────────────────────────────────

export class AgentWorker {
  private listeners = new Set<WorkerListener>()
  private activeTasks = new Map<string, WorkerTask>()

  subscribe(fn: WorkerListener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit(event: WorkerEvent): void {
    this.listeners.forEach((fn) => {
      try { fn(event) } catch {}
    })
    // Also emit to session-level event system for UI updates
    const task = 'task' in event ? (event as any).task as WorkerTask : undefined
    if (task) {
      const agentEvent = this.toAgentEvent(event)
      if (agentEvent) emitForSession(task.sessionId, agentEvent)
    }
  }

  private toAgentEvent(event: WorkerEvent): AgentEvent | null {
    switch (event.type) {
      case 'step_started':
        return { type: 'progress', text: `خطوة ${event.stepIndex + 1}: ${event.step.title}` }
      case 'step_completed':
        return { type: 'progress', text: `✓ ${event.step.title}` }
      case 'step_failed':
        return { type: 'error', message: `فشلت «${event.step.title}»: ${event.error}` }
      case 'task_completed':
        return { type: 'text', content: event.summary }
      case 'task_failed':
        return { type: 'error', message: event.error }
      case 'progress':
        return { type: 'progress', text: event.message }
      default:
        return null
    }
  }

  getTask(taskId: string): WorkerTask | undefined {
    return this.activeTasks.get(taskId)
  }

  getSessionTask(sessionId: string): WorkerTask | undefined {
    for (const task of this.activeTasks.values()) {
      if (task.sessionId === sessionId) return task
    }
    return undefined
  }

  isBusy(sessionId: string): boolean {
    const task = this.getSessionTask(sessionId)
    return task != null && task.status === 'running'
  }

  cancelTask(taskId: string): void {
    const task = this.activeTasks.get(taskId)
    if (task && task.status === 'running') {
      task.status = 'cancelled'
      task.updatedAt = Date.now()
      this.emit({ type: 'task_failed', task, error: 'تم الإلغاء بواسطة المستخدم' })
    }
  }

  /**
   * شغّل مهمة جديدة: تفكيك الهدف ثم تنفيذ كل خطوة.
   */
  async runTask(sessionId: string, goal: string): Promise<WorkerTask> {
    const settings = await getSettings()
    const conn = activeConfig(settings)
    if (!conn.apiKey || !conn.model) {
      throw new Error('لم يُعدَّ المزود بعد: أضف مفتاح API واختر موديلاً.')
    }

    // Decompose goal into steps
    const steps = await decomposeGoal(goal, conn, settings)
    steps[0].status = 'active'
    steps[0].startedAt = Date.now()

    const task: WorkerTask = {
      id: makeTaskId(),
      sessionId,
      goal,
      steps,
      currentIndex: 0,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.activeTasks.set(task.id, task)
    this.emit({ type: 'task_started', task })

    // Persist the user's original goal
    await persistUser(sessionId, goal)

    // Execute each step
    try {
      await this.executeSteps(task, conn, settings)
    } catch (err: any) {
      task.status = 'failed'
      task.updatedAt = Date.now()
      const msg = err?.message || String(err)
      this.emit({ type: 'task_failed', task, error: msg })
      await persistAssistantText(sessionId, `فشلت المهمة: ${msg}`, 'error').catch(() => {})
    }

    return task
  }

  private async executeSteps(
    task: WorkerTask,
    conn: { providerId: string; baseUrl: string; apiKey: string; providerName: string; model: string },
    settings: AgentSettings,
  ): Promise<void> {
    const { sessionId } = task

    for (let i = 0; i < task.steps.length; i++) {
      if (isCancelled(sessionId) || task.status === 'cancelled') {
        task.status = 'cancelled'
        break
      }

      const step = task.steps[i]
      if (step.status !== 'active' && step.status !== 'pending') continue

      step.status = 'active'
      step.startedAt = Date.now()
      task.currentIndex = i
      task.updatedAt = Date.now()
      this.emit({ type: 'step_started', task, step, stepIndex: i })

      // Build the step prompt
      const stepPrompt = this.buildStepMessage(task, i)

      // Execute via the existing engine path
      let outcome: AgentOutcome = 'failed'
      try {
        if (KIMO_ENGINE_ENABLED) {
          outcome = await runViaKimoNative(sessionId, stepPrompt)
        } else {
          // For non-embedded (Expo Go), use the same path as sendUserMessage
          // but we persist the step prompt as a user message first
          outcome = await runViaKimoNative(sessionId, stepPrompt)
        }
      } catch (err: any) {
        outcome = 'failed'
        const msg = err?.message || String(err)
        step.result = { ok: false, output: '', error: msg }
        step.status = 'failed'
        step.finishedAt = Date.now()
        task.updatedAt = Date.now()
        this.emit({ type: 'step_failed', task, step, stepIndex: i, error: msg })

        // Stop on write/verify failure
        if (step.intent === 'write' || step.intent === 'verify') {
          task.status = 'failed'
          this.emit({ type: 'task_failed', task, error: `فشلت الخطوة «${step.title}»: ${msg}` })
          return
        }
        continue
      }

      // Get the result from the last assistant message
      const msgs = await getMessages(sessionId).catch(() => [])
      const lastAssistant = msgs.filter((m) => m.role === 'assistant').pop()
      const output = lastAssistant?.content || ''

      step.result = {
        ok: outcome === 'completed',
        output: output.slice(0, 500),
        error: outcome !== 'completed' ? 'فشل التنفيذ' : undefined,
      }
      step.status = step.result.ok ? 'done' : 'failed'
      step.finishedAt = Date.now()
      task.updatedAt = Date.now()

      if (step.result.ok) {
        this.emit({ type: 'step_completed', task, step, stepIndex: i })
      } else {
        this.emit({ type: 'step_failed', task, step, stepIndex: i, error: step.result.error || 'فشل' })
        if (step.intent === 'write' || step.intent === 'verify') {
          task.status = 'failed'
          this.emit({ type: 'task_failed', task, error: `فشلت الخطوة «${step.title}»` })
          return
        }
      }
    }

    // All steps done
    if (task.status === 'running') {
      task.status = 'completed'
      task.updatedAt = Date.now()
      const completed = task.steps.filter((s) => s.status === 'done').length
      const summary = `تم ${completed}/${task.steps.length} خطوات.`
      this.emit({ type: 'task_completed', task, summary })
    }
  }

  private buildStepMessage(task: WorkerTask, stepIndex: number): string {
    const step = task.steps[stepIndex]
    const parts = [
      `[خطة العمل — الخطوة ${stepIndex + 1}/${task.steps.length}]`,
      `الهدف: ${task.goal}`,
      '',
      `الخطوة: ${step.title}`,
    ]
    if (step.description) parts.push(`التفاصيل: ${step.description}`)
    if (step.toolHint) parts.push(`الأداة: ${step.toolHint}`)
    parts.push('', 'نفّذ هذه الخطوة فقط وأبلغ عن النتيجة.')
    return parts.join('\n')
  }
}

// ── singleton ──────────────────────────────────────────────────────────────

let _worker: AgentWorker | null = null

export function getWorker(): AgentWorker {
  if (!_worker) _worker = new AgentWorker()
  return _worker
}
