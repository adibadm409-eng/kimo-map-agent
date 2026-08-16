import { getAllProperties } from '../database/db'

export type PropertyIntakeMode = 'create' | 'update' | 'ambiguous'

export interface PropertyChangePreview {
  mode: PropertyIntakeMode
  confidence: number
  candidates: Array<{ id: string; name: string; score: number; reasons: string[] }>
  changes: Record<string, { before: unknown; after: unknown }>
  attachmentIds: string[]
  explanation: string
}

const MATCH_FIELDS = ['name', 'owner_phone', 'broker_phone', 'address', 'description'] as const
const CHANGE_FIELDS = ['name', 'description', 'price', 'area', 'latitude', 'longitude', 'address', 'status', 'type', 'owner_name', 'owner_phone', 'owner_email', 'broker_name', 'broker_phone', 'icon_uri', 'media', 'category', 'area_sqm'] as const

function clean(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('ar')
}

function scoreCandidate(input: Record<string, any>, row: Record<string, any>): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  if (input.id && String(input.id) === String(row.id)) {
    return { score: 1, reasons: ['معرف العقار مطابق بشكل صريح'] }
  }
  for (const field of MATCH_FIELDS) {
    const left = clean(input[field])
    const right = clean(row[field])
    if (!left || !right) continue
    if (left === right) {
      score += field === 'name' ? 0.65 : field.includes('phone') ? 0.55 : 0.4
      reasons.push(`تطابق ${field}`)
    } else if (field === 'name' && (left.includes(right) || right.includes(left))) {
      score += 0.3
      reasons.push('تشابه اسم العقار')
    }
  }
  return { score: Math.min(0.98, score), reasons }
}

export async function previewPropertyChange(input: { data: Record<string, any>; attachmentIds?: string[] }): Promise<PropertyChangePreview> {
  const data = input.data && typeof input.data === 'object' ? input.data : {}
  const properties = await getAllProperties()
  const ranked = properties
    .map((row) => ({ row, ...scoreCandidate(data, row) }))
    .filter((candidate) => candidate.score >= 0.3)
    .sort((a, b) => b.score - a.score)

  const top = ranked[0]
  const second = ranked[1]
  const attachmentIds = Array.isArray(input.attachmentIds) ? input.attachmentIds.map(String).filter(Boolean) : []
  if (!top) {
    return {
      mode: 'create',
      confidence: 0.86,
      candidates: [],
      changes: {},
      attachmentIds,
      explanation: 'لم يظهر عقار محلي مطابق بما يكفي؛ يمكن إنشاء سجل جديد بعد اكتمال الحقول الأساسية ومراجعة الوسائط.',
    }
  }
  const isAmbiguous = top.score < 0.85 && !!second && top.score - second.score < 0.18
  const candidates = ranked.slice(0, 5).map(({ row, score, reasons }) => ({ id: String(row.id), name: String(row.name ?? ''), score, reasons }))
  if (isAmbiguous) {
    return {
      mode: 'ambiguous',
      confidence: top.score,
      candidates,
      changes: {},
      attachmentIds,
      explanation: 'وجدت أكثر من عقار محتمل؛ يجب أن يحدد المستخدم العقار قبل التعديل أو ربط الوسائط.',
    }
  }

  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const field of CHANGE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue
    const after = data[field]
    const before = (top.row as any)[field]
    if (String(before ?? '') !== String(after ?? '')) changes[field] = { before, after }
  }
  return {
    mode: 'update',
    confidence: top.score,
    candidates,
    changes,
    attachmentIds,
    explanation: `العقار «${String(top.row.name ?? '')}» هو المطابقة الأقوى؛ راجع التغييرات قبل اعتمادها.`,
  }
}
