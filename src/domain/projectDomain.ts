import { getDB } from '../database/db'
import { resolveProjectRef } from './projectRef'

export type ProjectKind = 'land' | 'residential_building' | 'tower' | 'compound' | 'custom'
export type ProjectNodeKind = 'project' | 'building' | 'block' | 'floor' | 'unit' | 'plot' | 'parking' | 'shop' | 'common_area' | 'custom'
export type ProjectNodeStatus = 'available' | 'reserved' | 'sold' | 'installment' | 'rented' | 'completed' | 'cancelled'
export type LedgerEntryKind = 'payment' | 'reversal' | 'adjustment'
export type LedgerMethod = 'cash' | 'bank' | 'transfer' | 'cheque' | 'other'

export interface ProjectProfile {
  id: string
  project_id: string
  kind: ProjectKind
  currency: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ProjectNode {
  id: string
  project_id: string
  parent_id: string | null
  kind: ProjectNodeKind
  code: string
  name: string
  level_no: number | null
  area_sqm: number
  status: ProjectNodeStatus
  value: number
  buyer_name: string
  buyer_contact: string
  paid_amount: number
  remaining_amount: number
  currency: string
  metadata: Record<string, any>
  source_batch_id: string | null
  source_row_ref: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface ProjectImportRow {
  source_row_ref?: string
  project_name?: string
  building_name?: string
  tower_name?: string
  block_name?: string
  floor?: string | number
  unit_no?: string | number
  plot_no?: string | number
  asset_code?: string | number
  asset_type?: string
  name?: string
  area_sqm?: string | number
  value?: string | number
  price?: string | number
  status?: string
  buyer_name?: string
  buyer_contact?: string
  sale_date?: string
  paid_amount?: string | number
  paid?: string | number
  remaining_amount?: string | number
  remaining?: string | number
  installment_type?: string
  payment_amount?: string | number
  payment_date?: string
  payment_method?: string
  notes?: string
  [key: string]: any
}

export interface ProjectImportPlan {
  projectId?: string
  projectName: string
  description?: string
  kind: ProjectKind
  currency?: string
  sourceName?: string
  rows: ProjectImportRow[]
  options?: {
    createMissingParents?: boolean
    updateExisting?: boolean
    allowOverpayment?: boolean
  }
}

export interface ImportIssue {
  row: number
  code: string
  message: string
  field?: string
  severity: 'error' | 'warning'
}

export interface NormalizedImportNode {
  row: number
  sourceRowRef: string
  kind: ProjectNodeKind
  parentKey: string | null
  code: string
  name: string
  levelNo: number | null
  areaSqm: number
  value: number
  status: ProjectNodeStatus
  buyerName: string
  buyerContact: string
  paidAmount: number
  remainingAmount: number
  metadata: Record<string, any>
}

export interface ProjectImportPreview {
  projectName: string
  kind: ProjectKind
  currency: string
  nodes: NormalizedImportNode[]
  issues: ImportIssue[]
  duplicates: { row: number; key: string; existingId?: string; action: 'skip' | 'update' }[]
  summary: {
    sourceRows: number
    accepted: number
    errors: number
    warnings: number
    duplicates: number
    byKind: Record<string, number>
  }
}

export interface ProjectImportResult {
  projectId: string
  batchId: string
  created: number
  updated: number
  skipped: number
  errors: ImportIssue[]
  verification: Awaited<ReturnType<typeof projectIntegrityCheck>>
}

export interface LedgerPaymentInput {
  projectId: string
  nodeId?: string
  plotId?: string
  amount: number
  payDate: string
  method: LedgerMethod
  currency?: string
  reference?: string
  note?: string
  cashRecipient?: string
  cashReceiptNo?: string
  bankName?: string
  bankRefNo?: string
  source?: 'user' | 'agent' | 'import' | 'system'
  allowOverpayment?: boolean
}

let schemaPromise: Promise<void> | null = null

function id(prefix: string): string {
  const c = (globalThis as any).crypto
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function text(v: any): string {
  return v == null ? '' : String(v).trim()
}

function numberValue(v: any): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100
  const normalized = text(v).replace(/[٬،]/g, '').replace(/,/g, '').replace(/[^0-9.\-]/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function normalizeDate(v: any): string {
  const raw = text(v)
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const parts = raw.split(/[\/.-]/).map((x) => Number(x))
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [a, b, c] = parts
    if (a > 1900) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`
    if (c > 1900) return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
  }
  return raw
}

function normalizeStatus(v: any, paid: number, remaining: number): ProjectNodeStatus {
  const raw = text(v).toLowerCase()
  if (/sold|مبيع|مباعة|مباع|بيع/.test(raw)) return 'sold'
  if (/install|تقسيط|قسط/.test(raw)) return 'installment'
  if (/reserv|حجز|محجوز/.test(raw)) return 'reserved'
  if (/rent|إيجار|مؤجر/.test(raw)) return 'rented'
  if (/cancel|ملغ/.test(raw)) return 'cancelled'
  if (paid > 0 && remaining > 0) return 'installment'
  if (paid > 0 && remaining <= 0) return 'sold'
  return 'available'
}

function normalizeKind(v: any): ProjectNodeKind {
  const raw = text(v).toLowerCase()
  if (/building|مبنى|عمارة/.test(raw)) return 'building'
  if (/tower|برج/.test(raw)) return 'building'
  if (/floor|طابق|دور/.test(raw)) return 'floor'
  if (/unit|وحدة|شقة/.test(raw)) return 'unit'
  if (/parking|موقف/.test(raw)) return 'parking'
  if (/shop|محل|تجاري/.test(raw)) return 'shop'
  if (/plot|قطعة|أرض/.test(raw)) return 'plot'
  return 'unit'
}

function canonicalAssetCode(row: ProjectImportRow): string {
  return text(row.asset_code ?? row.plot_no ?? row.unit_no ?? row.name)
}

function parentKeyFor(plan: ProjectImportPlan, row: ProjectImportRow): string | null {
  if (plan.kind === 'land') return text(row.block_name) || 'البلوك الرئيسي'
  const building = text(row.building_name ?? row.tower_name)
  const floor = text(row.floor)
  if (building && floor) return `${building}::${floor}`
  if (building) return building
  if (floor) return `الطابق ${floor}`
  return null
}

function nodeNameFor(plan: ProjectImportPlan, row: ProjectImportRow, code: string): string {
  if (text(row.name)) return text(row.name)
  if (plan.kind === 'land') return `قطعة ${code}`
  if (text(row.unit_no)) return `وحدة ${text(row.unit_no)}`
  if (text(row.plot_no)) return `قطعة ${text(row.plot_no)}`
  return code || `أصل ${row.source_row_ref ?? ''}`
}

function normalizeRow(plan: ProjectImportPlan, row: ProjectImportRow, index: number): { node?: NormalizedImportNode; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const sourceRowRef = text(row.source_row_ref) || String(index + 1)
  const code = canonicalAssetCode(row)
  const areaSqm = numberValue(row.area_sqm)
  const value = numberValue(row.value ?? row.price)
  const paidAmount = numberValue(row.paid_amount ?? row.paid)
  const remainingRaw = text(row.remaining_amount ?? row.remaining)
  const remainingAmount = remainingRaw ? numberValue(remainingRaw) : Math.max(0, value - paidAmount)
  const nodeKind = plan.kind === 'land' ? 'plot' : normalizeKind(row.asset_type ?? row.unit_no ?? row.plot_no)

  if (!code) issues.push({ row: index + 1, code: 'missing_asset_code', field: 'asset_code', severity: 'error', message: 'لا يوجد رقم أصل/قطعة/وحدة يمكن منع التكرار به.' })
  if (value < 0 || paidAmount < 0 || remainingAmount < 0) issues.push({ row: index + 1, code: 'negative_money', severity: 'error', message: 'القيمة أو المدفوع أو المتبقي لا يمكن أن يكون سالباً.' })
  if (value > 0 && paidAmount + remainingAmount > value + 0.01 && !plan.options?.allowOverpayment) {
    issues.push({ row: index + 1, code: 'money_exceeds_value', field: 'paid_amount', severity: 'error', message: 'المدفوع والمتبقي يتجاوزان قيمة الأصل.' })
  }
  if (paidAmount > 0 && !text(row.status)) issues.push({ row: index + 1, code: 'status_inferred', field: 'status', severity: 'warning', message: 'استنتجت الحالة من المدفوع والمتبقي؛ راجعها قبل الحفظ.' })
  if (text(row.payment_date) && !normalizeDate(row.payment_date).match(/^\d{4}-\d{2}-\d{2}$/)) {
    issues.push({ row: index + 1, code: 'date_unparsed', field: 'payment_date', severity: 'warning', message: 'تعذر توحيد تاريخ الدفع إلى YYYY-MM-DD.' })
  }

  if (issues.some((x) => x.severity === 'error')) return { issues }
  return {
    issues,
    node: {
      row: index + 1,
      sourceRowRef,
      kind: nodeKind,
      parentKey: parentKeyFor(plan, row),
      code,
      name: nodeNameFor(plan, row, code),
      levelNo: text(row.floor) ? numberValue(row.floor) || null : null,
      areaSqm,
      value,
      status: normalizeStatus(row.status, paidAmount, remainingAmount),
      buyerName: text(row.buyer_name),
      buyerContact: text(row.buyer_contact),
      paidAmount,
      remainingAmount,
      metadata: {
        source: 'project_import',
        sale_date: normalizeDate(row.sale_date),
        installment_type: text(row.installment_type),
        notes: text(row.notes),
        asset_type: text(row.asset_type),
      },
    },
  }
}

export async function ensureProjectDomainSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = await getDB()
      await db.execAsync(`
        PRAGMA foreign_keys = ON;
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
        CREATE INDEX IF NOT EXISTS idx_domain_blocks_project ON blocks(project_id);
        CREATE INDEX IF NOT EXISTS idx_domain_plots_block ON plots(block_id);
        CREATE INDEX IF NOT EXISTS idx_domain_payments_plot ON plot_payments(plot_id);
        CREATE TABLE IF NOT EXISTS project_profiles (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL DEFAULT 'land',
          currency TEXT NOT NULL DEFAULT 'YER',
          metadata TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS project_nodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          parent_id TEXT,
          kind TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          level_no INTEGER,
          area_sqm REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'available',
          value REAL NOT NULL DEFAULT 0,
          buyer_name TEXT NOT NULL DEFAULT '',
          buyer_contact TEXT NOT NULL DEFAULT '',
          paid_amount REAL NOT NULL DEFAULT 0,
          remaining_amount REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'YER',
          metadata TEXT NOT NULL DEFAULT '{}',
          source_batch_id TEXT,
          source_row_ref TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_id) REFERENCES project_nodes(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS project_import_batches (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'preview',
          source_name TEXT NOT NULL DEFAULT '',
          source_hash TEXT NOT NULL DEFAULT '',
          row_count INTEGER NOT NULL DEFAULT 0,
          accepted_count INTEGER NOT NULL DEFAULT 0,
          duplicate_count INTEGER NOT NULL DEFAULT 0,
          rejected_count INTEGER NOT NULL DEFAULT 0,
          warnings_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          committed_at TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS project_import_rows (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          source_row_ref TEXT NOT NULL,
          normalized_json TEXT NOT NULL,
          action TEXT NOT NULL DEFAULT 'create',
          reason TEXT NOT NULL DEFAULT '',
          node_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (batch_id) REFERENCES project_import_batches(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS cash_ledger_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          node_id TEXT,
          plot_id TEXT,
          kind TEXT NOT NULL DEFAULT 'payment',
          amount REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'YER',
          pay_date TEXT NOT NULL,
          method TEXT NOT NULL DEFAULT 'cash',
          reference TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'user',
          reversed_entry_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (node_id) REFERENCES project_nodes(id) ON DELETE SET NULL,
          FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_project_nodes_project_parent ON project_nodes(project_id, parent_id);
        CREATE INDEX IF NOT EXISTS idx_project_nodes_source ON project_nodes(source_batch_id, source_row_ref);
        CREATE INDEX IF NOT EXISTS idx_ledger_project_date ON cash_ledger_entries(project_id, pay_date DESC);
        CREATE INDEX IF NOT EXISTS idx_ledger_node ON cash_ledger_entries(node_id, plot_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_project_node_parent_code ON project_nodes(project_id, parent_id, code);
      `)
      await db.runAsync(`INSERT OR IGNORE INTO project_profiles (id, project_id, kind, currency, metadata)
        SELECT 'profile_' || id, id, 'land', 'YER', '{}' FROM projects`)
    })().catch((e) => {
      schemaPromise = null
      throw e
    })
  }
  await schemaPromise
}

export async function ensureProjectProfile(projectId: string, kind: ProjectKind, currency = 'YER', metadata: Record<string, any> = {}): Promise<void> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM projects WHERE id = ?', [projectId])
  if (!exists) throw new Error('المشروع غير موجود؛ لا يمكن إنشاء ملف المجال له.')
  await db.runAsync(
    `INSERT INTO project_profiles (id, project_id, kind, currency, metadata)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET kind = excluded.kind, currency = excluded.currency, metadata = excluded.metadata, updated_at = datetime('now')`,
    [id('profile'), projectId, kind, currency || 'YER', JSON.stringify(metadata ?? {})]
  )
}

export async function previewProjectImport(plan: ProjectImportPlan): Promise<ProjectImportPreview> {
  const nodes: NormalizedImportNode[] = []
  const issues: ImportIssue[] = []
  const seen = new Map<string, number>()
  const byKind: Record<string, number> = {}
  for (let i = 0; i < plan.rows.length; i++) {
    const result = normalizeRow(plan, plan.rows[i], i)
    issues.push(...result.issues)
    if (!result.node) continue
    const key = `${result.node.parentKey ?? 'root'}::${result.node.code}`
    const first = seen.get(key)
    if (first != null) {
      continue
    }
    seen.set(key, i + 1)
    nodes.push(result.node)
    byKind[result.node.kind] = (byKind[result.node.kind] ?? 0) + 1
  }
  const dbDuplicates: ProjectImportPreview['duplicates'] = []
  if (plan.projectId) {
    await ensureProjectDomainSchema()
    const db = await getDB()
    const existing = await db.getAllAsync<{ id: string; parent_id: string | null; code: string }>('SELECT id, parent_id, code FROM project_nodes WHERE project_id = ?', [plan.projectId])
    const map = new Map(existing.map((x) => [`${x.parent_id ?? 'root'}::${x.code}`, x]))
    for (const node of nodes) {
      const found = map.get(`${node.parentKey ?? 'root'}::${node.code}`)
      if (found) dbDuplicates.push({ row: node.row, key: `${node.parentKey ?? 'root'}::${node.code}`, existingId: found.id, action: plan.options?.updateExisting ? 'update' : 'skip' })
    }
  }
  const internalDuplicates = plan.rows.length - nodes.length - issues.filter((x) => x.severity === 'error').length
  const duplicates = [...dbDuplicates]
  for (const [key, row] of seen.entries()) {
    const occurrences = plan.rows.filter((r) => `${parentKeyFor(plan, r) ?? 'root'}::${canonicalAssetCode(r)}` === key)
    if (occurrences.length > 1) duplicates.push({ row: occurrences[1] ? plan.rows.indexOf(occurrences[1]) + 1 : row, key, action: 'skip' })
  }
  return {
    projectName: text(plan.projectName),
    kind: plan.kind,
    currency: text(plan.currency) || 'YER',
    nodes,
    issues,
    duplicates,
    summary: {
      sourceRows: plan.rows.length,
      accepted: nodes.length,
      errors: issues.filter((x) => x.severity === 'error').length,
      warnings: issues.filter((x) => x.severity === 'warning').length,
      duplicates: Math.max(duplicates.length, internalDuplicates),
      byKind,
    },
  }
}

export async function commitProjectImport(plan: ProjectImportPlan): Promise<ProjectImportResult> {
  const preview = await previewProjectImport(plan)
  if (preview.summary.errors > 0) {
    return {
      projectId: plan.projectId ?? '',
      batchId: '',
      created: 0,
      updated: 0,
      skipped: preview.summary.duplicates,
      errors: preview.issues.filter((x) => x.severity === 'error'),
      verification: await projectIntegrityCheck(plan.projectId),
    }
  }
  await ensureProjectDomainSchema()
  const db = await getDB()
  let projectId = plan.projectId ?? ''
  let batchId = id('batch')
  let created = 0
  let updated = 0
  let skipped = preview.summary.duplicates
  await db.withTransactionAsync(async () => {
    if (!projectId) {
      projectId = id('project')
      await db.runAsync('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)', [projectId, plan.projectName, plan.description ?? ''])
    }
    await db.runAsync('INSERT INTO project_profiles (id, project_id, kind, currency, metadata) VALUES (?, ?, ?, ?, ?)', [id('profile'), projectId, plan.kind, plan.currency || 'YER', JSON.stringify({ source: plan.sourceName ?? '' })])
    await db.runAsync('INSERT INTO project_import_batches (id, project_id, kind, status, source_name, row_count, accepted_count, duplicate_count, rejected_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [batchId, projectId, plan.kind, 'committing', plan.sourceName ?? '', plan.rows.length, preview.nodes.length, preview.summary.duplicates, preview.summary.errors])

    const parentIds = new Map<string, string>()
    for (const node of preview.nodes) {
      const parentKey = node.parentKey ?? ''
      let parentId: string | null = parentKey ? parentIds.get(parentKey) ?? null : null
      if (parentKey && !parentId && plan.options?.createMissingParents !== false) {
        const parentKind: ProjectNodeKind = plan.kind === 'land' ? 'block' : parentKey.includes('::') ? 'floor' : 'building'
        parentId = id('node')
        parentIds.set(parentKey, parentId)
        await db.runAsync(`INSERT INTO project_nodes (id, project_id, parent_id, kind, code, name, currency, source_batch_id)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`, [parentId, projectId, parentKind, parentKey, parentKey.replace('::', ' — '), plan.currency || 'YER', batchId])
        if (plan.kind === 'land') {
          await db.runAsync('INSERT INTO blocks (id, project_id, name, plot_count, notes) VALUES (?, ?, ?, ?, ?)', [parentId, projectId, parentKey, 0, 'أنشئ بواسطة محرك إدخال المشاريع'])
        }
      }
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM project_nodes WHERE project_id = ? AND parent_id IS ? AND code = ?', [projectId, parentId, node.code])
      if (existing && !plan.options?.updateExisting) {
        await db.runAsync('INSERT INTO project_import_rows (id, batch_id, source_row_ref, normalized_json, action, reason, node_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [id('row'), batchId, node.sourceRowRef, JSON.stringify(node), 'skip', 'duplicate', existing.id])
        continue
      }
      const nodeId = existing?.id ?? id('node')
      if (existing) {
        await db.runAsync(`UPDATE project_nodes SET parent_id = ?, kind = ?, name = ?, area_sqm = ?, status = ?, value = ?, buyer_name = ?, buyer_contact = ?, paid_amount = ?, remaining_amount = ?, metadata = ?, source_batch_id = ?, source_row_ref = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?`, [parentId, node.kind, node.name, node.areaSqm, node.status, node.value, node.buyerName, node.buyerContact, node.paidAmount, node.remainingAmount, JSON.stringify(node.metadata), batchId, node.sourceRowRef, nodeId])
        updated++
      } else {
        await db.runAsync(`INSERT INTO project_nodes (id, project_id, parent_id, kind, code, name, level_no, area_sqm, status, value, buyer_name, buyer_contact, paid_amount, remaining_amount, currency, metadata, source_batch_id, source_row_ref)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [nodeId, projectId, parentId, node.kind, node.code, node.name, node.levelNo, node.areaSqm, node.status, node.value, node.buyerName, node.buyerContact, node.paidAmount, node.remainingAmount, plan.currency || 'YER', JSON.stringify(node.metadata), batchId, node.sourceRowRef])
        created++
      }
      await db.runAsync('INSERT INTO project_import_rows (id, batch_id, source_row_ref, normalized_json, action, reason, node_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [id('row'), batchId, node.sourceRowRef, JSON.stringify(node), existing ? 'update' : 'create', '', nodeId])
      if (plan.kind === 'land' && parentId) {
        const plot = await db.getFirstAsync<{ id: string }>('SELECT id FROM plots WHERE id = ?', [nodeId])
        if (!plot) {
          await db.runAsync(`INSERT INTO plots (id, block_id, plot_no, area_sqm, status, value, buyer_name, buyer_contact, sale_date, installment_type, paid_amount, remaining_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [nodeId, parentId, node.code, node.areaSqm, node.status === 'reserved' ? 'available' : node.status === 'cancelled' ? 'available' : node.status, node.value, node.buyerName, node.buyerContact, node.metadata.sale_date ?? '', node.metadata.installment_type ?? '', node.paidAmount, node.remainingAmount])
        } else {
          await db.runAsync('UPDATE plots SET area_sqm = ?, status = ?, value = ?, buyer_name = ?, buyer_contact = ?, paid_amount = ?, remaining_amount = ?, updated_at = datetime(\'now\') WHERE id = ?', [node.areaSqm, node.status, node.value, node.buyerName, node.buyerContact, node.paidAmount, node.remainingAmount, nodeId])
        }
      }
    }
    await db.runAsync('UPDATE project_import_batches SET status = ?, committed_at = datetime(\'now\') WHERE id = ?', ['committed', batchId])
    if (plan.kind === 'land') {
      await db.runAsync(`UPDATE blocks SET plot_count = (SELECT COUNT(*) FROM plots WHERE plots.block_id = blocks.id) WHERE project_id = ?`, [projectId])
    }
  })
  const verification = await projectIntegrityCheck(projectId)
  return { projectId, batchId, created, updated, skipped, errors: preview.issues.filter((x) => x.severity === 'error'), verification }
}

export async function projectIntegrityCheck(projectId?: string): Promise<{
  ok: boolean
  projectId: string | null
  orphanNodes: number
  duplicateCodes: { parentId: string | null; code: string; count: number }[]
  moneyDrift: { nodeId: string; value: number; paid: number; remaining: number; difference: number }[]
  legacyDrift: { blockId: string; declared: number; actual: number }[]
  warnings: string[]
}> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const resolvedProjectId = projectId ? await resolveProjectRef(projectId) : undefined
  const where = resolvedProjectId ? 'WHERE project_id = ?' : ''
  const params = resolvedProjectId ? [resolvedProjectId] : []
  const orphanRow = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM project_nodes WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM project_nodes) ${where ? 'AND project_id = ?' : ''}`, resolvedProjectId ? [resolvedProjectId] : [])
  const duplicateCodeRows = await db.getAllAsync<{ parent_id: string | null; code: string; count: number }>(`SELECT parent_id, code, COUNT(*) AS count FROM project_nodes ${where} GROUP BY project_id, parent_id, code HAVING COUNT(*) > 1`, params)
  const duplicateCodes = duplicateCodeRows.map((row) => ({ parentId: row.parent_id, code: row.code, count: row.count }))
  const moneyWhere = where ? `${where} AND` : 'WHERE'
  const moneyRows = await db.getAllAsync<{ id: string; value: number; paid_amount: number; remaining_amount: number }>(`SELECT id, value, paid_amount, remaining_amount FROM project_nodes ${moneyWhere} (paid_amount < 0 OR remaining_amount < 0 OR ABS((paid_amount + remaining_amount) - value) > 0.01)`, params)
  const legacyDrift = resolvedProjectId ? await db.getAllAsync<{ id: string; plot_count: number; actual: number }>(`SELECT b.id, b.plot_count, COUNT(p.id) AS actual FROM blocks b LEFT JOIN plots p ON p.block_id = b.id WHERE b.project_id = ? GROUP BY b.id HAVING b.plot_count != COUNT(p.id)`, [resolvedProjectId]) : []
  const warnings: string[] = []
  if ((orphanRow?.c ?? 0) > 0) warnings.push('توجد عقد مشروع يتيمة.')
  if (duplicateCodes.length > 0) warnings.push('توجد أكواد أصول مكررة داخل نفس الأب.')
  if (moneyRows.length > 0) warnings.push('توجد فروقات في قيمة الأصل مقابل المدفوع والمتبقي.')
  if (legacyDrift.length > 0) warnings.push('عدادات البلوكات القديمة لا تطابق عدد القطع.')
  return {
    ok: (orphanRow?.c ?? 0) === 0 && duplicateCodes.length === 0 && moneyRows.length === 0 && legacyDrift.length === 0,
    projectId: resolvedProjectId ?? null,
    orphanNodes: orphanRow?.c ?? 0,
    duplicateCodes,
    moneyDrift: moneyRows.map((r) => ({ nodeId: r.id, value: Number(r.value) || 0, paid: Number(r.paid_amount) || 0, remaining: Number(r.remaining_amount) || 0, difference: Math.round(((Number(r.value) || 0) - (Number(r.paid_amount) || 0) - (Number(r.remaining_amount) || 0)) * 100) / 100 })),
    legacyDrift: legacyDrift.map((r) => ({ blockId: r.id, declared: r.plot_count, actual: r.actual })),
    warnings,
  }
}

export async function recordLedgerPayment(input: LedgerPaymentInput): Promise<{ ledgerId: string; paidAmount: number; remainingAmount: number; status: ProjectNodeStatus }> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const projectId = await resolveProjectRef(input.projectId)
  const amount = numberValue(input.amount)
  if (!(amount > 0)) throw new Error('مبلغ الدفعة يجب أن يكون أكبر من صفر.')
  const payDate = normalizeDate(input.payDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) throw new Error('تاريخ الدفعة يجب أن يكون بصيغة YYYY-MM-DD.')
  if ((input.nodeId ? 1 : 0) + (input.plotId ? 1 : 0) !== 1) throw new Error('يجب تحديد أصل مالي واحد فقط: nodeId أو plotId.')
  const ledgerId = id('payment')
  let paidAmount = 0
  let remainingAmount = 0
  let status: ProjectNodeStatus = 'available'
  await db.withTransactionAsync(async () => {
    let asset: { id: string; value: number; paid_amount: number; remaining_amount: number; status: ProjectNodeStatus } | null = null
    if (input.nodeId) asset = await db.getFirstAsync<any>('SELECT id, value, paid_amount, remaining_amount, status FROM project_nodes WHERE id = ? AND project_id = ?', [input.nodeId, projectId])
    if (!asset && input.plotId) asset = await db.getFirstAsync<any>('SELECT id, value, paid_amount, remaining_amount, status FROM plots WHERE id = ?', [input.plotId])
    if (!asset) throw new Error('الأصل المالي غير موجود في المشروع المحدد.')
    const currentPaid = numberValue(asset.paid_amount)
    const currentRemaining = numberValue(asset.remaining_amount || Math.max(0, numberValue(asset.value) - currentPaid))
    if (!input.allowOverpayment && amount > currentRemaining + 0.01) throw new Error(`الدفعة تتجاوز المتبقي بمقدار ${(amount - currentRemaining).toFixed(2)}.`)
    paidAmount = Math.round((currentPaid + amount) * 100) / 100
    remainingAmount = Math.max(0, Math.round((currentRemaining - amount) * 100) / 100)
    status = remainingAmount <= 0 ? 'sold' : 'installment'
    await db.runAsync(`INSERT INTO cash_ledger_entries (id, project_id, node_id, plot_id, kind, amount, currency, pay_date, method, reference, note, source)
      VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)`, [ledgerId, projectId, input.nodeId ?? null, input.plotId ?? null, amount, input.currency ?? 'YER', payDate, input.method, input.reference ?? input.bankRefNo ?? input.cashReceiptNo ?? '', input.note ?? '', input.source ?? 'user'])
    if (input.nodeId) await db.runAsync('UPDATE project_nodes SET paid_amount = ?, remaining_amount = ?, status = ?, version = version + 1, updated_at = datetime(\'now\') WHERE id = ?', [paidAmount, remainingAmount, status, input.nodeId])
    if (input.plotId) {
      const plot = await db.getFirstAsync<{ plot_no: string; block_id: string }>('SELECT plot_no, block_id FROM plots WHERE id = ?', [input.plotId])
      await db.runAsync('INSERT INTO plot_payments (id, plot_id, amount, pay_date, method, cash_recipient, cash_receipt_no, bank_name, bank_ref_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [ledgerId, input.plotId, amount, payDate, input.method === 'bank' || input.method === 'transfer' ? 'bank' : 'cash', input.cashRecipient ?? '', input.cashReceiptNo ?? '', input.bankName ?? '', input.bankRefNo ?? ''])
      await db.runAsync('UPDATE plots SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [paidAmount, remainingAmount, status === 'sold' ? 'sold' : 'installment', input.plotId])
      void plot
    }
  })
  return { ledgerId, paidAmount, remainingAmount, status }
}

export async function projectCashflow(projectId: string, options: { fromDate?: string; toDate?: string } = {}): Promise<{ entries: Record<string, any>[]; totals: { count: number; amount: number; byMethod: Record<string, number>; byMonth: Record<string, number> } }> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const resolvedProjectId = await resolveProjectRef(projectId)
  const conditions = ['l.project_id = ?']
  const params: any[] = [resolvedProjectId]
  if (options.fromDate) { conditions.push('l.pay_date >= ?'); params.push(normalizeDate(options.fromDate)) }
  if (options.toDate) { conditions.push('l.pay_date <= ?'); params.push(normalizeDate(options.toDate)) }
  const entries = await db.getAllAsync<any>(`SELECT l.*, n.code, n.name as node_name, p.plot_no FROM cash_ledger_entries l LEFT JOIN project_nodes n ON n.id = l.node_id LEFT JOIN plots p ON p.id = l.plot_id WHERE ${conditions.join(' AND ')} ORDER BY l.pay_date DESC, l.created_at DESC`, params)
  const byMethod: Record<string, number> = {}
  const byMonth: Record<string, number> = {}
  let amount = 0
  for (const entry of entries) {
    const value = numberValue(entry.amount)
    amount += value
    byMethod[entry.method] = (byMethod[entry.method] ?? 0) + value
    const month = text(entry.pay_date).slice(0, 7) || 'غير محدد'
    byMonth[month] = (byMonth[month] ?? 0) + value
  }
  return { entries, totals: { count: entries.length, amount: Math.round(amount * 100) / 100, byMethod, byMonth } }
}

export async function reverseLedgerPayment(paymentId: string, plotId?: string, reason = ''): Promise<{ reversalId: string; amount: number; plotId: string; remainingAmount: number; status: ProjectNodeStatus }> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const payment = await db.getFirstAsync<any>(
    `SELECT pm.*, pl.value AS plot_value, pl.block_id, b.project_id
     FROM plot_payments pm JOIN plots pl ON pl.id = pm.plot_id JOIN blocks b ON b.id = pl.block_id
     WHERE pm.id = ? ${plotId ? 'AND pm.plot_id = ?' : ''}`,
    plotId ? [paymentId, plotId] : [paymentId]
  )
  if (!payment) throw new Error('الدفعة غير موجودة أو لا تنتمي إلى القطعة المحددة.')
  const amount = numberValue(payment.amount)
  if (!(amount > 0)) throw new Error('لا يمكن عكس دفعة بمبلغ غير موجب.')
  const reversalId = id('reversal')
  let remainingAmount = 0
  let status: ProjectNodeStatus = 'available'
  await db.withTransactionAsync(async () => {
    const ledger = await db.getFirstAsync<{ id: string; reversed_entry_id: string | null }>('SELECT id, reversed_entry_id FROM cash_ledger_entries WHERE id = ? AND kind = \'payment\'', [paymentId])
    if (ledger?.reversed_entry_id) throw new Error('هذه الدفعة معكوسة سابقاً.')
    await db.runAsync(`INSERT INTO cash_ledger_entries (id, project_id, plot_id, kind, amount, currency, pay_date, method, reference, note, source, reversed_entry_id)
      VALUES (?, ?, ?, 'reversal', ?, 'YER', ?, ?, ?, ?, 'user', ?)`, [reversalId, payment.project_id, payment.plot_id, -amount, payment.pay_date, payment.method === 'bank' ? 'bank' : 'cash', payment.cash_receipt_no || payment.bank_ref_no || '', reason || `عكس الدفعة ${paymentId}`, paymentId])
    if (ledger) await db.runAsync('UPDATE cash_ledger_entries SET reversed_entry_id = ? WHERE id = ?', [reversalId, paymentId])
    await db.runAsync('DELETE FROM plot_payments WHERE id = ?', [paymentId])
    const totals = await db.getFirstAsync<{ paid: number }>('SELECT COALESCE(SUM(amount), 0) AS paid FROM plot_payments WHERE plot_id = ?', [payment.plot_id])
    const paid = Math.max(0, numberValue(totals?.paid))
    remainingAmount = Math.max(0, numberValue(payment.plot_value) - paid)
    status = paid <= 0 ? 'available' : remainingAmount <= 0 ? 'sold' : 'installment'
    await db.runAsync(`UPDATE plots SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`, [paid, remainingAmount, status === 'available' ? 'available' : status, payment.plot_id])
  })
  return { reversalId, amount, plotId: payment.plot_id, remainingAmount, status }
}

export async function getProjectProfile(projectId: string): Promise<ProjectProfile | null> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const resolvedProjectId = await resolveProjectRef(projectId)
  const row = await db.getFirstAsync<any>('SELECT * FROM project_profiles WHERE project_id = ?', [resolvedProjectId])
  if (!row) return null
  return { ...row, metadata: JSON.parse(row.metadata || '{}') }
}

export async function listProjectNodes(projectId: string, options: { parentId?: string; kind?: ProjectNodeKind; search?: string; limit?: number } = {}): Promise<ProjectNode[]> {
  await ensureProjectDomainSchema()
  const db = await getDB()
  const resolvedProjectId = await resolveProjectRef(projectId)
  const conditions = ['project_id = ?']
  const params: any[] = [resolvedProjectId]
  if (options.parentId) { conditions.push('parent_id = ?'); params.push(options.parentId) }
  if (options.kind) { conditions.push('kind = ?'); params.push(options.kind) }
  if (options.search?.trim()) { conditions.push('(code LIKE ? OR name LIKE ? OR buyer_name LIKE ?)'); const q = `%${options.search.trim()}%`; params.push(q, q, q) }
  const limit = Math.max(1, Math.min(10000, Math.floor(options.limit ?? 2000)))
  const rows = await db.getAllAsync<any>(`SELECT * FROM project_nodes WHERE ${conditions.join(' AND ')} ORDER BY parent_id, level_no, code LIMIT ?`, [...params, limit])
  return rows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata || '{}') })) as ProjectNode[]
}
