import { getDB } from '../database/db'
import {
  createProperty,
  getAllProperties,
  updateProperty,
  deleteProperty,
  createClient,
  getAllClients,
  updateClient,
  deleteClient,
  deleteOffer,
  updateOffer,
  deleteCampaign,
  deleteViewing,
  createWaypoint,
  updateWaypoint,
  deleteWaypoint,
  createArea,
  updateArea,
  deleteArea,
} from '../database/db'
import {
  createProject,
  updateProject,
  deleteProject,
  createBlock,
  updateBlock,
  deleteBlock,
  createPlotSlot,
  savePlot,
  deletePlot,
  recordPayment,
  deletePayment,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  setCustomValue,
  genId,
} from '../database/projects'
import { getEntityDef, type EntityKey } from './catalog'
import { queryEntityById } from './query'
import { logChange } from '../database/audit'

export type CreateSpec = { entity: EntityKey; data: Record<string, any> }
export type UpdateSpec = { entity: EntityKey; id: string; data: Record<string, any> }
export type DeleteSpec = { entity: EntityKey; id: string }

function assertExistingRecord(entity: EntityKey, id: string): Promise<Record<string, any>> {
  return queryEntityById(entity, String(id)).then((row) => {
    if (!row) throw new Error(`السجل ${entity} بالمعرف ${id} غير موجود؛ لم تتم أي كتابة.`)
    return row as Record<string, any>
  })
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('ar')
}

async function findNaturalDuplicate(entity: EntityKey, data: Record<string, any>): Promise<string | null> {
  if (entity === 'properties') {
    const name = normalized(data.name)
    const address = normalized(data.address)
    const ownerPhone = normalized(data.owner_phone)
    if (!name && !ownerPhone) return null
    const rows = await getAllProperties()
    const found = rows.find((row: any) => {
      const samePhone = ownerPhone && normalized(row.owner_phone) === ownerPhone
      const sameIdentity = name && normalized(row.name) === name && (!address || normalized(row.address) === address)
      return samePhone || sameIdentity
    })
    return found?.id ? String(found.id) : null
  }
  if (entity === 'clients') {
    const phone = normalized(data.phone)
    const name = normalized(data.name)
    if (!phone && !name) return null
    const rows = await getAllClients()
    const found = rows.find((row: any) => (phone && normalized(row.phone) === phone) || (name && normalized(row.name) === name && normalized(row.email) === normalized(data.email)))
    return found?.id ? String(found.id) : null
  }
  return null
}

function pickData(fields: { name: string }[], data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const fieldName of Object.keys(data ?? {})) {
    if (fields.some((x) => x.name === fieldName)) {
      out[fieldName] = data[fieldName]
    }
  }
  return out
}

function normalizePropertyPatch(data: Record<string, any>): Record<string, any> {
  const out = { ...data }
  if (out.area == null && out.area_sqm != null) out.area = out.area_sqm
  if (out.area_sqm == null && out.area != null) out.area_sqm = out.area
  return out
}

function assertKnownPatchFields(entity: EntityKey, fields: { name: string }[], data: Record<string, any>): void {
  const allowed = new Set(fields.map((field) => field.name))
  const unknown = Object.keys(data ?? {}).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`حقول غير معروفة في ${entity}: ${unknown.join('، ')}. لم تتم أي كتابة.`)
}

function assertNonEmptyPatch(entity: string, data: Record<string, any>): void {
  if (!data || Object.keys(data).length === 0) throw new Error(`لا توجد حقول صالحة لتعديل ${entity}. لم يتم تنفيذ أي تغيير.`)
}

function num(v: any, dflt = 0): number {
  if (v == null || v === '') return dflt
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : dflt
}

function str(v: any, dflt = ''): string {
  if (v == null) return dflt
  return String(v)
}

async function findExistingPlotInBlock(blockId: string, plotNo?: string): Promise<{ id: string } | null> {
  const db = await getDB()
  const conditions = ['block_id = ?']
  const params: any[] = [blockId]
  if (plotNo) { conditions.push('plot_no = ?'); params.push(plotNo) }
  const row = await db.getFirstAsync<{ id: string }>(`SELECT id FROM plots WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`, params)
  return row ? { id: row.id } : null
}

