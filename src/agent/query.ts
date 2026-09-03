import * as SQLite from 'expo-sqlite'
import { getDB } from '../database/db'
import {
  ENTITY_LABELS,
  getEntityDef,
  type EntityKey,
  type EntityDef,
} from './catalog'

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'not_empty'

export interface FilterCond {
  field: string
  op?: FilterOp
  value?: SQLite.SQLiteBindValue | SQLite.SQLiteBindValue[]
  value2?: SQLite.SQLiteBindValue
}

export interface SortSpec {
  field: string
  dir?: 'asc' | 'desc'
}

export interface QuerySpec {
  entity: EntityKey
  search?: string
  filters?: FilterCond[]
  sort?: SortSpec
  limit?: number
  offset?: number
  withCustomValues?: boolean
}

export interface QueryResult {
  entity: EntityKey
  entity_label: string
  total: number
  page_size: number
  page_items: number
  rows: Record<string, any>[]
}

export function decodeOperator(op?: string): FilterOp {
  const valid: FilterOp[] = [
    'eq', 'neq', 'contains', 'starts_with', 'ends_with',
    'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in',
    'is_empty', 'not_empty',
  ]
  if (!op) return 'eq'
  if (!valid.includes(op as FilterOp)) throw new Error(`عامل تصفية غير معروف: ${op}. استخدم واحداً من: ${valid.join('، ')}.`)
  return op as FilterOp
}

