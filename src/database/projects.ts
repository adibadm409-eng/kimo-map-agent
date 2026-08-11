import * as SQLite from 'expo-sqlite'
import { getDB } from './db'
import { logChange, withAuditCtx } from './audit'

export type EntityType = 'project' | 'block' | 'plot'
export type PlotStatus = 'available' | 'sold' | 'installment'
export type InstallmentType = 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
export type PaymentMethod = 'cash' | 'bank'
export type FieldValueType = 'text' | 'number' | 'date' | 'boolean' | 'select'

export interface Project {
  id: string
  name: string
  description: string
}

export interface Block {
  id: string
  project_id: string
  name: string
  plot_count: number
  notes: string
}

export interface Plot {
  id: string
  block_id: string
  plot_no: string
  area_sqm: number
  status: PlotStatus
  boundary_north: string
  boundary_south: string
  boundary_east: string
  boundary_west: string
  value: number
  buyer_name: string
  buyer_contact: string
  sale_date: string
  installment_type: InstallmentType | ''
  paid_amount: number
  remaining_amount: number
}

export interface PlotPayment {
  id: string
  plot_id: string
  amount: number
  pay_date: string
  method: PaymentMethod
  cash_recipient: string
  cash_receipt_no: string
  bank_name: string
  bank_ref_no: string
}

export interface CustomField {
  id: string
  entity_type: EntityType
  label: string
  value_type: FieldValueType
  options: string
  sort_order: number
}

export interface CustomFieldValue {
  id: string
  entity_type: EntityType
  entity_id: string
  field_id: string
  value: string
}

export type PlotJoined = Plot & { block_name: string; project_id: string; project_name: string }

export const PLOT_STATUS_LABELS: Record<PlotStatus, string> = {
  available: 'متاحة',
  sold: 'مبيعة',
  installment: 'قيد التقسيط',
}

export const INSTALLMENT_TYPE_LABELS: Record<InstallmentType, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'كاش',
  bank: 'بنكي',
}

let schemaPromise: Promise<void> | null = null