/** تطبيع حقول قطعة قادمة من الوكيل: يربط الأسماء العربية/المختصرة بالحقول الفعلية ويترجم الحالة. */
export function normalizePlotFields(p: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  if (p && typeof p === 'object') {
    for (const [k, v] of Object.entries(p)) {
      if (v == null) continue
      const key = (normalizePlotField as Record<string, string>)[k] ?? k
      out[key] = v
    }
  }
  if (out.status != null) {
    const s = String(out.status)
    if (s === 'متاحة' || s === 'متاح' || s === 'available' || s === 'Available' || s === 'متوفرة') out.status = 'available'
    else if (s === 'مبيعة' || s === 'مباعة' || s === 'sold' || s === 'Sold') out.status = 'sold'
    else if (s === 'تقسيط' || s === 'installment') out.status = 'installment'
  }
  return out
}

const normalizePlotField: Record<string, string> = {
  name: 'plot_no',
  no: 'plot_no',
  number: 'plot_no',
  رقم: 'plot_no',
  اسم: 'plot_no',
  area: 'area_sqm',
  size: 'area_sqm',
  area_m2: 'area_sqm',
  مساحة: 'area_sqm',
  price: 'value',
  cost: 'value',
  سعر: 'value',
  السعر: 'value',
  buyer: 'buyer_name',
  client: 'buyer_name',
  phone: 'buyer_contact',
  buyer_phone: 'buyer_contact',
  مشتري: 'buyer_name',
  هاتف: 'buyer_contact',
  boundary_n: 'boundary_north',
  boundary_s: 'boundary_south',
  boundary_e: 'boundary_east',
  boundary_w: 'boundary_west',
  شمال: 'boundary_north',
  جنوب: 'boundary_south',
  شرق: 'boundary_east',
  غرب: 'boundary_west',
  status: 'status',
  حالة: 'status',
}

/** تجهيز حقل تعديل القطعة: يُدرج القيم المقدَّمة فقط دون تصفير غير المذكور. */
function plotPatch(p: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  if (p.plot_no != null && p.plot_no !== '') out.plot_no = str(p.plot_no)
  if (p.area_sqm != null && p.area_sqm !== '') out.area_sqm = num(p.area_sqm)
  if (p.status) out.status = p.status
  if (p.boundary_north != null) out.boundary_north = str(p.boundary_north)
  if (p.boundary_south != null) out.boundary_south = str(p.boundary_south)
  if (p.boundary_east != null) out.boundary_east = str(p.boundary_east)
  if (p.boundary_west != null) out.boundary_west = str(p.boundary_west)
  if (p.value != null && p.value !== '') out.value = num(p.value)
  if (p.buyer_name) out.buyer_name = str(p.buyer_name)
  if (p.buyer_contact) out.buyer_contact = str(p.buyer_contact)
  if (p.sale_date) out.sale_date = str(p.sale_date)
  if (p.installment_type) out.installment_type = p.installment_type
  if (p.paid_amount != null && p.paid_amount !== '') out.paid_amount = num(p.paid_amount)
  if (p.remaining_amount != null && p.remaining_amount !== '') out.remaining_amount = num(p.remaining_amount)
  return out
}

/** إنشاء أو تحديث قطعة داخل بلوك: إن وُجدت بنفس الرقم تُحدَّث، وإلا تُنشأ (يُكمل عدد القطع). */
async function upsertPlot(blockId: string, p: Record<string, any>): Promise<string> {
  const norm = normalizePlotFields(p)
  // إكمال المتبقي تلقائياً إن لم يُذكر: القيمة ناقص المدفوع (العدّادات تُبنى عليه)
  if ((norm.remaining_amount == null || norm.remaining_amount === '') && norm.value != null && norm.value !== '' && norm.paid_amount != null && norm.paid_amount !== '') {
    norm.remaining_amount = Math.max(0, num(norm.value) - num(norm.paid_amount))
  }
  const plotNo = norm.plot_no != null ? str(norm.plot_no) : ''
  const existing = plotNo ? await findExistingPlotInBlock(blockId, plotNo) : null
  const id = existing ? existing.id : await createPlotSlot(blockId, plotNo || undefined)
  await savePlot(id, plotPatch(norm))
  return id
}

