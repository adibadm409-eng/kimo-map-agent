import { agentCreate, agentUpdate, agentDelete, queryEntityById } from '../agent'
import { setCustomValue } from '../database/projects'
import {
  createWorkspace as createWsWorkspace,
  updateWorkspace as updateWsWorkspace,
  deleteWorkspace as deleteWsWorkspace,
  getWorkspace as getWsWorkspace,
  createTable as createWsTable,
  renameTable as renameWsTable,
  deleteTable as deleteWsTable,
  setTableColumns as setWsTableColumns,
  getTable as getWsTable,
  createRow as createWsRow,
  deleteRow as deleteWsRow,
  getRow as getWsRow,
  updateRow as updateWsRow,
  bulkInsertRows as bulkWsInsert,
} from '../database/workspace'
import { pushUndo, type UndoEntry } from './store'
import { parseToolArgs } from './llm'

/** توقيع مدمّج لاستدعاء الأداة للكشف عن التكرار المتنامي دون تقدم. */
export function toolSig(call: { name: string; arguments: any }): string {
  const args = parseToolArgs(call.arguments)
  const tool = call.name === 'execute' ? String(args.tool ?? 'execute') : call.name
  const inner = call.name === 'execute' ? (args.args ?? {}) : args
  let core = ''
  if (inner && typeof inner === 'object') {
    for (const k of ['id', 'entity', 'table_id', 'row_id', 'workspace_id', 'project_id', 'plot_id', 'block_id', 'name', 'query', 'search', 'buyer_query', 'sheet_id', 'agent_id']) {
      const v = inner[k]
      if (v != null) core += `${k}=${String(v).slice(0, 40)}|`
    }
  }
  return `${tool}#${core}`
}

export function stripBefore(data: any): any {
  if (!data || typeof data !== 'object') return {}
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id' || k === 'custom_values' || v == null) continue
    out[k] = v
  }
  return out
}

export async function captureBefore(entity: string, id: string): Promise<any> {
  try {
    return await queryEntityById(entity as any, id)
  } catch {
    return null
  }
}

/** التقاط الحالة السابقة قبل تنفيذ أداة قابلة للتراجع. */
export async function captureToolUndoBefore(tool: string, args: Record<string, any>): Promise<any> {
  try {
    if (tool === 'update' && args.entity && args.id) return await captureBefore(String(args.entity), String(args.id))
    if (tool === 'workspace_update' && args.id) return await getWsWorkspace(String(args.id))
    if (['workspace_rename_table', 'workspace_add_column', 'workspace_remove_column', 'workspace_rename_column', 'workspace_alter_column', 'workspace_add_columns'].includes(tool) && args.table_id) return await getWsTable(String(args.table_id))
    if (tool === 'workspace_update_row' && args.row_id) return await getWsRow(String(args.row_id))
  } catch {}
  return null
}

/** تسجيل سجل التراجع حسب نوع الأداة المنفّذة. الحالة السابقة يجب أن تكون ملتقطة قبل التنفيذ. */
export async function recordUndo(sessionId: string, tool: string, args: Record<string, any>, result: any, beforeOverride?: any): Promise<void> {
  try {
    if (tool === 'create' && result?.id) {
      const entityName = String(args.entity ?? '')
      await pushUndo({ sessionId, kind: 'create', entity: entityName, entityId: String(result.id), summary: `إنشاء ${entityName}` })
      if (Array.isArray(result.plot_ids) && result.plot_ids.length > 1) {
        for (const pid of result.plot_ids) {
          if (pid !== result.id) await pushUndo({ sessionId, kind: 'create', entity: 'plots', entityId: String(pid), summary: 'إنشاء قطعة (دفعة)' })
        }
      }
    } else if (tool === 'update' && args.entity && args.id) {
      const before = beforeOverride ?? await captureBefore(String(args.entity), String(args.id))
      const after = await captureBefore(String(args.entity), String(args.id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: String(args.entity), entityId: String(args.id), before, after, summary: `تعديل ${args.entity}/${args.id}` })
    } else if (tool === 'workspace_create' && result?.id) {
      await pushUndo({ sessionId, kind: 'create', entity: 'workspace', entityId: String(result.id), summary: `إنشاء مساحة عمل ${args.name}` })
    } else if (tool === 'workspace_add_table' && result?.id) {
      await pushUndo({ sessionId, kind: 'create', entity: 'workspace_table', entityId: String(result.id), summary: `جدول ${args.name}` })
    } else if (tool === 'workspace_add_row' && result?.id) {
      await pushUndo({ sessionId, kind: 'create', entity: 'workspace_row', entityId: String(result.id), summary: 'إضافة صف' })
    } else if (tool === 'workspace_import_rows' && Array.isArray(result?.row_ids)) {
      for (const rid of result.row_ids) {
        await pushUndo({ sessionId, kind: 'create', entity: 'workspace_row', entityId: String(rid), summary: 'استيراد صف' })
      }
    } else if (tool === 'import_project_file' && result?.workspaceId) {
      await pushUndo({ sessionId, kind: 'create', entity: 'workspace', entityId: String(result.workspaceId), summary: `استيراد مشروع ${result.workspaceName}` })
    } else if (tool === 'workspace_update' && args.id) {
      const before = beforeOverride ?? await getWsWorkspace(String(args.id))
      const after = await getWsWorkspace(String(args.id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: 'workspace', entityId: String(args.id), before, after, summary: 'تعديل مساحة العمل' })
    } else if (tool === 'workspace_rename_table' && args.table_id) {
      const before = beforeOverride ?? await getWsTable(String(args.table_id))
      const after = await getWsTable(String(args.table_id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: 'workspace_table', entityId: String(args.table_id), before, after, summary: 'إعادة تسمية جدول' })
    } else if ((tool === 'workspace_add_column' || tool === 'workspace_remove_column' || tool === 'workspace_rename_column') && args.table_id) {
      const before = beforeOverride ?? await getWsTable(String(args.table_id))
      const after = await getWsTable(String(args.table_id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: 'workspace_table', entityId: String(args.table_id), before, after, summary: `تعديل أعمدة (${tool})` })
    } else if (tool === 'workspace_alter_column' && args.table_id) {
      const before = beforeOverride ?? await getWsTable(String(args.table_id))
      const after = await getWsTable(String(args.table_id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: 'workspace_table', entityId: String(args.table_id), before, after, summary: `تعديل تعريف عمود (${tool})` })
    } else if (tool === 'workspace_add_columns' && args.table_id) {
      const before = beforeOverride ?? await getWsTable(String(args.table_id))
      const after = await getWsTable(String(args.table_id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: 'workspace_table', entityId: String(args.table_id), before, after, summary: 'إضافة أعمدة' })
    } else if (tool === 'workspace_update_row' && args.row_id) {
      const before = beforeOverride ?? await getWsRow(String(args.row_id))
      const after = await getWsRow(String(args.row_id))
      if (before) await pushUndo({ sessionId, kind: 'update', entity: 'workspace_row', entityId: String(args.row_id), before, after, summary: 'تعديل صف' })
    }
  } catch (error) {
    console.warn('[Undo] Failed to record undo entry:', error)
  }
}