function buildWhere(entity: EntityDef, spec: QuerySpec): { where: string; params: SQLite.SQLiteBindValue[] } {
  const clauses: string[] = []
  const params: SQLite.SQLiteBindValue[] = []

  if (spec.filters && spec.filters.length) {
    for (const c of spec.filters) {
      const fieldDef = entity.fields.filter((x) => x.name === c.field)[0]
      if (!fieldDef || !fieldDef.filterable) continue
      const op = decodeOperator(c.op)
      const col = `e.${c.field}`
      switch (op) {
        case 'between': {
          clauses.push(`${col} >= ? AND ${col} <= ?`)
          const v1 = c.value ?? 0
          const v2 = c.value2 == null ? v1 : c.value2
          params.push(v1 as SQLite.SQLiteBindValue)
          params.push(v2 as SQLite.SQLiteBindValue)
          break
        }
        case 'contains': {
          clauses.push(`${col} LIKE ?`)
          params.push(`%${c.value ?? ''}%`)
          break
        }
        case 'starts_with': {
          clauses.push(`${col} LIKE ?`)
          params.push(`${c.value ?? ''}%`)
          break
        }
        case 'ends_with': {
          clauses.push(`${col} LIKE ?`)
          params.push(`%${c.value ?? ''}`)
          break
        }
        case 'in':
        case 'not_in': {
          const arr = (Array.isArray(c.value) ? c.value : [c.value]) as SQLite.SQLiteBindValue[]
          const placeholders = arr.map(() => '?').join(',')
          clauses.push(`${col} ${op === 'in' ? 'IN' : 'NOT IN'} (${placeholders})`)
          params.push(...arr)
          break
        }
        case 'is_empty': {
          clauses.push(`(${col} IS NULL OR ${col} = '')`)
          break
        }
        case 'not_empty': {
          clauses.push(`(${col} IS NOT NULL AND ${col} != '')`)
          break
        }
        case 'eq':
        case 'neq':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
          const opSql = op === 'eq' ? '=' : op === 'neq' ? '!=' : op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : '<='
          clauses.push(`${col} ${opSql} ?`)
          params.push(c.value == null ? '' : (c.value as SQLite.SQLiteBindValue))
          break
        }
      }
    }
  }

  if (spec.search && spec.search.trim()) {
    const like = `%${spec.search.trim()}%`
    const searchable = entity.fields.filter((x) => x.searchable)
    if (searchable.length) {
      const parts = searchable.map((x) => `e.${x.name} LIKE ?`)
      for (let i = 0; i < searchable.length; i++) params.push(like)
      clauses.push(`(${parts.join(' OR ')})`)
    }
    if (entity.namesJoin?.search) {
      clauses.push(entity.namesJoin.search.sql)
      for (let i = 0; i < entity.namesJoin.search.paramCount; i++) params.push(like)
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return { where, params }
}

function buildOrder(entity: EntityDef, spec: QuerySpec): string {
  if (!spec.sort) return ` ORDER BY e.created_at DESC`
  const fieldDef = entity.fields.filter((x) => x.name === spec.sort?.field)[0]
  if (!fieldDef || !fieldDef.sortable) return ` ORDER BY e.created_at DESC`
  const dir = spec.sort.dir === 'asc' ? 'ASC' : 'DESC'
  return ` ORDER BY e.${fieldDef.name} ${dir}`
}

async function attachCustomValues(
  entity: EntityDef,
  rows: Record<string, any>[]
): Promise<Record<string, any>[]> {
  if (!entity.customFieldEntities || rows.length === 0) return rows
  const db = await getDB()
  const ids = rows.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  // الحقول المخصصة تُخزَّن بنوع الكيان المفرد (project/block/plot) بينما مفتاح الكتالوج جمع (projects/...)
  const valueType = ({ projects: 'project', blocks: 'block', plots: 'plot' } as Record<string, string>)[entity.key] ?? entity.key
  const values = await db.getAllAsync<any>(
    `SELECT field_id, entity_id, value FROM custom_field_values
     WHERE entity_type = ? AND entity_id IN (${placeholders})`,
    [valueType, ...ids]
  )
  const fields = await db.getAllAsync<any>(
    `SELECT f.id, f.label, f.value_type FROM custom_fields f WHERE f.entity_type = ?`,
    [valueType]
  )
  const fieldLabelById = new Map<string, string>()
  for (const f of fields) fieldLabelById.set(f.id, f.label)
  const grouped = new Map<string, Record<string, any>>()
  for (const v of values) {
    const bucket = grouped.get(v.entity_id) ?? {}
    const label = fieldLabelById.get(v.field_id) ?? v.field_id
    bucket[label] = v.value
    grouped.set(v.entity_id, bucket)
  }
  return rows.map((r) => ({ ...r, custom_values: grouped.get(r.id) ?? {} }))
}

export async function queryEntities(spec: QuerySpec): Promise<QueryResult> {
  const entity = getEntityDef(spec.entity)
  if (!entity) throw new Error(`Unknown entity: ${spec.entity}`)
  const db = await getDB()
  const { where, params } = buildWhere(entity, spec)
  const url = `${buildOrder(entity, spec)}`
  const countRow = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${entity.table} e ${entity.namesJoin?.join ?? ''} ${where}`,
    params
  )
  const total = countRow?.c ?? 0
  const safeLimit = spec.limit && spec.limit > 0 ? Math.min(spec.limit, 2000) : 2000
  const offset = spec.offset && spec.offset > 0 ? spec.offset : 0
  let raw = await db.getAllAsync<any>(
    `SELECT e.* ${entity.namesJoin?.select ?? ''} FROM ${entity.table} e ${entity.namesJoin?.join ?? ''} ${where}${url} LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  )
  raw = await attachCustomValues(entity, raw)
  return {
    entity: entity.key,
    entity_label: ENTITY_LABELS[entity.key],
    total,
    page_size: safeLimit,
    page_items: raw.length,
    rows: raw,
  }
}

export async function queryEntityById(
  entityKey: EntityKey,
  id: string,
  withCustomValues = true
): Promise<Record<string, any> | null> {
  const entity = getEntityDef(entityKey)
  if (!entity) throw new Error(`Unknown entity: ${entityKey}`)
  // لا نمر عبر buildWhere لأن حقل id غير قابل للتصفية في الكتالوج — نستعلم بالمعرف مباشرة
  const db = await getDB()
  const raw = await db.getFirstAsync<any>(
    `SELECT e.* ${entity.namesJoin?.select ?? ''} FROM ${entity.table} e ${entity.namesJoin?.join ?? ''} WHERE e.id = ? LIMIT 1`,
    [id]
  )
  if (!raw) return null
  const rows = await attachCustomValues(entity, [raw])
  return rows[0] ?? null
}