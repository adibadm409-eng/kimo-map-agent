import { getDB } from '../database/db'
import * as SQLite from 'expo-sqlite'
import { getEntityDef, fieldOptions } from './catalog'
import type { QuerySpec, FilterCond } from './query'
import { queryEntities, queryEntityById } from './query'
import { resolvePlotRef, resolveProjectRef } from '../domain/projectRef'

export interface PlotFinancials {
  plot_id: string
  plot_no: string
  block_name: string
  project_name: string
  status: string
  value: number
  paid_amount: number
  remaining_amount: number
  payments_sum: number
  difference: number
}

export async function projectTree(projectRef: string): Promise<Record<string, any>> {
  const projectId = await resolveProjectRef(projectRef)
  const projectRow = await queryEntityById('projects', projectId)
  if (!projectRow) throw new Error(`Project not found: ${projectId}`)

  const blocks = await queryEntities({
    entity: 'blocks',
    filters: [{ field: 'project_id', op: 'eq', value: projectId }],
    sort: { field: 'created_at', dir: 'asc' },
    limit: 2000,
  })
  const blockIds = blocks.rows.map((b) => b.id)

  // دفعات جلب موحدة بدل استعلام متداخل لكل بلوك/قطعة (إزالة N+1)
  const plots = blockIds.length
    ? await queryChunked('plots', 'block_id', blockIds, { sort: { field: 'plot_no', dir: 'asc' }, limit: 10000, withCustomValues: true })
    : []
  const plotIds = plots.map((p) => p.id)
  const allPayments = plotIds.length
    ? await queryChunked('plot_payments', 'plot_id', plotIds, { sort: { field: 'pay_date', dir: 'asc' }, limit: 10000 })
    : []

  const plotsByBlock = new Map<string, Record<string, any>[]>()
  for (const p of plots) {
    const arr = plotsByBlock.get(p.block_id) ?? []
    arr.push(p)
    plotsByBlock.set(p.block_id, arr)
  }
  const paymentsByPlot = new Map<string, Record<string, any>[]>()
  for (const pm of allPayments) {
    const arr = paymentsByPlot.get(pm.plot_id) ?? []
    arr.push(pm)
    paymentsByPlot.set(pm.plot_id, arr)
  }

  const blocksWithPlots = blocks.rows.map((block) => ({
    ...block,
    plots: (plotsByBlock.get(block.id) ?? []).map((plot) => ({
      ...plot,
      payments: paymentsByPlot.get(plot.id) ?? [],
    })),
  }))

  const totals = computeTotals(blocksWithPlots, allPayments)
  return { project: projectRow, blocks: blocksWithPlots, totals }
}

/** جلب سجلات عبر فلاتر IN على دفعات (تجنب تجاوز حد معاملات SQLite) ثم دمجها مع الحفاظ على الترتيب. */
async function queryChunked(
  entity: string,
  field: string,
  ids: string[],
  base?: Partial<Omit<QuerySpec, 'entity' | 'filters'>>
): Promise<Record<string, any>[]> {
  const CHUNK = 400
  const out: Record<string, any>[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const idsChunk = ids.slice(i, i + CHUNK)
    const res = await queryEntities({
      entity: entity as QuerySpec['entity'],
      filters: [{ field, op: 'in', value: idsChunk }],
      limit: base?.limit ?? 2000,
      sort: base?.sort,
      withCustomValues: base?.withCustomValues,
    })
    out.push(...res.rows)
  }
  return out
}

function computeTotals(
  blocks: Record<string, any>[],
  payments: Record<string, any>[]
) {
  const plots = blocks.flatMap((b) => b.plots ?? [])
  const value = sum(plots.map((p) => p.value))
  const paidCt = sum(plots.map((p) => p.paid_amount))
  const remainingCt = sum(plots.map((p) => p.remaining_amount))
  const paidActual = sum(payments.map((p) => p.amount))
  return {
    projects: 1,
    blocks: blocks.length,
    plots: plots.length,
    available: plots.filter((p) => p.status === 'available').length,
    sold: plots.filter((p) => p.status === 'sold').length,
    installment: plots.filter((p) => p.status === 'installment').length,
    value,
    paid_column: paidCt,
    remaining_column: remainingCt,
    paid_actual: paidActual,
    difference_column_vs_payments: round(paidCt - paidActual),
  }
}

