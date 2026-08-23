import * as FileSystem from "expo-file-system/legacy"

const SETTINGS_DIR = (FileSystem.documentDirectory || "") + "map/"
const SETTINGS_FILE = SETTINGS_DIR + "mapa_settings_v1.json"

export type AppSettings = {
  schemaVersion: number
  /** عند تفعيله: يُضاف رأس عند الضغط باللمس على الخريطة أثناء الرسم (مغلق افتراضياً لتجنب اللمسات غير المقصودة) */
  tapToAddDrawing: boolean
  /** وضع الاتصال: عند التشغيل تُحدَّث/تُحمَّل طبقات الخريطة من الخادم وتُحفَظ محلياً، وعند الإيقاف يُستعمل الكاش المحلي فقط */
  connectionOnline: boolean
  /** نوع الخريطة المحفوظ بشكل سريع وسلس */
  mapType: "standard" | "satellite" | "terrain" | "3d" | "dark" | "hot" | "wikimedia" | "esri-clarity" | "sentinel2" | "usgs-imagery" | "gibs-marble" | "gibs-lights" | "latest" | "osm" | "carto-positron" | "carto-dark" | "carto-positron-nl" | "carto-dark-nl" | "carto-voyager-nl" | "esri-streets" | "sentinel2-2021"
}

const DEFAULTS: AppSettings = {
  schemaVersion: 2,
  tapToAddDrawing: false,
  connectionOnline: true,
  mapType: "standard",
}

let cached: AppSettings | null = null

export function resetSettingsCache(): void {
  cached = null
}

export async function loadSettings(): Promise<AppSettings> {
  if (cached) return cached
  try {
    await FileSystem.makeDirectoryAsync(SETTINGS_DIR, { intermediates: true }).catch(() => {})
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE)
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(SETTINGS_FILE, { encoding: "utf8" })
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      // ترقية الإعدادات بسلاسة عند تغيير الإصدار
      const merged = { ...DEFAULTS, ...parsed }
      if (merged.schemaVersion !== DEFAULTS.schemaVersion) {
        merged.schemaVersion = DEFAULTS.schemaVersion
        merged.mapType = (merged.mapType as any) || DEFAULTS.mapType
      }
      cached = merged as AppSettings
      return cached
    }
  } catch {}
  cached = { ...DEFAULTS }
  return cached
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const cur = cached ?? (await loadSettings())
  cached = { ...cur, ...patch, schemaVersion: DEFAULTS.schemaVersion }
  try {
    await FileSystem.makeDirectoryAsync(SETTINGS_DIR, { intermediates: true }).catch(() => {})
    await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(cached), { encoding: "utf8" })
  } catch {}
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const s = await loadSettings()
  return s[key]
}
