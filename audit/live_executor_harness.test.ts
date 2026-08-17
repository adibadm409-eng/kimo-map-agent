import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const messages = new Map<string, any[]>()
  const pending = new Map<string, any>()
  const settings: any = {
    activeProvider: 'gemini',
    models: { gemini: 'models/gemini-3-flash-preview', mistral: 'mistral-medium-2508' },
    keys: { gemini: '', mistral: '' },
    modelLists: {},
    customProviders: [],
    mode: 'read',
  }
  const events: any[] = []
  const taskRuns: any[] = []
  const brain: any[] = []
  const resetSession = (id: string) => {
    messages.set(id, [])
    pending.delete(id)
    events.length = 0
    taskRuns.length = 0
    brain.length = 0
  }
  return { messages, pending, settings, events, taskRuns, brain, resetSession }
})

vi.mock('../src/assistant/store', () => ({
  getSettings: vi.fn(async () => state.settings),
  activeConfig: vi.fn(async (settings: any) => {
    const provider = settings.activeProvider
    const baseUrl = provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai' : 'https://api.mistral.ai/v1'
    return { providerId: provider, providerName: provider === 'gemini' ? 'Gemini live harness' : 'Mistral live harness', model: settings.models[provider], baseUrl, apiKey: settings.keys[provider] }
  }),
  getMessages: vi.fn(async (sessionId: string) => [...(state.messages.get(sessionId) ?? [])]),
  addMessage: vi.fn(async (message: any) => {
    const list = state.messages.get(message.sessionId) ?? []
    const row = { ...message, id: `m-${list.length + 1}`, createdAt: Date.now() }
    list.push(row)
    state.messages.set(message.sessionId, list)
    return row
  }),
  updateSessionMeta: vi.fn(async () => {}),
  createTaskRun: vi.fn(async (input: any) => {
    const run = { id: `task-${state.taskRuns.length + 1}`, status: 'proposed', ...input }
    state.taskRuns.push(run)
    return run
  }),
  getLatestTaskRun: vi.fn(async (sessionId: string) => state.taskRuns.filter((run) => run.sessionId === sessionId).at(-1) ?? null),
  transitionTaskRun: vi.fn(async (id: string, status: string, patch: any = {}) => {
    const run = state.taskRuns.find((item) => item.id === id)
    if (run) Object.assign(run, { status, ...patch })
  }),
  appendTaskEvidence: vi.fn(async (id: string, evidence: any) => {
    const run = state.taskRuns.find((item) => item.id === id)
    if (run) run.evidence = [...(run.evidence ?? []), evidence]
  }),
  addBrainOp: vi.fn(async (_sessionId: string, kind: string, body: string) => state.brain.push({ kind, body })),
  listBrain: vi.fn(async () => [...state.brain]),
  clearBrain: vi.fn(async () => { state.brain.length = 0 }),
  getPending: vi.fn(async (sessionId: string) => state.pending.get(sessionId) ?? null),
  setPending: vi.fn(async (value: any) => state.pending.set(value.sessionId, value)),
  clearPending: vi.fn(async (sessionId: string) => state.pending.delete(sessionId)),
}))

vi.mock('../src/database/dataSync', () => ({
  subscribeDataChanged: vi.fn(() => () => {}),
  notifyDataChanged: vi.fn(),
  useReloadOnData: vi.fn(),
}))

vi.mock('../src/agent/catalog', () => ({
  compactAppCatalog: vi.fn(() => 'catalog-harness'),
  ALL_ENTITIES: [],
  ENTITY_LABELS: {},
}))