export async function projectFinancials(
  projectId: string,
  options: { include_payments?: boolean } = {}
): Promise<{ rows: PlotFinancials[]; aggregates: Record<string, number> }> {
  const tree = await projectTree(projectId)
  const rows: PlotFinancials[] = []
  let paymentsSum = 0
  let valueSum = 0
  let paidSum = 0
  let remainingSum = 0
  for (const block of tree.blocks as Record<string, any>[]) {
    for (const plot of (block.plots ?? []) as Record<string, any>[]) {
      const payments = (plot.payments ?? []) as Record<string, any>[]
      const ps = sum(payments.map((p) => p.amount))
      paymentsSum += ps
      valueSum += num(plot.value)
      paidSum += num(plot.paid_amount)
      remainingSum += num(plot.remaining_amount)
      rows.push({
        plot_id: plot.id,
        plot_no: plot.plot_no ?? '',
        block_name: block.name ?? '',
        project_name: tree.project.name ?? '',
        status: plot.status ?? 'available',
        value: num(plot.value),
        paid_amount: num(plot.paid_amount),
        remaining_amount: num(plot.remaining_amount),
        payments_sum: ps,
        difference: round(num(plot.paid_amount) - ps),
      })
    }
  }
  return {
    rows,
    aggregates: {
      plots: rows.length,
      value: valueSum,
      paid_column: paidSum,
      remaining_column: remainingSum,
      paid_actual: paymentsSum,
      difference: round(paidSum - paymentsSum),
      collection_rate_pct: valueSum ? round((paymentsSum / valueSum) * 100) : 0,
      rem_collection_rate_pct: valueSum ? round((paidSum / valueSum) * 100) : 0,
    },
  }
}

export async function installmentSchedule(plotRef: string, projectRef?: string): Promise<Record<string, any> | null> {
  const plotId = await resolvePlotRef(plotRef, projectRef)
  const row = await queryEntityById('plots', plotId)
  if (!row) return null
  if (row.status !== 'installment') {
    return {
      plot_no: row.plot_no,
      status: row.status,
      note: 'القطعة ليست قيد التقسيط — لا توجد جدولة',
      schedule: [],
    }
  }
  if (!row.installment_type) {
    return {
      plot_no: row.plot_no,
      status: row.status,
      value: num(row.value),
      paid_amount: num(row.paid_amount),
      remaining_amount: num(row.remaining_amount),
      note: 'القطعة قيد التقسيط، لكن نوع التقسيط مفقود؛ لا يمكن حساب الدفعة التالية أو إنشاء جدول دقيق قبل تحديده.',
      schedule: [],
    }
  }
  const intervalsPerYear: Record<string, number> = {
    monthly: 12,
    quarterly: 4,
    semi_annual: 2,
    annual: 1,
  }
  const n = intervalsPerYear[row.installment_type] ?? 12
  const remaining = num(row.remaining_amount)
  const nextPayment = n ? round(remaining / n) : 0
  const paid = num(row.paid_amount)
  const value = num(row.value)
  const installmentsDone = n && value ? round(paid / (value / n)) : 0
  return {
    plot_no: row.plot_no,
    value,
    paid_amount: paid,
    remaining_amount: remaining,
    installment_type: row.installment_type,
    installments_per_year: n,
    next_payment_amount: nextPayment,
    installments_done_estimate: installmentsDone,
    schedule: buildScheduleArray(row),
  }
}

function buildScheduleArray(row: Record<string, any>): Record<string, any>[] {
  const remaining = num(row.remaining_amount)
  const n = 12
  const each = round(remaining / n)
  const out: Record<string, any>[] = []
  for (let i = 1; i <= Math.min(n, 24); i++) {
    if (i > Math.ceil(remaining / Math.max(each, 1)) + 2 && each > 0) break
    out.push({ month: i, amount: each })
  }
  return out
}

