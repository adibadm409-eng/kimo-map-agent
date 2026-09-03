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
vi.mock('../src/database/dataSync', () => ({ subscribeDataChanged: vi.fn(() => () => {}), notifyDataChanged: vi.fn(), useReloadOnData: vi.fn() }))
vi.mock('../src/database/workspace', () => ({}))

import { buildToolSchemas, adaptToolArgs } from '../src/assistant/toolSchemas'
import { getAgentFunctions } from '../src/assistant/prompts'
import { getSkillById, matchSkill } from '../src/assistant/skills'

describe('unified mutation contract', () => {
  it('exposes one schema and normalizes operation aliases', () => {
    const schemas = buildToolSchemas()
    expect(schemas.mutate_record).toBeTruthy()
    expect(schemas.mutate_record.properties.operation.enum).toEqual(['create', 'update', 'delete'])
    expect(schemas.mutate_record.properties.entity.enum).toContain('properties')

    expect(adaptToolArgs('mutate_record', { action: 'add', entity: 'عقار', values: { name: 'اختبار' } })).toMatchObject({ operation: 'create', entity: 'properties', data: { name: 'اختبار' } })
    expect(adaptToolArgs('mutate_record', { mode: 'edit', entity: 'عميل', id: 'client-1', data: { phone: '700000000' } })).toMatchObject({ operation: 'update', entity: 'clients', id: 'client-1' })
    expect(adaptToolArgs('mutate_record', { operation: 'remove', entity: 'عرض', id: 'offer-1' })).toMatchObject({ operation: 'delete', entity: 'offers', id: 'offer-1' })
  })

  it('does not inject project-only aliases into property or client mutations', () => {
    const property = adaptToolArgs('preview_update', {
      entity: 'properties',
      id: 'property-1',
      data: { price: 19500000, area: 2600, project: 'wrong-project', block: 'wrong-block', plot: 'wrong-plot' },
    })
    expect(property.data).toEqual({ price: 19500000, area: 2600, area_sqm: 2600, project: 'wrong-project', block: 'wrong-block', plot: 'wrong-plot' })
    expect(property.data).not.toHaveProperty('project_id')

    const client = adaptToolArgs('mutate_record', {
      operation: 'update',
      entity: 'clients',
      id: 'client-1',
      data: { phone: '777000000', project_name: 'wrong-project', size: 12 },
    })
    expect(client.data).toEqual({ phone: '777000000', project_name: 'wrong-project', area: 12 })
    expect(client.data).not.toHaveProperty('project_id')
    expect(client.data).not.toHaveProperty('area_sqm')
  })

  it('keeps project alias normalization scoped to project entities', () => {
    const plot = adaptToolArgs('mutate_record', {
      operation: 'update',
      entity: 'plots',
      id: 'plot-1',
      data: { project: 'project-1', block: 'block-1', plot: 'plot-1', area: 600, price: 4200000 },
    })
    expect(plot.data).toMatchObject({ project_id: 'project-1', block_id: 'block-1', plot_id: 'plot-1', area_sqm: 600, value: 4200000 })
  })

  it('routes existing-project field updates to project_operations', () => {
    const match = matchSkill('عدّل نوع التقسيط للقطعة A-01 في مشروع QA-LAND-PROJECT-2026 إلى monthly')
    expect(match.skill.id).toBe('project_operations')
  })

  it('normalizes property area aliases at the tool boundary', () => {
    const patch = adaptToolArgs('mutate_record', {
      operation: 'update',
      entity: 'properties',
      id: 'property-1',
      data: { area_sqm: '420' },
    })
    expect(patch.data).toMatchObject({ area_sqm: '420', area: '420' })
  })

  it('does not inject undefined project aliases into a minimal plot patch', () => {
    const plot = adaptToolArgs('mutate_record', {
      operation: 'update',
      entity: 'plots',
      id: 'plot-1',
      data: { installment_type: 'monthly' },
    })
    expect(plot.data).toEqual({ installment_type: 'monthly' })
    expect(plot.data).not.toHaveProperty('project_id')
    expect(plot.data).not.toHaveProperty('plot_id')
    expect(Object.keys(plot.data)).toEqual(['installment_type'])
  })

  it('routes composite client/property offer requests to the offer skill', () => {
    const match = matchSkill('أنشئ عميلاً واربطه بعقار في عرض شراء مع تنبيهين ومواعيد متابعة')
    expect(match.skill.id).toBe('offer_management')
  })

  it('exposes the unified mutate_record surface for every operational skill', () => {
    for (const skillId of ['project_operations', 'property_management', 'client_relationship', 'offer_management']) {
      const skill = getSkillById(skillId)
      expect(skill).toBeTruthy()
      const fns = getAgentFunctions(skill)
      const names = fns.map((f) => f.name)
      // كل مهارة عملياتية تحصل جسر execute دائماً — وتصل لأي أداة مجالٍ بما فيها mutate_record من الفهرس.
      expect(names).toContain('execute')
      // ينسخ الفهرس في وصف execute اسم mutate_record حتى لا يضيع الموديل في البحث عنه.
      const execDef = fns.find((f) => f.name === 'execute')!
      expect(String(execDef.description)).toContain('mutate_record')
    }
  })
})
