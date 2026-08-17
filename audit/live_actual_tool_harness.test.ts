import { describe, expect, it, vi } from 'vitest'

vi.mock('expo', () => ({
  SharedRef: class SharedRef {},
  SharedObject: class SharedObject {},
  requireNativeView: vi.fn(() => 'NativeView'),
}))
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => {}),
    runAsync: vi.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    getFirstAsync: vi.fn(async () => null),
    getAllAsync: vi.fn(async () => []),
    getEachAsync: vi.fn(async function* () {}),
  })),
}))
vi.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationHandler: vi.fn(),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  getPermissionsAsync: vi.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: vi.fn(async () => 'notification-test'),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  setNotificationChannelAsync: vi.fn(async () => {}),
}))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn(async () => {}), deleteItemAsync: vi.fn(async () => {}) }))
vi.mock('expo-file-system/legacy', () => ({ getInfoAsync: vi.fn(async () => ({ exists: false, size: 0 })) }))
vi.mock('../src/database/dataSync', () => ({
  subscribeDataChanged: vi.fn(() => () => {}),
  notifyDataChanged: vi.fn(),
  useReloadOnData: vi.fn(),
}))
vi.mock('../src/database/workspace', () => ({}))
vi.mock('../src/database/audit', () => ({
  withAuditCtx: async (_ctx: any, fn: () => Promise<any>) => fn(),
  queryChangeLog: vi.fn(async () => []),
  changeLogStats: vi.fn(async () => ({})),
  dailyActorStats: vi.fn(async () => []),
}))
vi.mock('../src/assistant/runtimeEvents', () => ({
  publishRuntimeEvent: vi.fn(),
  restoreRuntimeEvents: vi.fn(async () => []),
}))
vi.mock('../src/assistant/files', () => ({
  readAudioInput: vi.fn(async () => ({ name: 'test.wav', uri: 'file:///test.wav', size: 1600, format: 'wav', base64: 'UklGRg==' })),
}))
vi.mock('../src/assistant/undo', () => ({
  captureBefore: vi.fn(async () => null),
  captureToolUndoBefore: vi.fn(async () => null),
  recordUndo: vi.fn(async () => {}),
  performUndo: vi.fn(async () => 'undo-test'),
  toolSig: vi.fn((call: any) => `${call.name}:${call.arguments}`),
  removeUndo: vi.fn(async () => {}),
  pushUndo: vi.fn(async () => {}),
}))

const state = vi.hoisted(() => {
  const messages = new Map<string, any[]>()
  const requestedTool = { name: 'current_local_time' }
  const settings: any = {
    activeProvider: 'gemini',
    models: { gemini: 'models/gemini-3-flash-preview', mistral: 'mistral-medium-2508' },
    keys: { gemini: '', mistral: '' },
    modelLists: {},
    customProviders: [],
    mode: 'read',
  }
  return { messages, settings, requestedTool }
})