export async function buyerSummary(
  buyer_query?: string,
  project_ref?: string,
): Promise<{ rows: Record<string, any>[]; totals: Record<string, any> }> {
  const db = await getDB()
  const conditions = [
    `p.status != 'available'`,
    `TRIM(COALESCE(p.buyer_name, '')) <> ''`,
  ]
  const params: SQLite.SQLiteBindValue[] = []
  if (project_ref && project_ref.trim()) {
    conditions.push('b.project_id = ?')
    params.push(await resolveProjectRef(project_ref.trim()))
  }
  if (buyer_query && buyer_query.trim()) {
    conditions.push('p.buyer_name LIKE ?')
    params.push(`%${buyer_query.trim()}%`)
  }
  const allRelevant = await db.getAllAsync<Record<string, any>>(
    `SELECT p.*, b.name AS block_name, b.project_id, pr.name AS project_name
       FROM plots p
       LEFT JOIN blocks b ON b.id = p.block_id
       LEFT JOIN projects pr ON pr.id = b.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.buyer_name ASC, p.plot_no ASC
      LIMIT 10000`,
    params,
  )
  const byBuyer = new Map<string, { value: number; paid: number; remaining: number; count: number; plots: string[] }>()
  for (const p of allRelevant) {
    const key = String(p.buyer_name)
    const cur = byBuyer.get(key) ?? { value: 0, paid: 0, remaining: 0, count: 0, plots: [] }
    cur.value += num(p.value)
    cur.paid += num(p.paid_amount)
    cur.remaining += num(p.remaining_amount)
    cur.count += 1
    cur.plots.push(`${String(p.plot_no)} (${String(p.project_name ?? '')})`)
    byBuyer.set(key, cur)
  }
  const rows = [...byBuyer.entries()].map(([buyer, agg]) => ({
    buyer,
    plot_count: agg.count,
    total_value: agg.value,
    paid: agg.paid,
    remaining: agg.remaining,
    plots: agg.plots,
  }))
  rows.sort((a, b) => b.remaining - a.remaining)
  return {
    rows,
    totals: {
      buyers: rows.length,
      plots: allRelevant.length,
      value: sum(allRelevant.map((p) => num(p.value))),
      paid: sum(allRelevant.map((p) => num(p.paid_amount))),
      remaining: sum(allRelevant.map((p) => num(p.remaining_amount))),
    },
  }
}

export async function paymentLedger(f: {
  project_id?: string
  block_id?: string
  plot_id?: string
  method?: string
  from_date?: string
  to_date?: string
  limit?: number
}): Promise<Record<string, any>[]> {
  const resolvedProjectId = f.project_id ? await resolveProjectRef(f.project_id) : undefined
  const resolvedPlotId = f.plot_id ? await resolvePlotRef(f.plot_id, resolvedProjectId) : undefined
  const resolved = { ...f, project_id: resolvedProjectId, plot_id: resolvedPlotId }
  const [canonical, legacy] = await Promise.all([
    cashLedgerScoped(resolved),
    paymentLedgerScoped(resolved),
  ])
  return enrichLedger(mergeLedgerRows(canonical, legacy, f.limit))
}

