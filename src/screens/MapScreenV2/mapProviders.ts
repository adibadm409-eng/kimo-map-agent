import * as FileSystem from "expo-file-system/legacy"
import type { MapTypeKey } from "./types"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

const FILE_DIR = (FileSystem.documentDirectory || "") + "map/"
const FILE = FILE_DIR + "mapa_provider_v1.json"

/**
 * حالة الخريطة في صفحة «مزوّدو الخرائط»:
 * - available : مفعّلة في التطبيق الآن (يمكن إخفاؤها/إظهارها من قائمة الخريطة).
 * - soon      : تقدمها المزوّد رسمياً لكن لم تُدمج بعد.
 * - vector    : خريطة متجهية تُرسم عبر محرك المتجهات (WebView/MapLibre).
 */
export type MapItemStatus = "available" | "soon" | "vector"

export interface MapItem {
  /** النمط المدمج في التطبيق (null = غير مدمج؛ يُعرض مع رمز الحالة فقط) */
  styleKey: (MapTypeKey & string) | string | null
  label: string
  icon: string
  /** وصف ظاهر عند زر المعلومات — كيف تبدو الخريطة وتعمل */
  info: string
  status: MapItemStatus
}

export interface MapProviderGroup {
  id: string
  name: string
  note: string
  free: boolean
  maps: MapItem[]
}

/**
 * الكتالوج الكامل لكل مزوّد: كل ما يقدمه المزوّد رسمياً —
 * حتى ما لم يُدمج بعد — ليطّلع المستخدم على «كيف تبدو» أي خريطة
 * ثم يختارها إن رغب.
 */