function stableSnapshot(value: any): string {
  if (value == null) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableSnapshot).sort().join(',')}]`
  if (typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.keys(value).filter((key) => !['updated_at', 'updatedAt'].includes(key)).sort().map((key) => `${JSON.stringify(key)}:${stableSnapshot(value[key])}`).join(',')}}`
}

function assertUndoState(label: string, current: any, expected: any, expectedPresent: boolean): void {
  if (expectedPresent && !current) throw new Error(`تراجع متعارض: ${label} لم يعد موجوداً.`)
  if (!expectedPresent && current) throw new Error(`تراجع متعارض: يوجد سجل حالي بالمعرف نفسه (${label}). لن أستبدله.`)
  if (expectedPresent && expected && stableSnapshot(current) !== stableSnapshot(expected)) {
    throw new Error(`تراجع متعارض: تغيّرت بيانات ${label} بعد العملية. راجع السجل يدوياً قبل الاستعادة.`)
  }
}

const CUSTOM_ENTITY_MAP: Record<string, string> = {
  projects: 'project',
  blocks: 'block',
  plots: 'plot',
}

async function restoreCustomValues(entity: string, newId: string, before: any): Promise<void> {
  const entityType = CUSTOM_ENTITY_MAP[entity]
  if (!entityType || !before?.custom_values) return
  const values: Record<string, string> = before.custom_values
  for (const [fieldId, value] of Object.entries(values)) {
    try {
      await setCustomValue(entityType as any, newId, fieldId, String(value ?? ''))
    } catch {}
  }
}

