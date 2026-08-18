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
vi.mock('expo-file-system', () => ({
  File: class File {
    uri: string
    constructor(uri: string) { this.uri = uri }
    async text() { return '' }
    async arrayBuffer() { return new ArrayBuffer(0) }
    async base64() { return '' }
  },
  Directory: class Directory {},
  Paths: { cache: '', document: '' },
}))
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: vi.fn(async () => ({ exists: false, size: 0 })),
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
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn(async () => ({ canceled: true, assets: [] })) }))
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(async () => false), shareAsync: vi.fn(async () => {}) }))
vi.mock('expo-print', () => ({ printToFileAsync: vi.fn(async () => ({ uri: 'file:///test.pdf' })) }))
vi.mock('../src/database/dataSync', () => ({
  subscribeDataChanged: vi.fn(() => () => {}),
  notifyDataChanged: vi.fn(),
  useReloadOnData: vi.fn(),
}))
vi.mock('../src/database/workspace', () => ({}))

import { executeTool } from '../src/agent/registry'
import { buildToolObservation, runToolWithFeedback } from '../src/assistant/toolSchemas'

describe('real tool execution failure contract', () => {
  it('turns handler exceptions and guarded domain failures into model-visible failures', async () => {
    // يمر عبر TOOLS وhandler الحقيقيين: agentCreate يرمي استثناءً
    // عند إنشاء سجل plot_payments الخام، وexecuteTool يمسكه.
    const rawFailure = await executeTool('create', { entity: 'plot_payments', data: {} })
    expect(rawFailure.ok).toBe(false)
    const rawError = rawFailure.ok ? '' : rawFailure.error
    expect(rawError).toMatch(/plot_payments|ledger_record_payment|محظور/)

    const observation = buildToolObservation('create', rawFailure, { entity: 'plot_payments', data: {} })
    expect(observation).toMatch(/^\[فشل\]/)
    expect(observation).not.toMatch(/\[نجاح\]/)

    // المسار الأعلى المستخدم من runRegistryTool يحافظ على نفس العقد.
    const feedback = await runToolWithFeedback('create', { entity: 'plot_payments', data: {} })
    expect(feedback.ok).toBe(false)
    expect(feedback.observation).toMatch(/^\[فشل\]/)
    expect(feedback.result?.error).toBeTruthy()

    // فشل التحقق قبل قاعدة البيانات يجب أن يكون نتيجة فشل، لا استثناءً.
    const invalid = await runToolWithFeedback('create', { entity: 'blocks', data: { name: 'probe-without-project' } })
    expect(invalid.ok).toBe(false)
    expect(invalid.observation).toMatch(/^\[فشل\]/)
  })
})