export async function agentCreate(spec: CreateSpec): Promise<{ id: string; plot_ids?: string[]; duplicate?: boolean }> {
  const entity = getEntityDef(spec.entity)
  if (!entity) throw new Error(`Unknown entity: ${spec.entity}`)
  const d = pickData(entity.fields, spec.data)
  const naturalDuplicate = await findNaturalDuplicate(spec.entity, d)
  if (naturalDuplicate && (spec.entity === 'properties' || spec.entity === 'clients')) return { id: naturalDuplicate, duplicate: true }

  switch (spec.entity) {
    case 'properties':
      return { id: await createProperty(d as any) }
    case 'clients':
      return { id: await createClient(d as any) }
    case 'offers':
      return { id: await dbOfferCreate(d) }
    case 'campaigns':
      return { id: await dbCampaignCreate(d) }
    case 'viewings':
      return { id: await dbViewingCreate(d) }
    case 'waypoints':
      return { id: await createWaypoint(d as any) }
    case 'areas':
      return { id: await createArea(d as any) }
    case 'projects':
      return { id: await createProject(str(d.name, ''), str(d.description)) }
    case 'blocks':
      if (!d.project_id) throw new Error('project_id (معرف المشروع) مطلوب لإضافة بلوك داخل المشروع. أنشئ المشروع أولاً بـ create على الكيان projects، أو اجلب معرفه بـ query على الكيان projects.')
      {
        const bulkPlots = Array.isArray(spec.data.plots) ? spec.data.plots : []
        const blockId = await createBlock({
          project_id: str(d.project_id),
          name: str(d.name, ''),
          plot_count: num(d.plot_count, 0),
          notes: str(d.notes),
          skipSlots: bulkPlots.length > 0,
        })
        // إنشاء القطع فوراً داخل البلوك في نفس الاستدعاء: data.plots = [{plot_no, area_sqm, value...}, ...]
        const plotIds: string[] = []
        for (const p of bulkPlots) {
          const specP = p && typeof p === 'object' ? { ...d, ...p } : { ...d, plot_no: p }
          plotIds.push(await upsertPlot(blockId, specP))
        }
        return plotIds.length ? { id: blockId, plot_ids: plotIds } : { id: blockId }
      }
    case 'plots':
      if (!d.block_id) throw new Error('block_id (معرف البلوك) مطلوب لإضافة قطعة داخل البلوك. أنشئ البلوك أولاً بـ create على الكيان blocks، أو اجلب معرفه بـ query على الكيان blocks.')
      {
        const blockId = str(d.block_id)
        // إنشاء عدة قطع دفعة واحدة: data.plots = [{plot_no, area_sqm, value...}, ...]
        const bulkPlots = Array.isArray(spec.data.plots) && spec.data.plots.length ? spec.data.plots : null
        if (bulkPlots) {
          const plotIds: string[] = []
          for (const p of bulkPlots) {
            const specP = p && typeof p === 'object' ? { ...d, ...p } : { ...d, plot_no: p }
            plotIds.push(await upsertPlot(blockId, specP))
          }
          return { id: plotIds[0], plot_ids: plotIds }
        }
        return { id: await upsertPlot(blockId, d) }
      }
    case 'plot_payments':
      throw new Error('إنشاء سجل plot_payments الخام محظور؛ استخدم ledger_record_payment حتى تُحدّث القطعة والدفتر معاً.')
    case 'custom_fields':
      return { id: await createCustomField({
        entity_type: (d.entity_type || 'plot') as any,
        label: str(d.label, ''),
        value_type: (d.value_type || 'text') as any,
        options: str(d.options),
      }) }
    case 'custom_field_values':
      return { id: await dbCustomValueUpsert(d) }
    default:
      throw new Error(`Unsupported entity: ${spec.entity}`)
  }
}

