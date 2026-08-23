import { haversineCalc, fmtDistCalc, bearingDir } from "./utils"

type LatLng = { latitude: number; longitude: number }

export function calcBearing(a: LatLng, b: LatLng): number {
  const dLon = (b.longitude - a.longitude) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(b.latitude * Math.PI / 180)
  const x = Math.cos(a.latitude * Math.PI / 180) * Math.sin(b.latitude * Math.PI / 180) -
    Math.sin(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function polygonArea(coords: LatLng[]): number {
  if (coords.length < 3) return 0
  // Gaussian-area للإحداثيات الجغرافية بالدرجات
  let a = 0
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length
    // نستخدم formula shoelace على (lon، lat)
    a += coords[i].longitude * coords[j].latitude
    a -= coords[j].longitude * coords[i].latitude
  }
  // النتيجة بالدرجات^2 — نحولها لمتر^2 باستخدام تعديل كروي:
  // area_m² = 0.5 * |a| * (π/180)² * R² * cos(lat_avg)
  const avgLat = coords.reduce((s, c) => s + c.latitude, 0) / coords.length
  const deg = Math.abs(a) / 2
  const R = 6378137
  const m2PerDeg2 = (Math.PI / 180) ** 2 * R * R * Math.cos((avgLat * Math.PI) / 180)
  return deg * m2PerDeg2
}

export function polylineLength(coords: LatLng[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineCalc(coords[i - 1].latitude, coords[i - 1].longitude, coords[i].latitude, coords[i].longitude)
  }
  return total
}

export function centroid(coords: LatLng[]): LatLng {
  if (coords.length === 0) return { latitude: 0, longitude: 0 }
  let lat = 0, lng = 0
  for (const c of coords) { lat += c.latitude; lng += c.longitude }
  return { latitude: lat / coords.length, longitude: lng / coords.length }
}

export type MeasureSummary = {
  points: number
  totalDistance: number
  segmentDistance: number
  bearing: number
  area: number
  perimeter: number
  display: string
}

export function summarizeMeasure(pts: LatLng[]): MeasureSummary {
  const n = pts.length
  if (n < 2) {
    return { points: n, totalDistance: 0, segmentDistance: 0, bearing: 0, area: 0, perimeter: 0, display: "" }
  }
  const total = polylineLength(pts)
  const last = pts[n - 1]
  const prev = pts[n - 2]
  const seg = haversineCalc(prev.latitude, prev.longitude, last.latitude, last.longitude)
  const b = calcBearing(prev, last)
  let area = 0
  let perimeter = 0
  if (n >= 3) {
    area = polygonArea([...pts, pts[0]])
    perimeter = polylineLength([...pts, pts[0]])
  }
  const parts: string[] = [`${fmtDistCalc(total)} (${n} نقطة)`]
  if (n >= 2) parts.push(`المقطع: ${fmtDistCalc(seg)} · ${b.toFixed(0)}° ${bearingDir(b)}`)
  if (n >= 3) parts.push(`المساحة: ${(area / 10000).toFixed(2)} هكتار · المحيط: ${fmtDistCalc(perimeter)}`)
  return { points: n, totalDistance: total, segmentDistance: seg, bearing: b, area, perimeter, display: parts.join(" · ") }
}

export function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].latitude, yi = poly[i].longitude
    const xj = poly[j].latitude, yj = poly[j].longitude
    const intersect = ((yi > pt.longitude) !== (yj > pt.longitude)) &&
      (pt.latitude < (xj - xi) * (pt.longitude - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function nearestItems<T extends { latitude: number; longitude: number }>(from: LatLng, list: T[], max = 3): { item: T; dist: number }[] {
  const withD = list.map((item) => ({ item, dist: haversineCalc(from.latitude, from.longitude, item.latitude, item.longitude) }))
  withD.sort((a, b) => a.dist - b.dist)
  return withD.slice(0, max)
}