async function initProjectsSchema(): Promise<void> {
  const db = await getDB()
  await db.execAsync('PRAGMA journal_mode = WAL;')
  await db.execAsync('PRAGMA foreign_keys = ON;')
  await db.execAsync(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  plot_count INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plots (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  plot_no TEXT DEFAULT '',
  area_sqm REAL DEFAULT 0,
  status TEXT DEFAULT 'available',
  boundary_north TEXT DEFAULT '',
  boundary_south TEXT DEFAULT '',
  boundary_east TEXT DEFAULT '',
  boundary_west TEXT DEFAULT '',
  value REAL DEFAULT 0,
  buyer_name TEXT DEFAULT '',
  buyer_contact TEXT DEFAULT '',
  sale_date TEXT DEFAULT '',
  installment_type TEXT DEFAULT '',
  paid_amount REAL DEFAULT 0,
  remaining_amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plot_payments (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  amount REAL DEFAULT 0,
  pay_date TEXT DEFAULT '',
  method TEXT DEFAULT 'cash',
  cash_recipient TEXT DEFAULT '',
  cash_receipt_no TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_ref_no TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT DEFAULT 'text',
  options TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS custom_field_values (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  value TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
`)
  await db.execAsync(`
CREATE INDEX IF NOT EXISTS idx_blocks_project ON blocks (project_id);
CREATE INDEX IF NOT EXISTS idx_plots_block ON plots (block_id);
CREATE INDEX IF NOT EXISTS idx_plots_status ON plots (status);
CREATE INDEX IF NOT EXISTS idx_payments_plot ON plot_payments (plot_id);
CREATE INDEX IF NOT EXISTS idx_cfvals_entity ON custom_field_values (entity_type, entity_id);
`)

  await seedProjectsData()
  await purgeOrphanedData()
}

/**
 * التخلص من البيانات اليتيمة نهائياً: أي صف يشير لوالد غير موجود يُحذف
 * (قطع بدون بلوك، بلوك بدون مشروع، أقساط بدون قطعة، قيم مخصصة بلا مالك)
 * — حتى لا تظهر سجلات يتيمة في الشاشات أو العدّادات. يُستدعى عند الإقلاع
 * وبعد عمليات الحذف الكبيرة.
 */
export async function purgeOrphanedData(): Promise<void> {
  const db = await getDB()
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM plots WHERE block_id NOT IN (SELECT id FROM blocks)`
    )
    await db.runAsync(
      `DELETE FROM blocks WHERE project_id NOT IN (SELECT id FROM projects)`
    )
    await db.runAsync(
      `DELETE FROM plot_payments WHERE plot_id NOT IN (SELECT id FROM plots)`
    )
    await db.runAsync(
      `DELETE FROM custom_field_values WHERE entity_type = 'project' AND entity_id NOT IN (SELECT id FROM projects)`
    )
    await db.runAsync(
      `DELETE FROM custom_field_values WHERE entity_type = 'block' AND entity_id NOT IN (SELECT id FROM blocks)`
    )
    await db.runAsync(
      `DELETE FROM custom_field_values WHERE entity_type = 'plot' AND entity_id NOT IN (SELECT id FROM plots)`
    )
  })
}

// (then: area_sqm, status, boundary_north, boundary_south, boundary_east, boundary_west, value, buyer_name, buyer_contact, sale_date, installment_type, paid_amount, remaining_amount)
const demoPlots: (string | number)[][] = [
  [450, 'available', 'شارع الأمانة', 'حد الأرض رقم ٢', 'حد الجبل', 'منزل مجاور', 420000, '', '', '', '', 0, 0],
  [500, 'available', 'طريق الملك', 'حد أرض المهندس', 'حد أرض علي', 'حد أرض سالم', 480000, '', '', '', '', 0, 0],
  [550, 'available', 'شارع النخيل', 'حد أرض فهد', 'حد أرض خالد', 'حد أرض ناصر', 520000, '', '', '', '', 0, 0],
  [460, 'sold', 'حد شارع الزهراء', 'حد أرض أحمد', 'حد أرض محمد', 'حد أرض عبدالله', 500000, 'محمد الراشد', '0551112233', '2025-01-15', '', 500000, 0],
  [480, 'sold', 'حد شارع الياسمين', 'حد أرض سعد', 'حد أرض وليد', 'حد أرض طلال', 490000, 'عبدالعزيز الحربي', '0552223344', '2025-03-02', '', 490000, 0],
  [520, 'installment', 'حد طريق الملك', 'حد أرض سمير', 'حد أرض برج', 'حد أرض بستاني', 540000, 'خالد العتيبي', '0553334455', '', 'monthly', 120000, 420000],
  [580, 'installment', 'حد شارع العروبة', 'حد أرض سامي', 'حد أرض راشد', 'حد أرض حمد', 560000, 'فهد المطيري', '0554445566', '', 'quarterly', 180000, 380000],
  [600, 'installment', 'حد شارع السلام', 'حد أرض بدر', 'حد أرض عمر', 'حد أرض نواف', 580000, 'سعود الشمري', '0555556677', '', 'semi_annual', 200000, 380000],
  [640, 'installment', 'حد شارع الروضة', 'حد أرض ماجد', 'حد أرض فوزان', 'حد أرض ركاد', 620000, 'مشعل القحطاني', '0556667788', '', 'annual', 100000, 520000],
  [700, 'available', 'حد طريق المدينة', 'حد أرض حمد', 'حد أرض سعد', 'حد أرض جارنا', 650000, '', '', '', '', 0, 0],
]

// (then: amount, pay_date, method, cash_recipient, cash_receipt_no, bank_name, bank_ref_no)
const demoPayments: Record<string, [number, string, string, string, string, string, string][]> = {
  'قطعة 6': [
    [60000, '2025-04-01', 'cash', 'خالد العتيبي', 'SND-0001', '', ''],
    [60000, '2025-05-01', 'cash', 'خالد العتيبي', 'SND-0002', '', ''],
  ],
  'قطعة 7': [
    [45000, '2025-02-10', 'bank', '', '', 'الراجحي', 'REF-8801'],
    [45000, '2025-05-10', 'bank', '', '', 'الراجحي', 'REF-8802'],
    [45000, '2025-08-10', 'bank', '', '', 'الراجحي', 'REF-8803'],
    [45000, '2025-11-10', 'bank', '', '', 'الراجحي', 'REF-8804'],
  ],
  'قطعة 8': [
    [100000, '2025-01-20', 'cash', 'سعود الشمري', 'SND-0091', '', ''],
    [100000, '2025-07-20', 'bank', '', '', 'البنك الأهلي', 'REF-7721'],
  ],
  'قطعة 9': [
    [100000, '2025-03-15', 'bank', '', '', 'الرياض', 'REF-9911'],
  ],
}

const demoPlotNotes: Record<string, string> = {
  'قطعة 1': 'مطلوبة خصم سعر للمشتري الجاد',
  'قطعة 2': 'يوجد وديعة ماء على الجهة الجنوبية',
  'قطعة 3': 'تسوية الحدود تحتاج توقيع الجيران',
  'قطعة 4': 'باقي إجراءات نقل ملكية',
  'قطعة 6': 'دفع بداية الشهر دائماً',
  'قطعة 7': 'تحويلات عبر تطبيق البنك',
  'قطعة 8': 'القسط القادم يجب تسجيله قبل ٢٠/١',
  'قطعة 10': 'أولوية للعرض بالتقسيط',
}

export async function seedProjectsData(): Promise<void> {
  const db = await getDB()
  const existing = await db.getFirstAsync<{ id: string; description: string }>(
    "SELECT id, description FROM projects WHERE name = 'مشروع الواحة السكني'"
  )
  if (existing) {
    if (existing.description.startsWith('مشروع تجريبي —')) {
      await deleteProject(existing.id)
    } else {
      return
    }
  }

  await withAuditCtx({ actor: 'system' }, async () => {
    await db.withTransactionAsync(async () => {
    const projectId = genId()
    await db.runAsync(
      'INSERT INTO projects (id, name, description) VALUES (?, ?, ?)',
      [projectId, 'مشروع الواحة السكني', 'مشروع تجريبي لأراضٍ سكنية — ١٠ قطع في بلوك واحد بحالات وأقساط مختلفة']
    )

    const blockId = genId()
    await db.runAsync(
      'INSERT INTO blocks (id, project_id, name, plot_count, notes) VALUES (?, ?, ?, ?, ?)',
      [blockId, projectId, 'البلوك A', 10, 'قطع هذا البلوك متساوية المساحات تقريباً']
    )

    for (let i = 1; i <= 10; i++) {
      const plotId = genId()
      const plotNo = `قطعة ${i}`
      const d = demoPlots[i - 1]
      await db.runAsync(
        `INSERT INTO plots (id, block_id, plot_no, area_sqm, status, boundary_north, boundary_south, boundary_east, boundary_west, value, buyer_name, buyer_contact, sale_date, installment_type, paid_amount, remaining_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plotId, blockId, plotNo, ...d]
      )

      if (d[1] === 'installment') {
        for (const pmt of demoPayments[plotNo]) {
          await db.runAsync(
            `INSERT INTO plot_payments (id, plot_id, amount, pay_date, method, cash_recipient, cash_receipt_no, bank_name, bank_ref_no)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [genId(), plotId, ...pmt]
          )
        }
      }
    }

    const noteFieldId = genId()
    await db.runAsync(
      'INSERT INTO custom_fields (id, entity_type, label, value_type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [noteFieldId, 'plot', 'ملاحظات إدارية', 'text', '', 1]
    )

    const plots = await db.getAllAsync<{ id: string; plot_no: string }>(
      'SELECT id, plot_no FROM plots'
    )
    for (const p of plots) {
      const note = demoPlotNotes[p.plot_no]
      if (note) {
        await db.runAsync(
          'INSERT INTO custom_field_values (id, entity_type, entity_id, field_id, value) VALUES (?, ?, ?, ?, ?)',
          [genId(), 'plot', p.id, noteFieldId, note]
        )
      }
    }
  })
  })
}

function ensureSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = initProjectsSchema()
  return schemaPromise
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export async function getAllProjects(): Promise<Project[]> {
  await ensureSchema()
  const db = await getDB()
  return await db.getAllAsync<Project>('SELECT * FROM projects ORDER BY created_at DESC')
}

export async function getProject(id: string): Promise<Project | null> {
  await ensureSchema()
  const db = await getDB()
  return await db.getFirstAsync<Project>('SELECT * FROM projects WHERE id = ?', [id])
}

export async function createProject(name: string, description?: string): Promise<string> {
  await ensureSchema()
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO projects (id, name, description) VALUES (?, ?, ?)',
    [id, name, description ?? '']
  )
  await logChange({ action: 'create', scope: 'projects', scopeId: id, after: { name, description: description ?? '' }, summary: `إنشاء مشروع "${name}"` })
  return id
}

export async function updateProject(id: string, patch: { name?: string; description?: string }): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<Project>('SELECT * FROM projects WHERE id = ?', [id])
  const entries = Object.entries(patch)
  if (entries.length === 0) return
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  const params = entries.map(([, v]) => v)
  await db.runAsync(`UPDATE projects SET ${set} WHERE id = ?`, [...params, id])
  await logChange({ action: 'update', scope: 'projects', scopeId: id, before, after: patch, summary: `تعديل مشروع (${id})` })
}

