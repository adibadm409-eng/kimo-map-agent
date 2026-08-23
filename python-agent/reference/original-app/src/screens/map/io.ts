import * as FileSystem from "expo-file-system/legacy"

function fmtCoord(c: number): number {
  return Math.round(c * 1e6) / 1e6
}

export function waypointToGeoJSON(w: { id: string; name: string; latitude: number; longitude: number; description?: string }): any {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [fmtCoord(w.longitude), fmtCoord(w.latitude)] },
    properties: { id: w.id, name: w.name, description: w.description || "" }
  }
}

export function areaToGeoJSON(a: { id: string; name: string; geojson: string; area_sqm?: number; description?: string }): any {
  try {
    const g = JSON.parse(a.geojson)
    return { type: "Feature", geometry: g, properties: { id: a.id, name: a.name, area_sqm: a.area_sqm || 0, description: a.description || "" } }
  } catch {
    return null
  }
}

export function exportGeoJSON(items: { kind: "waypoint" | "area"; data: any }[]): string {
  return JSON.stringify({ type: "FeatureCollection", features: items.map((i) => i.kind === "waypoint" ? waypointToGeoJSON(i.data) : areaToGeoJSON(i.data)).filter(Boolean) }, null, 2)
}

export function exportKML(items: { kind: "waypoint" | "area"; data: any }[]): string {
  const placemarks = items.map((i, idx) => {
    if (i.kind === "waypoint") {
      return `<Placemark><name>${esc(i.data.name)}</name><Point><coordinates>${fmtCoord(i.data.longitude)},${fmtCoord(i.data.latitude)},0</coordinates></Point></Placemark>`
    }
    try {
      const g = JSON.parse(i.data.geojson)
      if (g.type === "Polygon" && g.coordinates[0]) {
        const ring = g.coordinates[0].map((c: number[]) => `${fmtCoord(c[0])},${fmtCoord(c[1])},0`).join(" ")
        return `<Placemark><name>${esc(i.data.name)}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`
      }
    } catch { /* no-op */ }
    return ""
  }).filter(Boolean).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Real Estate Export</name>${placemarks}</Document></kml>`
}

export function exportGPX(items: { kind: "waypoint" | "area"; data: any }[]): string {
  const wpts = items.filter((i) => i.kind === "waypoint").map((i) =>
    `<wpt lat="${fmtCoord(i.data.latitude)}" lon="${fmtCoord(i.data.longitude)}"><name>${esc(i.data.name)}</name></wpt>`
  ).join("\n")
  const trks = items.filter((i) => i.kind === "area").map((i) => {
    try {
      const g = JSON.parse(i.data.geojson)
      const ring = g.coordinates[0] || []
      const pts = ring.map((c: number[]) => `<trkpt lat="${fmtCoord(c[1])}" lon="${fmtCoord(c[0])}"></trkpt>`).join("\n")
      return `<trk><name>${esc(i.data.name)}</name><trkseg>${pts}</trkseg></trk>`
    } catch { return "" }
  }).filter(Boolean).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MyApp"><metadata><name>Real Estate Export</name></metadata>${wpts}\n${trks}</gpx>`
}

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function writeExportFile(name: string, content: string): Promise<string> {
  const path = `${FileSystem.documentDirectory || ""}${name}`
  await FileSystem.writeAsStringAsync(path, content, { encoding: "utf8" })
  return path
}

export function parseImportAny(text: string): { kind: "waypoint" | "area"; data: any }[] {
  const t = text.trim()
  if (t.startsWith("{") && t.includes("\"FeatureCollection\"")) {
    try {
      const j = JSON.parse(t)
      if (j.type !== "FeatureCollection" || !Array.isArray(j.features)) return []
      return j.features.map((f: any) => {
        if (!f?.geometry) return null
        if (f.geometry.type === "Point") {
          const [lng, lat] = f.geometry.coordinates
          return { kind: "waypoint" as const, data: { name: f.properties?.name || "نقطة مستوردة", latitude: lat, longitude: lng, description: f.properties?.description || "" } }
        }
        if (f.geometry.type === "Polygon") {
          return {
            kind: "area" as const,
            data: { name: f.properties?.name || "منطقة مستوردة", geojson: JSON.stringify(f.geometry), description: f.properties?.description || "" }
          }
        }
        return null
      }).filter(Boolean) as any
    } catch { return [] }
  }
  if (t.startsWith("<") && t.includes("<kml")) return parseKML(t)
  if (t.startsWith("<") && t.includes("<gpx")) return parseGPX(t)
  return []
}

function parseKML(xml: string): { kind: "waypoint" | "area"; data: any }[] {
  const out: { kind: "waypoint" | "area"; data: any }[] = []
  const re = /<Placemark>([\s\S]*?)<\/Placemark>/g
  let m
  while ((m = re.exec(xml))) {
    const blk = m[1]
    const name = (/<name>([\s\S]*?)<\/name>/.exec(blk) || [, ""])[1]
    const coord = (/<coordinates>([\s\S]*?)<\/coordinates>/.exec(blk) || [, ""])[1].trim()
    if (!coord) continue
    if (blk.includes("<Polygon>")) {
      const pts = coord.split(/\s+/).map((p) => p.split(",").map(Number))
      if (pts.length >= 3 && pts.every((p) => p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))) {
        out.push({ kind: "area", data: { name: name.trim() || "منطقة مستوردة", geojson: JSON.stringify({ type: "Polygon", coordinates: [pts.map(([lng, lat]) => [lng, lat])] }) } })
      }
    } else {
      const [lng, lat] = coord.split(",").map(Number)
      if (!isNaN(lng) && !isNaN(lat)) out.push({ kind: "waypoint", data: { name: name.trim() || "نقطة مستوردة", latitude: lat, longitude: lng } })
    }
  }
  return out
}

function parseGPX(xml: string): { kind: "waypoint" | "area"; data: any }[] {
  const out: { kind: "waypoint" | "area"; data: any }[] = []
  let m
  const wpt = /<wpt[^>]+lat="([^"]+)"\s+lon="([^"]+)"[\s\S]*?(?:<name>([\s\S]*?)<\/name>)?[\s\S]*?<\/wpt>/g
  while ((m = wpt.exec(xml))) {
    const name = ent((m[3] || "").trim()) || "نقطة مستوردة"
    out.push({ kind: "waypoint", data: { name, latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) } })
  }
  const trk = /<trk>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<trkseg>([\s\S]*?)<\/trkseg>[\s\S]*?<\/trk>/g
  while ((m = trk.exec(xml))) {
    const name = ent((m[1] || "").trim()) || "مسار مستورد"
    const seg = m[2]
    const pts: [number, number][] = []
    const rpt = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g
    let p
    while ((p = rpt.exec(seg))) pts.push([parseFloat(p[2]), parseFloat(p[1])])
    if (pts.length >= 3) {
      out.push({ kind: "area", data: { name, geojson: JSON.stringify({ type: "Polygon", coordinates: [pts] }) } })
    }
  }
  return out
}

function ent(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
