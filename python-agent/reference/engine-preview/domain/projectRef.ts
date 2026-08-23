import { getDB } from '../database/db'

export async function resolveProjectRef(projectRef: string): Promise<string> {
  const ref = String(projectRef ?? '').trim()
  if (!ref) throw new Error('مرجع المشروع مطلوب: استخدم الاسم أو المعرف.')

  const db = await getDB()
  const byId = await db.getFirstAsync<{ id: string }>('SELECT id FROM projects WHERE id = ?', [ref])
  if (byId?.id) return byId.id

  const rows = await db.getAllAsync<{ id: string; name: string }>(
    `SELECT id, name FROM projects
     WHERE lower(trim(name)) = lower(trim(?))
        OR lower(name) LIKE lower(?)
     ORDER BY created_at DESC
     LIMIT 20`,
    [ref, `%${ref}%`],
  )
  const exact = rows.filter((row) => String(row.name ?? '').trim().toLowerCase() === ref.toLowerCase())
  if (exact.length === 1) return exact[0].id
  if (exact.length > 1) throw new Error(`اسم المشروع «${ref}» يطابق أكثر من مشروع؛ حدّد المشروع بدقة.`)
  if (rows.length === 1) return rows[0].id
  if (rows.length > 1) throw new Error(`مرجع المشروع «${ref}» غير حاسم؛ توجد عدة مطابقة.`)
  throw new Error(`المشروع «${ref}» غير موجود.`)
}

export async function resolvePlotRef(plotRef: string, projectRef?: string): Promise<string> {
  const ref = String(plotRef ?? '').trim()
  if (!ref) throw new Error('مرجع القطعة مطلوب: استخدم رقمها أو معرفها.')
  const db = await getDB()
  const projectId = projectRef ? await resolveProjectRef(projectRef) : undefined
  const rows = await db.getAllAsync<{ id: string; plot_no: string }>(
    `SELECT p.id, p.plot_no
       FROM plots p
       LEFT JOIN blocks b ON b.id = p.block_id
      WHERE (p.id = ? OR lower(trim(p.plot_no)) = lower(trim(?)))
        ${projectId ? 'AND b.project_id = ?' : ''}
      ORDER BY p.created_at DESC
      LIMIT 20`,
    projectId ? [ref, ref, projectId] : [ref, ref],
  )
  if (rows.length === 1) return rows[0].id
  if (rows.length > 1) throw new Error(`مرجع القطعة «${ref}» غير حاسم؛ حدّد المشروع أو القطعة بدقة.`)
  throw new Error(`القطعة «${ref}» غير موجودة.`)
}