export async function deleteProject(id: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<Project>('SELECT * FROM projects WHERE id = ?', [id])
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM custom_field_values WHERE entity_type = 'project' AND entity_id = ?", [id])
    const blockRows = await db.getAllAsync<{ id: string }>('SELECT id FROM blocks WHERE project_id = ?', [id])
    const blockIds = blockRows.map((r) => r.id)
    if (blockIds.length === 0) {
      await db.runAsync('DELETE FROM projects WHERE id = ?', [id])
      await logChange({ action: 'delete', scope: 'projects', scopeId: id, before, summary: `حذف مشروع "${before?.name ?? id}"` })
      return
    }
    const blockPh = blockIds.map(() => '?').join(', ')
    const plotRows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM plots WHERE block_id IN (${blockPh})`,
      blockIds
    )
    const plotIds = plotRows.map((r) => r.id)
    if (plotIds.length > 0) {
      const plotPh = plotIds.map(() => '?').join(', ')
      await db.runAsync(`DELETE FROM plot_payments WHERE plot_id IN (${plotPh})`, plotIds)
      await db.runAsync(`DELETE FROM custom_field_values WHERE entity_type = 'plot' AND entity_id IN (${plotPh})`, plotIds)
      await db.runAsync(`DELETE FROM plots WHERE id IN (${plotPh})`, plotIds)
    }
    await db.runAsync(`DELETE FROM custom_field_values WHERE entity_type = 'block' AND entity_id IN (${blockPh})`, blockIds)
    await db.runAsync(`DELETE FROM blocks WHERE id IN (${blockPh})`, blockIds)
    await db.runAsync('DELETE FROM projects WHERE id = ?', [id])
  })
  await logChange({ action: 'delete', scope: 'projects', scopeId: id, before, summary: `حذف مشروع "${before?.name ?? id}" (ببلوكاته وقطعه)` })
}

export async function getBlocksByProject(projectId: string): Promise<Block[]> {
  await ensureSchema()
  const db = await getDB()
  return await db.getAllAsync<Block>('SELECT * FROM blocks WHERE project_id = ? ORDER BY created_at ASC', [projectId])
}

export async function getBlock(id: string): Promise<Block | null> {
  await ensureSchema()
  const db = await getDB()
  return await db.getFirstAsync<Block>('SELECT * FROM blocks WHERE id = ?', [id])
}

export async function syncBlockPlotCount(blockId: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM plots WHERE block_id = ?', [blockId])
  const count = row?.c ?? 0
  await db.runAsync('UPDATE blocks SET plot_count = ? WHERE id = ?', [count, blockId])
}

export async function createBlock(data: { project_id: string; name: string; plot_count: number; notes?: string; skipSlots?: boolean }): Promise<string> {
  await ensureSchema()
  const db = await getDB()
  const project = await db.getFirstAsync<{ id: string }>('SELECT id FROM projects WHERE id = ?', [data.project_id])
  if (!project) throw new Error(`المشروع (${data.project_id}) غير موجود — لا يمكن إنشاء بلوك يتيم. أنشئ المشروع أولاً ثم اجلب معرفه الحقيقي.`)
  const id = genId()
  await db.runAsync(
    'INSERT INTO blocks (id, project_id, name, plot_count, notes) VALUES (?, ?, ?, ?, ?)',
    [id, data.project_id, data.name, data.skipSlots ? 0 : data.plot_count, data.notes ?? '']
  )
  await logChange({ action: 'create', scope: 'blocks', scopeId: id, after: data, summary: `إنشاء بلوك "${data.name}"` })
  if (!data.skipSlots) {
    for (let i = 0; i < data.plot_count; i++) {
      await createPlotSlot(id)
    }
  }
  return id
}

export async function updateBlock(id: string, patch: { name?: string; plot_count?: number; notes?: string }): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const existing = await db.getFirstAsync<Block>('SELECT * FROM blocks WHERE id = ?', [id])
  const entries = Object.entries(patch)
  if (entries.length > 0) {
    const set = entries.map(([k]) => `${k} = ?`).join(', ')
    const params = entries.map(([, v]) => v)
    await db.runAsync(`UPDATE blocks SET ${set} WHERE id = ?`, [...params, id])
  }
  if (existing && patch.plot_count != null && patch.plot_count > existing.plot_count) {
    for (let i = 0; i < patch.plot_count - existing.plot_count; i++) {
      await createPlotSlot(id)
    }
  }
  await syncBlockPlotCount(id)
  await logChange({ action: 'update', scope: 'blocks', scopeId: id, before: existing, after: patch, summary: `تعديل بلوك (${id})` })
}

export async function deleteBlock(id: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<Block>('SELECT * FROM blocks WHERE id = ?', [id])
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM custom_field_values WHERE entity_type = 'block' AND entity_id = ?", [id])
    const plotRows = await db.getAllAsync<{ id: string }>('SELECT id FROM plots WHERE block_id = ?', [id])
    const plotIds = plotRows.map((r) => r.id)
    if (plotIds.length > 0) {
      const plotPh = plotIds.map(() => '?').join(', ')
      await db.runAsync(`DELETE FROM plot_payments WHERE plot_id IN (${plotPh})`, plotIds)
      await db.runAsync(`DELETE FROM custom_field_values WHERE entity_type = 'plot' AND entity_id IN (${plotPh})`, plotIds)
      await db.runAsync(`DELETE FROM plots WHERE id IN (${plotPh})`, plotIds)
    }
    await db.runAsync('DELETE FROM blocks WHERE id = ?', [id])
  })
  await logChange({ action: 'delete', scope: 'blocks', scopeId: id, before, summary: `حذف بلوك "${before?.name ?? id}" (بقطعه)` })
}

export async function getPlotsByBlock(blockId: string): Promise<Plot[]> {
  await ensureSchema()
  const db = await getDB()
  return await db.getAllAsync<Plot>('SELECT * FROM plots WHERE block_id = ? ORDER BY created_at ASC', [blockId])
}

export async function createPlotSlot(blockId: string, plotNo?: string): Promise<string> {
  await ensureSchema()
  const db = await getDB()
  const block = await db.getFirstAsync<{ id: string }>('SELECT id FROM blocks WHERE id = ?', [blockId])
  if (!block) throw new Error(`البلوك (${blockId}) غير موجود — لا يمكن إنشاء قطعة يتيمة. أنشئ البلوك أولاً ثم اجلب معرفه الحقيقي.`)
  let no = plotNo
  if (no == null || no === '') {
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM plots WHERE block_id = ?', [blockId])
    const c = row?.c ?? 0
    no = `قطعة ${c + 1}`
  }
  const id = genId()
  await db.runAsync(
    'INSERT INTO plots (id, block_id, plot_no, status) VALUES (?, ?, ?, ?)',
    [id, blockId, no, 'available']
  )
  await logChange({ action: 'create', scope: 'plots', scopeId: id, after: { block_id: blockId, plot_no: no, status: 'available' }, summary: `إنشاء قطعة "${no}"` })
  await syncBlockPlotCount(blockId)
  return id
}

export async function ensurePlotSlots(blockId: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const block = await db.getFirstAsync<Block>('SELECT * FROM blocks WHERE id = ?', [blockId])
  if (!block) return
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM plots WHERE block_id = ?', [blockId])
  const count = row?.c ?? 0
  for (let i = count; i < block.plot_count; i++) {
    await createPlotSlot(blockId)
  }
}

export async function getPlot(id: string): Promise<Plot | null> {
  await ensureSchema()
  const db = await getDB()
  return await db.getFirstAsync<Plot>('SELECT * FROM plots WHERE id = ?', [id])
}

export async function savePlot(id: string, patch: Partial<Plot>): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const entries = Object.entries(patch).filter(([k]) => k !== 'id')
  if (entries.length === 0) return
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  const params = entries.map(([, v]) => v)
  const before = await db.getFirstAsync<Plot>('SELECT * FROM plots WHERE id = ?', [id])
  await db.runAsync(
    `UPDATE plots SET ${set}, updated_at = datetime('now') WHERE id = ?`,
    [...params, id]
  )
  await logChange({ action: 'update', scope: 'plots', scopeId: id, before, after: patch, summary: `تعديل قطعة "${before?.plot_no || id}"` })
}

export async function setPlotStatus(id: string, status: PlotStatus): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<Plot>('SELECT * FROM plots WHERE id = ?', [id])
  if (status === 'available') {
    await db.runAsync(
      "UPDATE plots SET status = ?, buyer_name = '', buyer_contact = '', sale_date = '', installment_type = '', paid_amount = 0, remaining_amount = 0, updated_at = datetime('now') WHERE id = ?",
      [status, id]
    )
  } else {
    await db.runAsync(
      "UPDATE plots SET status = ?, updated_at = datetime('now') WHERE id = ?",
      [status, id]
    )
  }
  await logChange({ action: 'update', scope: 'plots', scopeId: id, before, after: { status }, summary: `تغيير حالة القطعة "${before?.plot_no || id}" إلى ${status}` })
}

export async function deletePlot(id: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<Plot>('SELECT * FROM plots WHERE id = ?', [id])
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM plot_payments WHERE plot_id = ?', [id])
    await db.runAsync("DELETE FROM custom_field_values WHERE entity_type = 'plot' AND entity_id = ?", [id])
    await db.runAsync('DELETE FROM plots WHERE id = ?', [id])
  })
  await logChange({ action: 'delete', scope: 'plots', scopeId: id, before, summary: `حذف قطعة "${before?.plot_no || id}"` })
  if (before?.block_id) await syncBlockPlotCount(before.block_id)
}

export async function getPaymentsByPlot(plotId: string): Promise<PlotPayment[]> {
  await ensureSchema()
  const db = await getDB()
  return await db.getAllAsync<PlotPayment>('SELECT * FROM plot_payments WHERE plot_id = ? ORDER BY pay_date DESC', [plotId])
}

export async function recordPayment(
  plotId: string,
  p: { amount: number; pay_date: string; method: PaymentMethod; cash_recipient?: string; cash_receipt_no?: string; bank_name?: string; bank_ref_no?: string }
): Promise<string> {
  await ensureSchema()
  const db = await getDB()
  const id = genId()
  const plotBefore = await db.getFirstAsync<Plot>('SELECT * FROM plots WHERE id = ?', [plotId])
  if (!plotBefore) throw new Error(`القطعة (${plotId}) غير موجودة — لا يمكن تسجيل قسط يتيم. أنشئ القطعة أولاً ثم اجلب معرفها الحقيقي.`)
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO plot_payments (id, plot_id, amount, pay_date, method, cash_recipient, cash_receipt_no, bank_name, bank_ref_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, plotId, p.amount, p.pay_date, p.method, p.cash_recipient ?? '', p.cash_receipt_no ?? '', p.bank_name ?? '', p.bank_ref_no ?? '']
    )
    await db.runAsync(
      "UPDATE plots SET paid_amount = paid_amount + ?, remaining_amount = remaining_amount - ?, updated_at = datetime('now') WHERE id = ?",
      [p.amount, p.amount, plotId]
    )
    const row = await db.getFirstAsync<{ status: string }>('SELECT status FROM plots WHERE id = ?', [plotId])
    if (row && row.status === 'available') {
      await db.runAsync("UPDATE plots SET status = 'installment', updated_at = datetime('now') WHERE id = ?", [plotId])
    }
  })
  await logChange({ action: 'create', scope: 'plot_payments', scopeId: id, after: { plot_id: plotId, ...p }, summary: `تسجيل قسط ${p.amount} ر.ي على القطعة "${plotBefore?.plot_no || plotId}"` })
  return id
}

export async function deletePayment(paymentId: string, plotId: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<PlotPayment>('SELECT * FROM plot_payments WHERE id = ?', [paymentId])
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ amount: number }>('SELECT amount FROM plot_payments WHERE id = ?', [paymentId])
    if (!row) return
    await db.runAsync('DELETE FROM plot_payments WHERE id = ?', [paymentId])
    await db.runAsync(
      "UPDATE plots SET paid_amount = paid_amount - ?, remaining_amount = remaining_amount + ?, updated_at = datetime('now') WHERE id = ?",
      [row.amount, row.amount, plotId]
    )
  })
  await logChange({ action: 'delete', scope: 'plot_payments', scopeId: paymentId, before, summary: `حذف قسط (${paymentId}) عن القطعة (${plotId})` })
}

export async function getCustomFields(entityType: EntityType): Promise<CustomField[]> {
  await ensureSchema()
  const db = await getDB()
  return await db.getAllAsync<CustomField>(
    'SELECT * FROM custom_fields WHERE entity_type = ? ORDER BY sort_order ASC',
    [entityType]
  )
}

export async function createCustomField(data: { entity_type: EntityType; label: string; value_type?: FieldValueType; options?: string }): Promise<string> {
  await ensureSchema()
  const db = await getDB()
  const row = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM custom_fields WHERE entity_type = ?',
    [data.entity_type]
  )
  const sortOrder = (row?.m ?? 0) + 1
  const id = genId()
  await db.runAsync(
    'INSERT INTO custom_fields (id, entity_type, label, value_type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [id, data.entity_type, data.label, data.value_type ?? 'text', data.options ?? '', sortOrder]
  )
  await logChange({ action: 'create', scope: 'custom_fields', scopeId: id, after: data, summary: `إنشاء حقل مخصص "${data.label}"` })
  return id
}

export async function updateCustomField(id: string, patch: { label?: string; value_type?: string; options?: string }): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<CustomField>('SELECT * FROM custom_fields WHERE id = ?', [id])
  const entries = Object.entries(patch)
  if (entries.length === 0) return
  const set = entries.map(([k]) => `${k} = ?`).join(', ')
  const params = entries.map(([, v]) => v)
  await db.runAsync(`UPDATE custom_fields SET ${set} WHERE id = ?`, [...params, id])
  await logChange({ action: 'update', scope: 'custom_fields', scopeId: id, before, after: patch, summary: `تعديل حقل مخصص "${before?.label ?? id}"` })
}

export async function deleteCustomField(id: string): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  const before = await db.getFirstAsync<CustomField>('SELECT * FROM custom_fields WHERE id = ?', [id])
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM custom_field_values WHERE field_id = ?', [id])
    await db.runAsync('DELETE FROM custom_fields WHERE id = ?', [id])
  })
  await logChange({ action: 'delete', scope: 'custom_fields', scopeId: id, before, summary: `حذف حقل مخصص "${before?.label ?? id}"` })
}

export async function getCustomValues(entityType: EntityType, entityId: string): Promise<CustomFieldValue[]> {
  await ensureSchema()
  const db = await getDB()
  return await db.getAllAsync<CustomFieldValue>(
    'SELECT * FROM custom_field_values WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId]
  )
}

export async function setCustomValue(entityType: EntityType, entityId: string, fieldId: string, value: string): Promise<string> {
  await ensureSchema()
  const db = await getDB()
  if (entityType === 'project' || entityType === 'block' || entityType === 'plot') {
    const tables: Record<string, string> = { project: 'projects', block: 'blocks', plot: 'plots' }
    const host = await db.getFirstAsync<{ id: string }>(`SELECT id FROM ${tables[entityType]} WHERE id = ?`, [entityId])
    if (!host) throw new Error(`الكيان (${entityId}) غير موجود — لا يمكن ربط قيمة يتيمة به.`)
  }
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM custom_field_values WHERE entity_type = ? AND entity_id = ? AND field_id = ?',
    [entityType, entityId, fieldId]
  )
  if (existing) {
    const before = await db.getFirstAsync<CustomFieldValue>('SELECT * FROM custom_field_values WHERE id = ?', [existing.id])
    await db.runAsync('UPDATE custom_field_values SET value = ? WHERE id = ?', [value, existing.id])
    await logChange({ action: 'update', scope: 'custom_field_values', scopeId: existing.id, before, after: { value }, summary: `تحديث قيمة حقل مخصص على ${entityType}/${entityId}` })
    return existing.id
  } else {
    const id = genId()
    await db.runAsync(
      'INSERT INTO custom_field_values (id, entity_type, entity_id, field_id, value) VALUES (?, ?, ?, ?, ?)',
      [id, entityType, entityId, fieldId, value]
    )
    await logChange({ action: 'create', scope: 'custom_field_values', scopeId: id, after: { entity_type: entityType, entity_id: entityId, field_id: fieldId, value }, summary: `إضافة قيمة حقل مخصص على ${entityType}/${entityId}` })
    return id
  }
}

export async function removeCustomValues(entityId: string, entityType: EntityType): Promise<void> {
  await ensureSchema()
  const db = await getDB()
  await db.runAsync('DELETE FROM custom_field_values WHERE entity_id = ? AND entity_type = ?', [entityId, entityType])
}

export async function searchEntities(query: string): Promise<{ projects: Project[]; blocks: Block[]; plots: PlotJoined[] }> {
  await ensureSchema()
  const db = await getDB()
  const like = `%${query}%`
  const projects = await db.getAllAsync<Project>(
    'SELECT * FROM projects WHERE name LIKE ? COLLATE NOCASE ORDER BY created_at DESC',
    [like]
  )
  const blocks = await db.getAllAsync<Block>(
    'SELECT * FROM blocks WHERE name LIKE ? COLLATE NOCASE ORDER BY created_at ASC',
    [like]
  )
  const plots = await db.getAllAsync<PlotJoined>(
    `SELECT plots.*, b.name as block_name, b.project_id, p.name as project_name
     FROM plots
     LEFT JOIN blocks b ON plots.block_id = b.id
     LEFT JOIN projects p ON b.project_id = p.id
     WHERE plots.plot_no LIKE ? COLLATE NOCASE OR plots.buyer_name LIKE ? COLLATE NOCASE
     ORDER BY plots.created_at ASC`,
    [like, like]
  )
  return { projects, blocks, plots }
}

export async function filterPlots(f: {
  project_id?: string
  block_id?: string
  status?: PlotStatus | ''
  installment_type?: InstallmentType | ''
  area_min?: number
  area_max?: number
  value_min?: number
  value_max?: number
  buyer_query?: string
  plot_no_query?: string
}): Promise<PlotJoined[]> {
  await ensureSchema()
  const db = await getDB()
  const conds: string[] = []
  const params: SQLite.SQLiteBindValue[] = []
  if (f.project_id) {
    conds.push('b.project_id = ?')
    params.push(f.project_id)
  }
  if (f.block_id) {
    conds.push('plots.block_id = ?')
    params.push(f.block_id)
  }
  if (f.status) {
    conds.push('plots.status = ?')
    params.push(f.status)
  }
  if (f.installment_type) {
    conds.push('plots.installment_type = ?')
    params.push(f.installment_type)
  }
  if (f.area_min != null) {
    conds.push('plots.area_sqm >= ?')
    params.push(f.area_min)
  }
  if (f.area_max != null) {
    conds.push('plots.area_sqm <= ?')
    params.push(f.area_max)
  }
  if (f.value_min != null) {
    conds.push('plots.value >= ?')
    params.push(f.value_min)
  }
  if (f.value_max != null) {
    conds.push('plots.value <= ?')
    params.push(f.value_max)
  }
  if (f.buyer_query) {
    conds.push('plots.buyer_name LIKE ?')
    params.push(`%${f.buyer_query}%`)
  }
  if (f.plot_no_query) {
    conds.push('plots.plot_no LIKE ?')
    params.push(`%${f.plot_no_query}%`)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return await db.getAllAsync<PlotJoined>(
    `SELECT plots.*, b.name as block_name, b.project_id, p.name as project_name
     FROM plots
     LEFT JOIN blocks b ON plots.block_id = b.id
     LEFT JOIN projects p ON b.project_id = p.id
     ${where}
     ORDER BY plots.created_at ASC`,
    params
  )
}

export async function getProjectReport(projectId: string): Promise<{
  project: Project
  blocks: (Block & { plots: Plot[] })[]
  totals: { plots: number; available: number; sold: number; installment: number; value: number; collected: number; remaining: number }
}> {
  await ensureSchema()
  const project = await getProject(projectId)
  if (!project) throw new Error('Project not found')
  const blocks = await Promise.all(
    (await getBlocksByProject(projectId)).map(async (b) => ({
      ...b,
      plots: await getPlotsByBlock(b.id),
    }))
  )
  const allPlots = blocks.flatMap((b) => b.plots)
  const totals = {
    plots: allPlots.length,
    available: allPlots.filter((p) => p.status === 'available').length,
    sold: allPlots.filter((p) => p.status === 'sold').length,
    installment: allPlots.filter((p) => p.status === 'installment').length,
    value: allPlots.reduce((s, p) => s + p.value, 0),
    collected: allPlots.reduce((s, p) => s + p.paid_amount, 0),
    remaining: allPlots.reduce((s, p) => s + p.remaining_amount, 0),
  }
  return { project, blocks, totals }
}