export const PROVIDER_GROUPS: MapProviderGroup[] = [
  {
    id: "google",
    name: "Google Maps",
    note: "مدمج في التطبيق بدون أي مفاتيح، ويعمل حالياً كما هو تماماً.",
    free: true,
    maps: [
      {
        styleKey: "satellite",
        label: "قمر صناعي",
        icon: "globe-outline",
        info: "صورة القمر الصناعي الأصلي من Google تعمل مباشرة في التطبيق بدون مفتاح وتُحدَّث باستمرار.",
        status: "available",
      },
      {
        styleKey: null,
        label: "قياسية (Standard)",
        icon: "map-outline",
        info: "الخريطة القياسية بأسماء الشوارع. في تطبيقنا تُعرض عبر نمط «عادي» من Carto مجاناً لتجنّب رسوم Google.",
        status: "soon",
      },
      {
        styleKey: null,
        label: "تضاريس (Terrain)",
        icon: "terrain-outline",
        info: "طبقة التضاريس من Google. غير مدمجة — نمط «تضاريس» الحالي محلي ومجاني من OpenTopoMap.",
        status: "soon",
      },
      {
        styleKey: null,
        label: "هجين (Hybrid)",
        icon: "layers-outline",
        info: "أسماء الشوارع فوق القمر — تتطلب مفتاح Google المدفوع، غير مدمجة.",
        status: "soon",
      },
    ],
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    note: "مشروع خريطة مفتوح بالكامل — بيانات من المتطوعين حول العالم.",
    free: true,
    maps: [
      { styleKey: "osm", label: "شوارع OSM", icon: "map-outline", info: "الشوارع الأصلية من OSM — اتجاه قياسي دقيق يُحدَّث من المتطوعين.", status: "available" },
      { styleKey: "hot", label: "إنساني (HOT)", icon: "hand-left-outline", info: "نمط Humanitarian بألوان عالية التباين لظروف الطوارئ.", status: "available" },
      { styleKey: "wikimedia", label: "ويكيمابيا (WikiMedia)", icon: "library-outline", info: "نفس بيانات OSM بأسلوب ويكيميديا — نصوص أكبر وألوان هادئة.", status: "available" },
      { styleKey: null, label: "CyclOSM (دراجات)", icon: "bicycle-outline", info: "خريطة الدراجات من خادم المجتمع — تعطل الوصول من شبكة الاختبار، تُدمج عند ثباتها.", status: "soon" },
      { styleKey: null, label: "Transport (نقل)", icon: "bus-outline", info: "نمط Thunderforest Transport يتطلب مفتاحاً — غير مدمج.", status: "soon" },
    ],
  },
  {
    id: "carto",
    name: "Carto Basemaps",
    note: "خريطة مجانية عالية الجودة من بيانات OpenStreetMap — شبيهة بأنماط OpenFreeMap.",
    free: true,
    maps: [
      { styleKey: "carto-positron", label: "Positron", icon: "sunny-outline", info: "خريطة فاتحة نظيفة بألوان رمادية — ممتازة لعرض البيانات فوقه.", status: "available" },
      { styleKey: "carto-dark", label: "Dark Matter", icon: "contrast-outline", info: "نسخة داكنة كاملة — مريحة ليلاً وجيدة لعروض الأراضي.", status: "available" },
      { styleKey: "standard", label: "Voyager (عادي)", icon: "map-outline", info: "الخريطة الافتراضية للتطبيق — ألوان لطيفة ووضوح للشوارع.", status: "available" },
      { styleKey: "carto-positron-nl", label: "Positron بلا تسميات", icon: "sunny-outline", info: "نفس Positron بدون أسماء شوارع (light_nolabels).", status: "available" },
      { styleKey: "carto-dark-nl", label: "Dark بلا تسميات", icon: "contrast-outline", info: "النسخة الداكنة بدون أسماء شوارع (dark_nolabels).", status: "available" },
      { styleKey: "carto-voyager-nl", label: "Voyager بلا تسميات", icon: "map-outline", info: "Voyager بدون أسماء شوارع (voyager_nolabels).", status: "available" },
      { styleKey: "cgl-positron", label: "Positron متجهي GL", icon: "sunny-outline", info: "نسخة متجهية (MapLibre) من Positron — تُرسم بالمحرك المتجهي (تتطلب إنترنت).", status: "available" },
      { styleKey: "cgl-voyager", label: "Voyager متجهي GL", icon: "map-outline", info: "نسخة متجهية من Voyager — تُرسم بالمحرك المتجهي (تتطلب إنترنت).", status: "available" },
      { styleKey: "cgl-dark", label: "Dark Matter GL", icon: "contrast-outline", info: "نسخة متجهية داكنة — تُرسم بالمحرك المتجهي (تتطلب إنترنت).", status: "available" },
    ],
  },
  {
    id: "openfreemap",
    name: "OpenFreeMap",
    note: "مزوّد مجاني بالكامل (بدون تسجيل) — يُرسل أنماطاً متجهية تُرسم بالمحرك المتجهي.",
    free: true,
    maps: [
      { styleKey: "ofm-positron", label: "Positron", icon: "sunny-outline", info: "بنفس روح Carto Positron — فاتح ونظيف (متجهية).", status: "available" },
      { styleKey: "ofm-bright", label: "Bright", icon: "flash-outline", info: "ألوان زاهية وواضحة مع تفاصيل دارس (متجهية).", status: "available" },
      { styleKey: "ofm-liberty", label: "Liberty", icon: "flag-outline", info: "تحديث عصري لـ Bright بألوان أكثر توازناً (متجهية).", status: "available" },
      { styleKey: "ofm-dark", label: "Dark", icon: "moon-outline", info: "خريطة داكنة كاملة للاستعمال الليلي (متجهية).", status: "available" },
      { styleKey: "ofm-fiord", label: "Fiord", icon: "water-outline", info: "ألوان زرقاء داكنة هادئة (متجهية).", status: "available" },
      { styleKey: "ofm-3d", label: "3D", icon: "cube-outline", info: "Liberty بزاوية إمالة وازاحة (pitch) — تضاريس ثلاثية الأبعاد (متجهية).", status: "available" },
    ],
  },
  {
    id: "opentopo",
    name: "OpenTopoMap",
    note: "تضاريسية بشبكة المنحنيات والارتفاع — مناسبة للعقارات والأراضي.",
    free: true,
    maps: [
      { styleKey: "terrain", label: "تضاريس", icon: "earth-outline", info: "منحنيات الكنتور والارتفاعات من OpenTopoMap مع الشوارع.", status: "available" },
      { styleKey: "3d", label: "ثلاثي الأبعاد", icon: "cube-outline", info: "تظليل تضاريس فضائي رمادي يُظهر العمق والميلان (Esri Terrain).", status: "available" },
    ],
  },
  {
    id: "esri",
    name: "Esri (ArcGIS)",
    note: "عائلة أقمار صناعية وتضاريس محترفة — تعمل كاملة بدون مفاتيح.",
    free: true,
    maps: [
      { styleKey: "satellite", label: "قمر صناعي", icon: "globe-outline", info: "World Imagery — تُحدَّث باستمرار من مصادر متعددة.", status: "available" },
      { styleKey: "latest", label: "الأحدث", icon: "refresh-circle-outline", info: "نفس صورة Esri لكن تُعاد فحوص مع 6 ساعات عند الاتصال — أقرب خانة للتحديثات.", status: "available" },
      { styleKey: "esri-clarity", label: "قمر واضح", icon: "aperture-outline", info: "نسخة Esri Clarity المعالجة — وضوح أعلى وتشبع محسن.", status: "available" },
      { styleKey: "dark", label: "داكن Esri", icon: "moon-outline", info: "Canvas داكن رمادي — خفيف للقراءة فوق طبقات العمل.", status: "available" },
      { styleKey: "esri-streets", label: "شوارع Esri", icon: "map-outline", info: "خريطة الشوارع الرسمية من Esri (World Street Map) — بدون مفتاح.", status: "available" },
    ],
  },
  {
    id: "eox",
    name: "Sentinel-2 (EOX)",
    note: "فسيفساء وكالة الفضاء الأوروبية من قمر Sentinel-2 — بدون غيوم.",
    free: true,
    maps: [
      { styleKey: "sentinel2", label: "سينتينل-2", icon: "satellite-outline", info: "الفسيفساء الحالية بدون غيوم — دقة ~10م، مثالية للأراضي الحديثة.", status: "available" },
      { styleKey: "sentinel2-2021", label: "S2 نسخة 2021", icon: "time-outline", info: "النسخة السابقة من نفس الفسيفساء — للتغييرات زمنية قديمة.", status: "available" },
    ],
  },
  {
    id: "usgs",
    name: "USGS National Map",
    note: "التصوير الجوي الرسمي للولايات المتحدة — تغطية شاملة.",
    free: true,
    maps: [
      { styleKey: "usgs-imagery", label: "جوي أمريكي", icon: "airplane-outline", info: "التصوير الجوي الرسمي من USGS — عالي الدقة داخل أمريكا.", status: "available" },
      { styleKey: null, label: "USGS Topo", icon: "layers-outline", info: "الخرائط الطوبوغرافية الأمريكية — خدمة تم إيقافها (404).", status: "soon" },
    ],
  },
  {
    id: "nasa",
    name: "NASA GIBS",
    note: "مصورات فضائية من ناسا — تدعم حتى مستوى التكبير 8.",
    free: true,
    maps: [
      { styleKey: "gibs-marble", label: "الكرة الزرقاء", icon: "planet-outline", info: "Blue Marble — تجميع الصور الطبيعية بألوانها.", status: "available" },
      { styleKey: "gibs-lights", label: "أضواء الليل", icon: "moon-outline", info: "VIIRS City Lights — أضواء المدن ليلاً؛ رائعة للكثافة.", status: "available" },
    ],
  },
]

