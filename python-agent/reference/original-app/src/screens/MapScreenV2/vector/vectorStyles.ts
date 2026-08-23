/**
 * مسجّل أنماط المتجهات — قائمة بيضاء آمنة.
 *
 * المحرك المتجهي (VectorEngine) لا يقبل أي عنوان من المستخدم؛ كل نمط يُعرَّف
 * هنا بمفتاح ثابت + عنوان Style-JSON رسمي موثّق (فحص يدوي: 200 + CORS) +
 * إعدادات إمالة اختيارية (3D). إضافة أي مزوّد متجهي جديد = سطر واحد هنا فقط.
 */
export type VectorStyleKey =
  | "ofm-positron" | "ofm-bright" | "ofm-liberty" | "ofm-dark" | "ofm-fiord" | "ofm-3d"
  | "cgl-positron" | "cgl-voyager" | "cgl-dark"

export interface VectorStyleDef {
  label: string
  icon: string
  /** عنوان Style-JSON متجهي يُرسل إلى محرك MapLibre GL (مسار white-list فقط) */
  url: string
  /** إمالة ثلاثية الأبعاد (pitch) عند التحميل — للأنماط التي تدعمها */
  pitch?: number
  bearing?: number
  /** المحرك المتجهي يتطلب اتصالاً (لا يوجد كاش محلي للطوب المتجهي) */
  onlineOnly: true
}

export const VECTOR_STYLES: Record<VectorStyleKey, VectorStyleDef> = {
  // ── OpenFreeMap — التصنيفات الرسمية كاملة ────────────────────────────────
  "ofm-positron": { url: "https://tiles.openfreemap.org/styles/positron", label: "Positron", icon: "sunny-outline", onlineOnly: true },
  "ofm-bright": { url: "https://tiles.openfreemap.org/styles/bright", label: "Bright", icon: "flash-outline", onlineOnly: true },
  "ofm-liberty": { url: "https://tiles.openfreemap.org/styles/liberty", label: "Liberty", icon: "flag-outline", onlineOnly: true },
  "ofm-dark": { url: "https://tiles.openfreemap.org/styles/dark", label: "Dark", icon: "moon-outline", onlineOnly: true },
  "ofm-fiord": { url: "https://tiles.openfreemap.org/styles/fiord", label: "Fiord", icon: "water-outline", onlineOnly: true },
  "ofm-3d": { url: "https://tiles.openfreemap.org/styles/liberty", label: "3D", icon: "cube-outline", pitch: 55, bearing: 0, onlineOnly: true },
  // ── Carto GL — أنماط متجهية رسمية من نفس البنية ذاتها ────────────────────
  "cgl-positron": { url: "https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/style.json", label: "Positron GL", icon: "sunny-outline", onlineOnly: true },
  "cgl-voyager": { url: "https://tiles.basemaps.cartocdn.com/gl/voyager-gl-style/style.json", label: "Voyager GL", icon: "map-outline", onlineOnly: true },
  "cgl-dark": { url: "https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", label: "Dark Matter GL", icon: "contrast-outline", onlineOnly: true },
}

export function isVectorStyle(style: string): style is VectorStyleKey {
  return style in VECTOR_STYLES
}

/** نطاقات CSP المسموح بها للمحرك المتجهي — من قائمة الأنماط فوق حصراً */
export function vectorCspHosts(): string[] {
  const out = new Set<string>()
  for (const def of Object.values(VECTOR_STYLES)) {
    try {
      const u = new URL(def.url)
      out.add(u.hostname)
    } catch { /* تجاهل */ }
  }
  return [...out]
}