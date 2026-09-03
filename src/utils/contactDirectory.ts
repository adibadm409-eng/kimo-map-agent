import { getAllClients, getAllProperties } from '../database/db'

export type ContactSource = 'client' | 'owner' | 'broker'

export interface DirectoryContact {
  name: string
  phone: string
  source: ContactSource
  refId: string
  refLabel: string
}

export interface GroupedIdentity {
  key: string
  name: string
  phone: string
  sources: ContactSource[]
  contacts: DirectoryContact[]
  count: number
}

export function normalizeName(v: unknown): string {
  return String(v ?? '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizePhone(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.replace(/^0+/, '')
}

export function identityKey(name: string, phone: string): string {
  const p = normalizePhone(phone)
  if (p) return `p:${p}`
  return `n:${normalizeName(name)}`
}

function pushUnique(list: DirectoryContact[], c: DirectoryContact): void {
  if (!c.name.trim() && !c.phone.trim()) return
  if (list.some((x) => x.source === c.source && x.refId === c.refId && x.name === c.name && x.phone === c.phone)) return
  list.push(c)
}

/** الدليل الموحد: العملاء + ملاك العقارات + دلالو العقارات — كأنهم محفوظون في مكان واحد. */
export async function buildContactDirectory(): Promise<DirectoryContact[]> {
  const out: DirectoryContact[] = []
  try {
    const [clients, properties] = await Promise.all([getAllClients().catch(() => []), getAllProperties().catch(() => [])])
    for (const c of clients as any[]) {
      pushUnique(out, { name: String(c.name ?? ''), phone: String(c.phone ?? ''), source: 'client', refId: String(c.id), refLabel: 'عميل' })
    }
    for (const p of properties as any[]) {
      const label = String(p.name ?? 'عقار')
      pushUnique(out, { name: String(p.owner_name ?? ''), phone: String(p.owner_phone ?? ''), source: 'owner', refId: String(p.id), refLabel: `مالك • ${label}` })
      pushUnique(out, { name: String(p.broker_name ?? ''), phone: String(p.broker_phone ?? ''), source: 'broker', refId: String(p.id), refLabel: `دلال • ${label}` })
    }
  } catch {}
  return out
}

/** مطابقة حية مع كل حرف: بالاسم أو الرقم، الأقرب أولاً، بحد أقصى limit. */
export function matchContacts(directory: DirectoryContact[], query: string, limit = 6): DirectoryContact[] {
  const q = query.trim()
  if (q.length < 1) return []
  const qDigits = q.replace(/\D/g, '')
  const usePhone = qDigits.length >= 2 && qDigits.length >= q.replace(/\s/g, '').length / 2
  const nq = normalizeName(q)
  const scored: { c: DirectoryContact; score: number }[] = []
  for (const c of directory) {
    if (usePhone) {
      const p = normalizePhone(c.phone)
      if (!p) continue
      const idx = p.indexOf(normalizePhone(qDigits))
      if (idx < 0) continue
      scored.push({ c, score: idx === 0 ? 0 : 1 })
    } else {
      if (nq.length < 1) continue
      const nn = normalizeName(c.name)
      if (!nn) continue
      const idx = nn.indexOf(nq)
      if (idx < 0) continue
      scored.push({ c, score: idx === 0 ? 0 : 1 })
    }
  }
  scored.sort((a, b) => a.score - b.score)
  const seen = new Set<string>()
  const result: DirectoryContact[] = []
  for (const { c } of scored) {
    const k = identityKey(c.name, c.phone)
    if (seen.has(k)) continue
    seen.add(k)
    result.push(c)
    if (result.length >= limit) break
  }
  return result
}

/** تجميع التسجيلات لكل شخص (بالهاتف أو الاسم أو كليهما) مع مصادرها. */
export function groupIdentities(contacts: DirectoryContact[]): GroupedIdentity[] {
  const map = new Map<string, GroupedIdentity>()
  for (const c of contacts) {
    const key = identityKey(c.name, c.phone)
    let g = map.get(key)
    if (!g) {
      g = { key, name: c.name, phone: c.phone, sources: [], contacts: [], count: 0 }
      map.set(key, g)
    }
    if (c.name.trim() && (!g.name.trim() || g.name.trim().length < c.name.trim().length)) g.name = c.name
    if (c.phone.trim() && !g.phone.trim()) g.phone = c.phone
    if (!g.sources.includes(c.source)) g.sources.push(c.source)
    g.contacts.push(c)
    g.count = g.contacts.length
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export const SOURCE_LABELS: Record<ContactSource, string> = {
  client: 'عميل',
  owner: 'مالك عقار',
  broker: 'دلال',
}
