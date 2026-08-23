/**
 * Tile layer service.
 *
 * ملاحظة: صار المحرك يسحب البلاط مباشرة من المزود العام عبر https
 * (بلا خادم 127.0.0.1). ما زالت تُحفظ هذه الدوال للحِفظ الصوتي/الاستخدام
 * القديم كمستودع أنماط فقط؛ warmTiles أصبح no-op كاملاً (لا خادم ليودّي).
 */
import { VECTOR_STYLES, type VectorStyleKey } from "./vector/vectorStyles"

export const TILE_SERVER = "http://127.0.0.1:8383"

export type MapStyleKey =
  | "standard" | "satellite" | "terrain" | "dark" | "hot" | "wikimedia" | "3d"
  | "esri-clarity" | "sentinel2" | "usgs-imagery" | "gibs-marble" | "gibs-lights"
  | "latest" | "osm" | "carto-positron" | "carto-dark"
  | "carto-positron-nl" | "carto-dark-nl" | "carto-voyager-nl" | "esri-streets" | "sentinel2-2021"
export type MapStyle = MapStyleKey

export const MAP_STYLES: { key: MapStyleKey; label: string; icon: string }[] = [
  { key: "standard", label: "عادي", icon: "map-outline" },
  { key: "satellite", label: "قمر صناعي", icon: "globe-outline" },
  { key: "latest", label: "الأحدث", icon: "refresh-circle-outline" },
  { key: "terrain", label: "تضاريس", icon: "earth-outline" },
  { key: "3d", label: "ثلاثي الأبعاد", icon: "cube-outline" },
  { key: "dark", label: "داكن", icon: "moon-outline" },
  { key: "hot", label: "حراري", icon: "flame-outline" },
  { key: "wikimedia", label: "ويكي", icon: "library-outline" },
  { key: "osm", label: "شوارع OSM", icon: "map-outline" },
  { key: "carto-positron", label: "Positron", icon: "sunny-outline" },
  { key: "carto-dark", label: "داكن Carto", icon: "contrast-outline" },
  { key: "carto-positron-nl", label: "Positron بلا تسميات", icon: "sunny-outline" },
  { key: "carto-dark-nl", label: "Dark بلا تسميات", icon: "contrast-outline" },
  { key: "carto-voyager-nl", label: "Voyager بلا تسميات", icon: "map-outline" },
  { key: "esri-streets", label: "شوارع Esri", icon: "map-outline" },
  { key: "esri-clarity", label: "قمر واضح", icon: "aperture-outline" },
  { key: "sentinel2", label: "سينتينل-2", icon: "satellite-outline" },
  { key: "sentinel2-2021", label: "S2 نسخة 2021", icon: "time-outline" },
  { key: "usgs-imagery", label: "جوي أمريكي", icon: "airplane-outline" },
  { key: "gibs-marble", label: "الكرة الزرقاء", icon: "planet-outline" },
  { key: "gibs-lights", label: "أضواء الليل", icon: "moon-outline" },
]

/** UrlTemplate pointing at the local cache proxy. mode controls connectivity. */
export const tileTemplateUrl = (style: MapStyle, mode: "online" | "offline"): string =>
  `${TILE_SERVER}/tile/{z}/{x}/{y}.png?style=${style}&mode=${mode}`

/**
 * التواءم النقطي للأنماط المتجهية: المحرك الجديد (Leaflet المضمّن) يعمل
 * بالبلاط النقطي فقط — فأي نمط متجهي يُعرض عبر أخته النقطية من نفس المزود
 * عبر الوكيل المحلي (نفس الأسلوب اللوني تقريباً، لكن استقرار كامل وبلا
 * إنترنت). أنماط Carto المتجهية مصدرها الأساسي Carto raster أصلاً.
 * أي نمط متجهي غير مذكور → يقع على «عادي» المستقر دائماً.
 */
export function rasterTwin(style: string): string {
  const twins: Record<string, string> = {
    "ofm-positron": "carto-positron",
    "ofm-bright": "carto-positron",
    "ofm-liberty": "carto-positron",
    "ofm-dark": "carto-dark",
    "ofm-fiord": "carto-dark",
    "ofm-3d": "3d",
    "cgl-positron": "carto-positron",
    "cgl-voyager": "carto-voyager-nl",
    "cgl-dark": "carto-dark",
  }
  if (style in VECTOR_STYLES) return twins[style] || "standard"
  return style
}

export interface Region {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export interface WarmHandle {
  cancel: () => void
  done: Promise<boolean>
}

export function zoomForRegion(r: Region): number {
  const z = Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-8)))
  return Math.max(2, Math.min(19, z))
}

export function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z)
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
  return { x, y }
}

/**
 * Background warm-up — no-op تماماً اليوم: لا يوجد خادم محلي لملء الكاش،
 * والمحرك يسحب البلاط مباشرة. تُحفظ الواجهة حفاظاً على المتصلين.
 */
export function warmTiles(style: string, region: Region, radius = 2, online = true): WarmHandle {
  void style; void region; void radius; void online
  return { cancel: () => {}, done: Promise.resolve(false) }
}

function tileUrl(style: string, z: number, x: number, y: number, mode: "online" | "offline"): string {
  return `${TILE_SERVER}/tile/${z}/${x}/${y}.png?style=${style}&mode=${mode}`
}