export async function agentUpdate(spec: UpdateSpec): Promise<{ id: string; changedFields: string[] }> {
  const entity = getEntityDef(spec.entity)
  if (!entity) throw new Error(`Unknown entity: ${spec.entity}`)
  const before = await assertExistingRecord(spec.entity, spec.id)
  assertKnownPatchFields(spec.entity, entity.fields, spec.data)
  const picked = pickData(entity.fields, spec.data)
  const d = spec.entity === 'properties' ? normalizePropertyPatch(picked) : picked
  const changedFields = Object.keys(d).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(d[key]))
  if (changedFields.length === 0) throw new Error(`لا توجد تغييرات فعلية في ${spec.entity} بالمعرف ${spec.id}. لم تتم أي كتابة.`)

  switch (spec.entity) {
    case 'properties':
      assertNonEmptyPatch(spec.entity, d)
      await updateProperty(spec.id, d as any)
      return { id: spec.id, changedFields }
    case 'clients':
      assertNonEmptyPatch(spec.entity, d)
      await updateClient(spec.id, d as any)
      return { id: spec.id, changedFields }
    case 'offers':
      assertNonEmptyPatch(spec.entity, d)
      await updateOffer(spec.id, d as any)
      return { id: spec.id, changedFields }
    case 'waypoints':
      assertNonEmptyPatch(spec.entity, d)
      await updateWaypoint(spec.id, d as any)
      return { id: spec.id, changedFields }
    case 'areas':
      assertNonEmptyPatch(spec.entity, d)
      await updateArea(spec.id, d as any)
      return { id: spec.id, changedFields }
    case 'projects': {
      const projectPatch: { name?: string; description?: string } = {}
      if (Object.prototype.hasOwnProperty.call(d, 'name')) projectPatch.name = str(d.name)
      if (Object.prototype.hasOwnProperty.call(d, 'description')) projectPatch.description = str(d.description)
      assertNonEmptyPatch(spec.entity, projectPatch)
      await updateProject(spec.id, projectPatch)
      return { id: spec.id, changedFields }
    }
    case 'blocks':
      {
        assertNonEmptyPatch(spec.entity, d)
        const blockPatch: { name?: string; plot_count?: number; notes?: string } = {}
        if (d.name != null && d.name !== '') blockPatch.name = str(d.name)
        if (d.plot_count != null && d.plot_count !== '') blockPatch.plot_count = num(d.plot_count)
        if (d.notes != null) blockPatch.notes = str(d.notes)
        await updateBlock(spec.id, blockPatch)
      }
      return { id: spec.id, changedFields }
    case 'plots': {
      const normalized = normalizePlotFields(d)
      if (Object.prototype.hasOwnProperty.call(normalized, 'paid_amount') || Object.prototype.hasOwnProperty.call(normalized, 'remaining_amount')) {
        throw new Error('لا تعدل المجاميع المالية للقطعة مباشرة؛ استخدم دفتر النقد لتسجيل دفعة أو عكسها.')
      }
      const patch = plotPatch(normalized)
      assertNonEmptyPatch(spec.entity, patch)
      await savePlot(spec.id, patch as any)
      return { id: spec.id, changedFields }
    }
    case 'custom_fields':
      assertNonEmptyPatch(spec.entity, d)
      await updateCustomField(spec.id, d as any)
      return { id: spec.id, changedFields }
    case 'custom_field_values':
      await dbCustomValueUpsert(d)
      return { id: str(d.id) || spec.id, changedFields }
    default:
      await dbGenericUpdate(spec.entity, spec.id, d)
      return { id: spec.id, changedFields }
  }
}