export async function performUndo(entry: UndoEntry): Promise<string> {
  if (entry.entity === 'workspace') {
    const current = await getWsWorkspace(entry.entityId)
    if (entry.kind === 'create') {
      assertUndoState(`مساحة العمل ${entry.entityId}`, current, undefined, false)
      await deleteWsWorkspace(entry.entityId)
      return `أُلغي الإنشاء: حُذفت مساحة العمل (${entry.entityId})`
    }
    if (entry.kind === 'update') {
      if (!entry.before) return 'لا يمكن التراجع: لا توجد نسخة سابقة'
      assertUndoState(`مساحة العمل ${entry.entityId}`, current, entry.after, true)
      await updateWsWorkspace(entry.entityId, {
        name: entry.before.name ?? '',
        description: entry.before.description ?? '',
      })
      return 'استُعيدت بيانات مساحة العمل'
    }
    if (entry.before) {
      assertUndoState(`مساحة العمل ${entry.entityId}`, current, undefined, false)
      const b = entry.before
      const newId = await createWsWorkspace({
        name: b.name ?? 'مستعادة',
        description: b.description ?? '',
        origin: b.origin ?? 'manual',
        sourceFile: b.sourceFile ?? null,
      })
      for (const t of b.tables ?? []) {
        const cols = (t.columns ?? []).map((c: any) => ({ id: c.id, label: c.label, key: c.key, type: c.type ?? 'text', options: c.options }))
        const tableId = await createWsTable(newId, t.name ?? 'جدول', cols.map((c: any) => ({ label: c.label, key: c.key, type: c.type })) as any)
        const rows = ((t.rows ?? []) as any[]).map((r: any) => r.values ?? r)
        if (rows.length) await bulkWsInsert(tableId, rows)
      }
      return `استُعيدت مساحة العمل بمعرف جديد ${newId} بدلاً من ${entry.entityId} (${(b.tables ?? []).length} جدول)`
    }
    return 'لا يمكن استعادة مساحة العمل: لا توجد نسخة سابقة'
  }

  if (entry.entity === 'workspace_table') {
    const current = await getWsTable(entry.entityId)
    if (entry.kind === 'create') {
      assertUndoState(`الجدول ${entry.entityId}`, current, undefined, false)
      await deleteWsTable(entry.entityId)
      return `أُلغي الإنشاء: حُذف الجدول (${entry.entityId})`
    }
    if (entry.kind === 'update') {
      if (!entry.before) return 'لا يمكن التراجع: لا توجد نسخة سابقة'
      assertUndoState(`الجدول ${entry.entityId}`, current, entry.after, true)
      const b = entry.before
      await renameWsTable(entry.entityId, b.name ?? 'جدول')
      await setWsTableColumns(entry.entityId, (b.columns ?? []).map((c: any) => ({ id: c.id, label: c.label, key: c.key, type: c.type ?? 'text', options: c.options })))
      return 'استُعيد هيكل الجدول'
    }
    if (entry.before) {
      assertUndoState(`الجدول ${entry.entityId}`, current, undefined, false)
      const b = entry.before
      const cols = (b.columns ?? []).map((c: any) => ({ label: c.label, key: c.key, type: c.type ?? 'text' }))
      const tableId = await createWsTable(b.workspaceId ?? b.workspace_id ?? '', b.name ?? 'جدول', cols as any)
      const rows = ((b.rows ?? []) as any[]).map((r: any) => r.values ?? r)
      if (rows.length) await bulkWsInsert(tableId, rows)
      return `استُعيد الجدول بمعرف جديد ${tableId} بدلاً من ${entry.entityId} (${rows.length} صف)`
    }
    return 'لا يمكن استعادة الجدول: لا توجد نسخة سابقة'
  }

  if (entry.entity === 'workspace_row') {
    const current = await getWsRow(entry.entityId)
    if (entry.kind === 'create') {
      assertUndoState(`الصف ${entry.entityId}`, current, undefined, false)
      await deleteWsRow(entry.entityId)
      return 'أُلغي الإنشاء: تم حذف الصف'
    }
    if (entry.kind === 'update') {
      if (!entry.before) return 'لا يمكن التراجع: لا توجد نسخة سابقة'
      assertUndoState(`الصف ${entry.entityId}`, current, entry.after, true)
      await updateWsRow(entry.entityId, entry.before.values ?? {})
      return 'استُعيدت قيم الصف السابقة'
    }
    if (entry.before) {
      assertUndoState(`الصف ${entry.entityId}`, current, undefined, false)
      const b = entry.before
      const newId = await createWsRow(b.tableId, b.values ?? {})
      return `استُعيد الصف بمعرف جديد ${newId} بدلاً من ${entry.entityId}`
    }
    return 'لا يمكن استعادة الصف: لا توجد نسخة سابقة'
  }

  const current = await captureBefore(entry.entity, entry.entityId)
  if (entry.kind === 'create') {
    assertUndoState(`${entry.entity}/${entry.entityId}`, current, undefined, false)
    await agentDelete({ entity: entry.entity as any, id: entry.entityId })
    return `أُلغي الإنشاء: حُذف السجل ${entry.entity} (${entry.entityId})`
  }
  if (entry.kind === 'update') {
    if (!entry.before) return 'لا يمكن التراجع: لا توجد نسخة سابقة محفوظة'
    assertUndoState(`${entry.entity}/${entry.entityId}`, current, entry.after, true)
    const data = stripBefore(entry.before)
    if (!Object.keys(data).length) return 'لا يمكن التراجع: بيانات سابقة فارغة'
    await agentUpdate({ entity: entry.entity as any, id: entry.entityId, data })
    await restoreCustomValues(entry.entity, entry.entityId, entry.before)
    return `استُعيدت البيانات السابقة للسجل ${entry.entity} (${entry.entityId})`
  }
  if (entry.kind === 'delete') {
    if (!entry.before) return 'لا يمكن استعادة السجل: لا توجد نسخة سابقة محفوظة'
    assertUndoState(`${entry.entity}/${entry.entityId}`, current, undefined, false)
    const data = stripBefore(entry.before)
    const created = await agentCreate({ entity: entry.entity as any, data })
    await restoreCustomValues(entry.entity, created.id, entry.before)
    return `استُعيد السجل ${entry.entity} بمعرف جديد ${created.id} بدلاً من ${entry.entityId}. راجع الروابط يدوياً؛ الأقساط الفرعية المرتبطة لا تُستعاد تلقائياً.`
  }
  return 'إجراء تراجع غير معروف'
}