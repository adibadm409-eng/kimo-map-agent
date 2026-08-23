import { getDB } from './db'
import { genId } from './projects'
import { logChange } from './audit'

export type SpatialImportItem = { kind: 'waypoint' | 'area'; data: Record<string, any> }

export async function importSpatialItems(items: SpatialImportItem[]): Promise<{ waypoints: number; areas: number; skipped: number }> {
  const db = await getDB()
  const logs: { scope: 'waypoints' | 'areas'; id: string; data: Record<string, any>; summary: string }[] = []
  let waypoints = 0
  let areas = 0
  let skipped = 0

  await db.withTransactionAsync(async () => {
    for (const item of items) {
      const data = item?.data ?? {}
      const name = String(data.name ?? '').trim() || (item.kind === 'waypoint' ? 'نقطة مستوردة' : 'منطقة مستوردة')
      if (item.kind === 'waypoint') {
        const latitude = Number(data.latitude)
        const longitude = Number(data.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          throw new Error(`إحداثيات غير صالحة للنقطة «${name}». لم يُحفظ أي عنصر من عملية الاستيراد.`)
        }
        const duplicate = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM waypoints WHERE lower(trim(name)) = lower(trim(?)) AND abs(latitude - ?) < 0.000001 AND abs(longitude - ?) < 0.000001 LIMIT 1',
          [name, latitude, longitude]
        )
        if (duplicate) { skipped++; continue }
        const id = genId()
        await db.runAsync(
          `INSERT INTO waypoints (id,name,description,latitude,longitude,type,media,category,tags,rating,owner_name,owner_phone,owner_contact,property_details,area_sqm,price,listing_date,media_kind,media_count)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, name, String(data.description ?? ''), latitude, longitude, String(data.type ?? 'custom'), String(data.media ?? '[]'), String(data.category ?? 'general'), '[]', Number(data.rating) || 0, String(data.owner_name ?? ''), String(data.owner_phone ?? ''), String(data.owner_contact ?? ''), String(data.property_details ?? ''), Number(data.area_sqm) || 0, Number(data.price) || 0, String(data.listing_date ?? ''), String(data.media_kind ?? 'photo'), Number(data.media_count) || 0]
        )
        waypoints++
        logs.push({ scope: 'waypoints', id, data: { ...data, name, latitude, longitude }, summary: `استيراد نقطة «${name}»` })
      } else {
        const geojson = String(data.geojson ?? '').trim()
        if (!geojson) throw new Error(`المنطقة «${name}» لا تحتوي GeoJSON صالحاً. لم يُحفظ أي عنصر من عملية الاستيراد.`)
        const duplicate = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM areas WHERE lower(trim(name)) = lower(trim(?)) AND geojson = ? LIMIT 1',
          [name, geojson]
        )
        if (duplicate) { skipped++; continue }
        const id = genId()
        await db.runAsync(
          'INSERT INTO areas (id,name,description,geojson,area_sqm,perimeter_m,media,category,tags,rating) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [id, name, String(data.description ?? ''), geojson, Number(data.area_sqm) || 0, Number(data.perimeter_m) || 0, String(data.media ?? '[]'), String(data.category ?? 'general'), String(data.tags ?? '[]'), Number(data.rating) || 0]
        )
        areas++
        logs.push({ scope: 'areas', id, data: { ...data, name, geojson }, summary: `استيراد منطقة «${name}»` })
      }
    }
  })

  for (const entry of logs) {
    await logChange({ action: 'create', scope: entry.scope, scopeId: entry.id, after: entry.data, summary: entry.summary })
  }
  return { waypoints, areas, skipped }
}