export async function agentDelete(spec: DeleteSpec): Promise<{ deleted: boolean }> {
  switch (spec.entity) {
    case 'properties':
      await deleteProperty(spec.id)
      return { deleted: true }
    case 'clients':
      await deleteClient(spec.id)
      return { deleted: true }
    case 'offers':
      await deleteOffer(spec.id)
      return { deleted: true }
    case 'campaigns':
      await deleteCampaign(spec.id)
      return { deleted: true }
    case 'viewings':
      await deleteViewing(spec.id)
      return { deleted: true }
    case 'waypoints':
      await deleteWaypoint(spec.id)
      return { deleted: true }
    case 'areas':
      await deleteArea(spec.id)
      return { deleted: true }
    case 'projects':
      await deleteProject(spec.id)
      return { deleted: true }
    case 'blocks':
      await deleteBlock(spec.id)
      return { deleted: true }
    case 'plots':
      await deletePlot(spec.id)
      return { deleted: true }
    case 'plot_payments':
      {
        const db = await getDB()
        const row = await db.getFirstAsync<{ plot_id: string }>(
          'SELECT plot_id FROM plot_payments WHERE id = ?', [spec.id]
        )
        if (row) await deletePayment(spec.id, row.plot_id)
      }
      return { deleted: true }
    case 'custom_fields':
      await deleteCustomField(spec.id)
      return { deleted: true }
    case 'custom_field_values':
      {
        const db = await getDB()
        await db.runAsync('DELETE FROM custom_field_values WHERE id = ?', [spec.id])
      }
      return { deleted: true }
    default:
      throw new Error(`Unsupported entity: ${spec.entity}`)
  }
}

async function dbOfferCreate(d: Record<string, any>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO offers (id,property_id,client_id,type,amount,status,date,notes) VALUES (?,?,?,?,?,?,?,?)',
    [id, d.property_id ? str(d.property_id) : null, str(d.client_id), str(d.type, 'buy_offer'), num(d.amount), str(d.status, 'pending'), str(d.date), str(d.notes)]
  )
  return id
}

async function dbCampaignCreate(d: Record<string, any>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO campaigns (id,name,description,type,status,budget,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, str(d.name, ''), str(d.description), str(d.type, 'social_media'), str(d.status, 'draft'), num(d.budget), str(d.start_date), str(d.end_date), str(d.notes)]
  )
  return id
}

async function dbViewingCreate(d: Record<string, any>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO viewings (id,property_id,client_id,date_time,status,notes) VALUES (?,?,?,?,?,?)',
    [id, str(d.property_id), str(d.client_id), str(d.date_time, new Date().toISOString()), str(d.status, 'scheduled'), str(d.notes)]
  )
  return id
}

async function dbGenericUpdate(entityKey: EntityKey, id: string, d: Record<string, any>): Promise<{ id: string }> {
  const entity = getEntityDef(entityKey)
  if (!entity) throw new Error(`Unknown entity: ${entityKey}`)
  const db = await getDB()
  const before = await db.getFirstAsync<Record<string, any>>(`SELECT * FROM ${entity.table} WHERE id = ?`, [id])
  if (!before) throw new Error(`السجل (${id}) غير موجود في ${entityKey}.`)
  const keys = Object.keys(d)
  if (keys.length === 0) throw new Error(`لا توجد حقول صالحة لتعديل ${entityKey}.`)
  const allowed = new Set(entity.fields.map((field) => field.name))
  const unknown = keys.filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`حقول غير معروفة في ${entityKey}: ${unknown.join('، ')}`)
  const sets = keys.map((k) => `${k} = ?`)
  await db.runAsync(
    `UPDATE ${entity.table} SET ${sets.join(', ')} WHERE id = ?`,
    [...keys.map((k) => d[k]), id]
  )
  await logChange({ action: 'update', scope: entityKey, scopeId: id, before, after: d, summary: `تعديل ${entity.label ?? entityKey} (${id})` })
  return { id }
}

async function dbCustomValueUpsert(d: Record<string, any>): Promise<string> {
  const entityType = (d.entity_type || 'plot') as any
  const entityId = str(d.entity_id)
  const fieldId = str(d.field_id)
  if (!entityId || !fieldId) throw new Error('entity_id and field_id are required')
  return await setCustomValue(entityType, entityId, fieldId, str(d.value))
}