/** المصدر المالي الحديث هو cash_ledger_entries؛ plot_payments بقي للتوافق مع السجلات القديمة. */
async function cashLedgerScoped(f: {
  project_id?: string
  block_id?: string
  plot_id?: string
  method?: string
  from_date?: string
  to_date?: string
  limit?: number
}): Promise<Record<string, any>[]> {
  const db = await getDB()
  const conds: string[] = []
  const params: SQLite.SQLiteBindValue[] = []
  if (f.project_id) {
    conds.push('l.project_id = ?')
    params.push(f.project_id)
  }
  if (f.block_id) {
    conds.push('(pl.block_id = ? OR pn.parent_id = ?)')
    params.push(f.block_id, f.block_id)
  }
  if (f.plot_id) {
    conds.push('l.plot_id = ?')
    params.push(f.plot_id)
  }
  if (f.method) {
    conds.push('l.method = ?')
    params.push(f.method)
  }
  if (f.from_date) {
    conds.push('l.pay_date >= ?')
    params.push(f.from_date)
  }
  if (f.to_date) {
    conds.push('l.pay_date <= ?')
    params.push(f.to_date)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return await db.getAllAsync<any>(
    `SELECT l.*, pl.plot_no, pl.block_id, b.name AS block_name, b.project_id, prj.name AS project_name,
            pl.value AS plot_value, pl.paid_amount AS plot_paid, pl.remaining_amount AS plot_remaining,
            pn.code AS node_code, pn.name AS node_name, pn.remaining_amount AS node_remaining
       FROM cash_ledger_entries l
       LEFT JOIN plots pl ON l.plot_id = pl.id
       LEFT JOIN blocks b ON pl.block_id = b.id
       LEFT JOIN projects prj ON l.project_id = prj.id
       LEFT JOIN project_nodes pn ON l.node_id = pn.id
       ${where}
      ORDER BY l.pay_date DESC, l.created_at DESC
      LIMIT ?`,
    [...params, f.limit && f.limit > 0 ? f.limit : 2000],
  )
}

async function paymentLedgerScoped(f: {
  project_id?: string
  block_id?: string
  plot_id?: string
  method?: string
  from_date?: string
  to_date?: string
  limit?: number
}): Promise<Record<string, any>[]> {
  const db = await getDB()
  const conds: string[] = []
  const params: SQLite.SQLiteBindValue[] = []
  if (f.project_id) {
    conds.push('b.project_id = ?')
    params.push(f.project_id)
  }
  if (f.block_id) {
    conds.push('pl.block_id = ?')
    params.push(f.block_id)
  }
  if (f.plot_id) {
    conds.push('pm.plot_id = ?')
    params.push(f.plot_id)
  }
  if (f.method) {
    conds.push('pm.method = ?')
    params.push(f.method)
  }
  if (f.from_date) {
    conds.push('pm.pay_date >= ?')
    params.push(f.from_date)
  }
  if (f.to_date) {
    conds.push('pm.pay_date <= ?')
    params.push(f.to_date)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return await db.getAllAsync<any>(
    `SELECT pm.*, pl.plot_no, pl.block_id, b.name as block_name, b.project_id, prj.name as project_name,
            pl.value as plot_value, pl.paid_amount as plot_paid, pl.remaining_amount as plot_remaining
     FROM plot_payments pm
     LEFT JOIN plots pl ON pm.plot_id = pl.id
     LEFT JOIN blocks b ON pl.block_id = b.id
     LEFT JOIN projects prj ON b.project_id = prj.id
     ${where}
     ORDER BY pm.pay_date DESC, pm.created_at DESC
     LIMIT ?`,
    [...params, f.limit && f.limit > 0 ? f.limit : 2000]
  )
}

function mergeLedgerRows(canonical: Record<string, any>[], legacy: Record<string, any>[], limit?: number): Record<string, any>[] {
  const merged = new Map<string, Record<string, any>>()
  for (const row of [...legacy, ...canonical]) {
    const id = String(row.id ?? `${row.plot_id ?? row.node_id ?? ''}:${row.pay_date ?? ''}:${row.amount ?? ''}:${row.reference ?? row.cash_receipt_no ?? ''}`)
    merged.set(id, { ...merged.get(id), ...row })
  }
  return [...merged.values()]
    .sort((a, b) => String(b.pay_date ?? '').localeCompare(String(a.pay_date ?? '')) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, limit && limit > 0 ? limit : 2000)
}

function enrichLedger(rows: Record<string, any>[]): Record<string, any>[] {
  const methodLabels = fieldOptions(getEntityDef('plot_payments')!, 'method') ?? {}
  return rows.map((r) => ({ ...r, method_label: methodLabels[r.method] ?? r.method }))
}

export async function dashboardKpis(): Promise<Record<string, any>> {
  const counts: Record<string, number> = {}
  for (const key of ['properties', 'clients', 'offers', 'campaigns', 'viewings', 'projects', 'blocks', 'plots', 'plot_payments'] as const) {
    counts[key] = (await countRows(key)).count
  }
  const plots = await queryEntities({ entity: 'plots', limit: 10000 })
  const paymentsEntity = await queryEntities({ entity: 'plot_payments', limit: 10000 })
  const payments = paymentsEntity.rows
  return {
    counts,
    plots_value: sum(plots.rows.map((p) => num(p.value))),
    plots_paid_column: sum(plots.rows.map((p) => num(p.paid_amount))),
    plots_remaining_column: sum(plots.rows.map((p) => num(p.remaining_amount))),
    payments_sum: sum(payments.map((p) => num(p.amount))),
  }
}

async function countRows(key: string): Promise<{ count: number }> {
  const db = await getDB()
  const entity = getEntityDef(key)
  if (!entity) return { count: 0 }
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${entity.table}`)
  return { count: row?.c ?? 0 }
}

export async function aggregateQuery(spec: QuerySpec): Promise<Record<string, any>> {
  return await queryEntities(spec)
}

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function sum(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0)
}
function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * مراجعة تدقيقية ذاتية لأحدث ما نفّذه الوكيل: تقرأ آخر عمليات سجل التدقيق
 * (للجلسة/أو نطاق زمني/أو مشروع)، ثم تتأكد من سلامة الروابط والترابط
 * فتمنع البيانات اليتيمة أو غير المترابطة وتكشف الفروقات قبل إغلاق المهمة.
 */
export async function reviewMyWork(opts: { sessionId?: string; projectId?: string; minutes?: number }): Promise<Record<string, any>> {
  const db = await getDB()
  const minutes = Math.max(1, Math.min(1440, Number(opts.minutes ?? 30)))
  const since = Date.now() - minutes * 60 * 1000

  const logWhere: string[] = ['actor = ?', 'created_at >= ?']
  const logParams: any[] = ['agent', since]
  if (opts.sessionId) { logWhere.push('session_id = ?'); logParams.push(opts.sessionId) }
  const logSql = `SELECT action, scope, scope_id, summary FROM change_log WHERE ${logWhere.join(' AND ')} ORDER BY created_at DESC LIMIT 200`
  const logRows = await db.getAllAsync<{ action: string; scope: string; scope_id: string; summary: string }>(logSql, ...logParams)

  const counts: Record<string, number> = {}
  const created: { scope: string; id: string; summary: string }[] = []
  for (const r of logRows) {
    counts[r.action] = (counts[r.action] ?? 0) + 1
    if (r.action === 'create') created.push({ scope: r.scope, id: r.scope_id, summary: r.summary })
  }

  // فحوصات سلامة الروابط والترابط (تمنع اليتيمة وغير المترابطة)
  const orphanPlots = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM plots WHERE block_id NOT IN (SELECT id FROM blocks)`
  )
  const orphanBlocks = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM blocks WHERE project_id NOT IN (SELECT id FROM projects)`
  )
  const orphanPayments = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM plot_payments WHERE plot_id NOT IN (SELECT id FROM plots)`
  )

  // فروقات عدّاد plot_count العدد الفعلي للقطع
  const driftRows = await db.getAllAsync<{ id: string; name: string; project_id: string; plot_count: number; actual: number }>(
    `SELECT b.id, b.name, b.project_id, b.plot_count,
       (SELECT COUNT(*) FROM plots p WHERE p.block_id = b.id) AS actual
     FROM blocks b
     WHERE (SELECT COUNT(*) FROM plots p WHERE p.block_id = b.id) != b.plot_count`
  )
  const plotCountDrift = driftRows.map((r) => ({ block_id: r.id, name: r.name, declared: r.plot_count, actual: r.actual }))

  // فروقات المال: قيمة != مدفوع + متبقي (للقطع المبيعة/التقسيط)
  let moneyPlotsScope: [string, any[]] = ['', []]
  if (opts.projectId) {
    moneyPlotsScope = [
      `AND p.block_id IN (SELECT id FROM blocks WHERE project_id = ?)`,
      [opts.projectId],
    ]
  }
  const moneyRows = await db.getAllAsync<{ id: string; plot_no: string; status: string; value: number; paid: number; remaining: number }>(
    `SELECT p.id, p.plot_no, p.status, p.value AS value, p.paid_amount AS paid, p.remaining_amount AS remaining
     FROM plots p
     WHERE p.status IN ('sold','installment')
       AND (p.paid_amount + p.remaining_amount) != p.value
       ${moneyPlotsScope[0]}`,
    ...moneyPlotsScope[1]
  )
  const moneyDrift = moneyRows.map((r) => ({
    plot_id: r.id, plot_no: r.plot_no, status: r.status,
    value: r.value, paid: r.paid, remaining: r.remaining,
    mismatch: round(r.value - (r.paid + r.remaining)),
  }))

  // عدّادات إن أمكن تحديدها (عند project_id)
  let projectTotals: Record<string, any> | undefined
  if (opts.projectId) {
    const proj = await db.getFirstAsync<{ id: string; name: string }>('SELECT id, name FROM projects WHERE id = ?', [opts.projectId])
    if (proj) {
      const blks = await db.getAllAsync<{ id: string }>('SELECT id FROM blocks WHERE project_id = ?', [opts.projectId])
      const ids = blks.map((b) => b.id)
      if (ids.length) {
        const ph = ids.map(() => '?').join(', ')
        const totalRow = await db.getFirstAsync<{ plots: number; available: number; sold: number; installment: number; value: number; paid: number; remaining: number }>(
          `SELECT COUNT(*) AS plots,
            SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN status='sold' THEN 1 ELSE 0 END) AS sold,
            SUM(CASE WHEN status='installment' THEN 1 ELSE 0 END) AS installment,
            COALESCE(SUM(value),0) AS value,
            COALESCE(SUM(paid_amount),0) AS paid,
            COALESCE(SUM(remaining_amount),0) AS remaining
           FROM plots WHERE block_id IN (${ph})`,
          ...ids
        )
        projectTotals = {
          project_id: opts.projectId,
          name: proj.name,
          blocks: ids.length,
          ...totalRow,
        }
      } else {
        projectTotals = { project_id: opts.projectId, name: proj.name, blocks: 0, plots: 0, available: 0, sold: 0, installment: 0, value: 0, paid: 0, remaining: 0 }
      }
    }
  }

  const orphaned = (orphanPlots?.c ?? 0) + (orphanBlocks?.c ?? 0) + (orphanPayments?.c ?? 0)
  const integrityOk = orphaned === 0 && plotCountDrift.length === 0 && moneyDrift.length === 0

  return {
    windowMinutes: minutes,
    sessionId: opts.sessionId ?? null,
    projectId: opts.projectId ?? null,
    recentActions: counts,
    createdEntities: created,
    integrity: {
      ok: integrityOk,
      orphanPlots: orphanPlots?.c ?? 0,
      orphanBlocks: orphanBlocks?.c ?? 0,
      orphanPayments: orphanPayments?.c ?? 0,
      plotCountDrift,
      moneyDrift,
    },
    projectTotals,
    guidance: integrityOk
      ? 'السلامة سليمة: لا بيانات يتيمة ولا فروقات عدّادات أو مبالغ. تحقّق الآن من اكتمال بيانات كل قطعة (الحالة والمشتري والمدفوع) حسب طلب المستخدم، وإن بقي نقص صحّحه أو أبلغ المستخدم بما تبقى.'
      : (
        orphaned > 0
          ? `يوجد ${orphaned} سجل يتيم (بلا والد) يجب حذفه أو ربطه أو إعادة إنشاء أصله. استدعِ الأدوات المناسبة لحلّ ذلك قبل إغلاق المهمة.`
          : (
            plotCountDrift.length > 0
              ? 'عدّادات blocks.plot_count لا تطابق عدد القطع الفعلي — أعد المزامنة بتعديل البلوك أو إكمال قطعه.'
              : 'بعض القطع المبيعة/التقسيط فيها (المدفوع + المتبقي) != القيمة — صحّح remaining_amount أو paid_amount.'
          )
      ),
  }
}