vi.mock('../src/assistant/prompts', () => ({
  buildSystemPrompt: vi.fn(() => 'Kimo live integration harness. Use current_local_time exactly when requested.'),
  getAgentFunctions: vi.fn(() => [{
    name: 'current_local_time',
    description: 'Read local time from device without writing data.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  }]),
  WRITE_TOOLS: new Set(),
  DELETE_CONFIRM_TOOLS: new Set(),
}))

vi.mock('../src/assistant/runtimeEvents', () => ({
  publishRuntimeEvent: vi.fn((sessionId: string, event: any) => state.events.push({ sessionId, ...event })),
  restoreRuntimeEvents: vi.fn(async () => []),
}))

vi.mock('../src/notifications/offerReminders', () => ({
  cancelLocalReminder: vi.fn(async () => {}),
  cancelOfferReminder: vi.fn(async () => {}),
  scheduleLocalReminder: vi.fn(async () => 'reminder-test'),
  scheduleOfferReminder: vi.fn(async () => 'reminder-test'),
}))

vi.mock('../src/database/workspace', () => ({
  saveAttachment: vi.fn(async () => 'attachment-test-1'),
}))

vi.mock('../src/assistant/files', () => ({
  readAudioInput: vi.fn(async () => ({ name: 'test.wav', uri: 'file:///test.wav', size: 1600, format: 'wav', base64: 'UklGRg==' })),
}))

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: vi.fn(async () => ({ exists: false, size: 0 })),
}))

vi.mock('../src/assistant/undo', () => ({
  performUndo: vi.fn(),
  toolSig: vi.fn((call: any) => `${call.name}:${call.arguments}`),
}))

vi.mock('../src/assistant/invokeTools', () => ({
  handleToolCall: vi.fn(async (sessionId: string, _settings: any, call: any, _emitEvents: boolean) => {
    const { persistPair } = await import('../src/assistant/persist')
    const result = { iso: new Date().toISOString(), timezone: 'local', offsetMinutes: 0, harness: 'current_local_time' }
    await persistPair(sessionId, call, JSON.stringify(result), undefined, { name: 'current_local_time', args: {}, result, observation: `[نجاح] current_local_time: ${JSON.stringify(result)}`, ok: true })
    return true
  }),
  deleteOne: vi.fn(),
  deleteApproved: vi.fn(),
  deleteRefused: vi.fn(),
}))

const originalFetch = globalThis.fetch

afterAll(() => {
  globalThis.fetch = originalFetch
})

async function runScenario(provider: 'gemini' | 'mistral', key: string, model: string) {
  state.resetSession(`live-${provider}`)
  state.settings.activeProvider = provider
  state.settings.keys[provider] = key
  state.settings.models[provider] = model
  const { sendUserMessage } = await import('../src/assistant/executor')
  await sendUserMessage(`live-${provider}`, 'استخدم أداة current_local_time ثم أعد لي النتيجة دون كتابة أي بيانات.')
  const rows = state.messages.get(`live-${provider}`) ?? []
  return { rows, taskRuns: [...state.taskRuns], events: [...state.events] }
}

describe('Kimo real executor live harness', () => {
  it('runs the actual sendUserMessage/executor/providerWire loop with Gemini and Mistral', async () => {
    const gemini = process.env.KIMO_GEMINI_KEY
    const mistral = process.env.KIMO_MISTRAL_KEY
    expect(gemini).toBeTruthy()
    expect(mistral).toBeTruthy()

    const geminiRun = await runScenario('gemini', gemini!, 'models/gemini-3-flash-preview')
    const mistralRun = await runScenario('mistral', mistral!, 'mistral-medium-2508')

    for (const [provider, run] of [['gemini', geminiRun], ['mistral', mistralRun]] as const) {
      const user = run.rows.find((row: any) => row.role === 'user')
      const assistantTool = run.rows.find((row: any) => row.role === 'assistant' && row.kind === 'tool_call')
      const toolResult = run.rows.find((row: any) => row.role === 'tool')
      const assistantText = run.rows.find((row: any) => row.role === 'assistant' && row.kind === 'text')
      expect(user?.content).toContain('current_local_time')
      expect(assistantTool?.meta?.tool_calls?.length).toBeGreaterThan(0)
      expect(toolResult?.meta?.name).toBe('current_local_time')
      expect(toolResult?.meta?.ok).toBe(true)
      expect(assistantText?.content).toBeTruthy()
      // طلب قراءة وقت/أداة بلا كتابة ليس مهمة تنفيذية؛ لا تُنشأ بطاقة خطة مصطنعة.
      expect(run.taskRuns).toHaveLength(0)
      if (provider === 'gemini') {
        expect(assistantTool.meta.tool_calls[0].extra_content.google.thought_signature).toBeTruthy()
      } else {
        expect(assistantTool.meta.tool_calls[0].extra_content).toBeUndefined()
      }
    }
  }, 180_000)
})
