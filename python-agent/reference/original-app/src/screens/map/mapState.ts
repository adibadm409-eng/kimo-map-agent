import * as FileSystem from "expo-file-system/legacy"

const STATE_DIR = (FileSystem.documentDirectory || "") + "map/"
const STATE_FILE = STATE_DIR + "mapa_state_v1.json"

export type PersistedMapState = {
  region: {
    latitude: number
    longitude: number
    latitudeDelta: number
    longitudeDelta: number
  }
  mapType: "standard" | "satellite" | "terrain" | "3d" | "dark" | "hot" | "wikimedia" | "esri-clarity" | "sentinel2" | "usgs-imagery" | "gibs-marble" | "gibs-lights" | "latest" | "osm" | "carto-positron" | "carto-dark" | "carto-positron-nl" | "carto-dark-nl" | "carto-voyager-nl" | "esri-streets" | "sentinel2-2021"
  savedAt: string
}

export async function loadMapState(): Promise<PersistedMapState | null> {
  try {
    await FileSystem.makeDirectoryAsync(STATE_DIR, { intermediates: true }).catch(() => {})
    const info = await FileSystem.getInfoAsync(STATE_FILE)
    if (!info.exists) return null
    const raw = await FileSystem.readAsStringAsync(STATE_FILE, { encoding: "utf8" })
    return JSON.parse(raw) as PersistedMapState
  } catch {
    return null
  }
}

export async function saveMapState(state: PersistedMapState): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(STATE_DIR, { intermediates: true }).catch(() => {})
    await FileSystem.writeAsStringAsync(STATE_FILE, JSON.stringify(state), { encoding: "utf8" })
  } catch {}
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved = ""

export function scheduleSaveMapState(getState: () => PersistedMapState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const s = getState()
    try {
      await saveMapState(s)
      lastSaved = s.savedAt
    } catch {}
  }, 350)
}