export interface ProviderSettings {
  /** مفاتيح المستخدم الشخصية للمزوّدات التي تتطلب مفاتيح (لا تُرسل لأي خادم خارجي) */
  keys: Record<string, string>
  /** الأنماط المخفية من قائمة المصدر (مع كل المصادر ظاهرة افتراضياً) */
  hidden: string[]
}

const DEFAULTS: ProviderSettings = { keys: {}, hidden: [] }

let cache: ProviderSettings | null = null
const MAP_SECRET_PREFIX = 'property-manager.map-secret.'

async function readMapKeys(legacy: Record<string, string>): Promise<Record<string, string>> {
  if (Platform.OS === 'web') return legacy ?? {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(legacy ?? {})) {
    try {
      const secureKey = `${MAP_SECRET_PREFIX}${encodeURIComponent(key)}`
      const stored = await SecureStore.getItemAsync(secureKey)
      if (stored) out[key] = stored
      else if (value) {
        await SecureStore.setItemAsync(secureKey, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
        out[key] = value
      }
    } catch {
      if (value) out[key] = value
    }
  }
  return out
}

async function persistMapKeys(keys: Record<string, string>): Promise<Record<string, string>> {
  if (Platform.OS === 'web') return keys ?? {}
  for (const [key, value] of Object.entries(keys ?? {})) {
    try {
      const secureKey = `${MAP_SECRET_PREFIX}${encodeURIComponent(key)}`
      if (value) await SecureStore.setItemAsync(secureKey, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
      else await SecureStore.deleteItemAsync(secureKey)
    } catch {}
  }
  return {}
}

export function resetProviderSettingsCache(): void {
  cache = null
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  if (cache) return cache
  try {
    await FileSystem.makeDirectoryAsync(FILE_DIR, { intermediates: true }).catch(() => {})
    const info = await FileSystem.getInfoAsync(FILE)
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(FILE, { encoding: "utf8" })
      const parsed = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ProviderSettings>) }
      const keys = await readMapKeys(parsed.keys ?? {})
      cache = { ...parsed, keys }
      if (Platform.OS !== 'web' && Object.keys(parsed.keys ?? {}).length > 0) {
        await FileSystem.writeAsStringAsync(FILE, JSON.stringify({ ...cache, keys: {} }), { encoding: "utf8" }).catch(() => {})
      }
      return cache
    }
  } catch {}
  cache = { ...DEFAULTS }
  return cache
}

export async function saveProviderSettings(patch: Partial<ProviderSettings>): Promise<ProviderSettings> {
  const cur = cache ?? (await loadProviderSettings())
  cache = { ...cur, ...patch }
  const storedKeys = await persistMapKeys(cache.keys ?? {})
  const fileState = { ...cache, keys: storedKeys }
  try {
    await FileSystem.makeDirectoryAsync(FILE_DIR, { intermediates: true }).catch(() => {})
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(fileState), { encoding: "utf8" })
  } catch {}
  return cache
}

/** هل النمط مفعّل (غير مخفي) في قائمة الخرائط؟ */
export async function isStyleVisible(style: string): Promise<boolean> {
  const s = await loadProviderSettings()
  return !s.hidden.includes(style)
}

export async function toggleStyleHidden(style: string): Promise<boolean> {
  const s = await loadProviderSettings()
  const hidden = s.hidden.includes(style)
    ? s.hidden.filter((x) => x !== style)
    : [...s.hidden, style]
  await saveProviderSettings({ hidden })
  return !hidden
}