vi.mock('../src/assistant/store', () => ({
  getSettings: vi.fn(async () => state.settings),
  activeConfig: vi.fn(async (settings: any) => {
    const provider = settings.activeProvider
    return {
      providerId: provider,
      providerName: provider === 'gemini' ? 'Gemini actual tool harness' : 'Mistral actual tool harness',
      model: settings.models[provider],
      baseUrl: provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai' : 'https://api.mistral.ai/v1',
      apiKey: settings.keys[provider],
    }
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
  createSession: vi.fn(async (id: string) => ({ id })),
  createTaskRun: vi.fn(async () => ({ id: 'task-actual-tool', status: 'proposed' })),
  getLatestTaskRun: vi.fn(async () => null),
  transitionTaskRun: vi.fn(async () => {}),
  appendTaskEvidence: vi.fn(async () => {}),
  addBrainOp: vi.fn(async () => {}),
  listBrain: vi.fn(async () => []),
  clearBrain: vi.fn(async () => {}),
  getPending: vi.fn(async () => null),
  setPending: vi.fn(async () => {}),
  clearPending: vi.fn(async () => {}),
  listUndo: vi.fn(async () => []),
  peekUndo: vi.fn(async () => null),
  removeUndo: vi.fn(async () => {}),
  pushUndo: vi.fn(async () => {}),
  searchSessions: vi.fn(async () => []),
}))
vi.mock('../src/assistant/prompts', () => ({
  buildSystemPrompt: vi.fn(() => `Use ${state.requestedTool.name} exactly once, then explain the result without writing data.`),
  getAgentFunctions: vi.fn(() => [
    {
      name: 'current_local_time',
      description: 'Read local time from the device.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'list_entities',
      description: 'List all real application entities.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  ]),
  WRITE_TOOLS: new Set(),
  DELETE_CONFIRM_TOOLS: new Set(),
}))

import { sendUserMessage } from '../src/assistant/executor'

describe('Kimo live actual tool harness', () => {
  it('uses the real executor, real handleToolCall, real registry and real tool handler', async () => {
    const geminiKey = process.env.KIMO_GEMINI_KEY
    const mistralKey = process.env.KIMO_MISTRAL_KEY
    expect(geminiKey).toBeTruthy()
    expect(mistralKey).toBeTruthy()

    const results: { provider: string; model: string; tool: string; ok: boolean; error?: string }[] = []
    for (const [provider, key] of [['mistral', mistralKey!], ['gemini', geminiKey!]] as const) {
      state.settings.activeProvider = provider
      state.settings.keys[provider] = key
      for (const tool of ['current_local_time', 'list_entities']) {
        state.requestedTool.name = tool
        const sessionId = `live-actual-tool-${provider}-${tool}`
        state.messages.set(sessionId, [])
        const prompt = tool === 'current_local_time'
          ? 'اقرأ الوقت المحلي باستخدام current_local_time ثم اشرح النتيجة دون كتابة بيانات.'
          : 'استخدم list_entities لقراءة قائمة الكيانات الحقيقية في التطبيق ثم لخصها دون كتابة بيانات.'
        await sendUserMessage(sessionId, prompt)
        const rows = state.messages.get(sessionId) ?? []
        const toolCall = rows.find((row: any) => row.role === 'assistant' && row.kind === 'tool_call')
        const toolResult = rows.find((row: any) => row.role === 'tool' && row.meta?.name === tool)
        const assistantText = rows.find((row: any) => row.role === 'assistant' && row.kind === 'text')
        const errorRow = rows.find((row: any) => row.kind === 'error')
        const model = state.settings.models[provider]
        const failure = errorRow?.content ? String(errorRow.content) : !toolCall?.meta?.tool_calls?.length ? 'لم يعد الموديل نداء أداة' : !toolResult?.meta?.ok ? 'نتيجة الأداة غير ناجحة' : !assistantText?.content ? 'لا يوجد رد نهائي' : ''
        results.push({ provider, model, tool, ok: !failure, error: failure || undefined })
        if (failure) {
          console.log(JSON.stringify({ provider, model, requestedTool: tool, failure, rows: rows.map((row: any) => ({ role: row.role, kind: row.kind, name: row.meta?.name, ok: row.meta?.ok, content: typeof row.content === 'string' ? row.content.slice(0, 220) : undefined })) }))
          continue
        }
        expect(toolCall?.meta?.tool_calls?.length).toBeGreaterThan(0)
        expect(toolResult?.meta?.ok).toBe(true)
        expect(toolResult?.meta?.observation).toMatch(/^\[نجاح\]/)
        if (tool === 'current_local_time') expect(toolResult?.meta?.result).toMatch(/iso|timezone|offsetMinutes/)
        if (tool === 'list_entities') expect(toolResult?.meta?.result).toMatch(/properties|clients|offers/)
        expect(assistantText?.content).toBeTruthy()
      }
    }
    console.log(JSON.stringify({ liveMatrix: results }))
    expect(results).toHaveLength(4)
        expect(results.some((row) => row.provider === 'mistral' && row.ok)).toBe(true)
  }, 180_000)

})
