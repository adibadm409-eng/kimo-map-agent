export type MapLayer = "osm" | "satellite" | "dark" | "topo"

export const MAP_LAYERS = [
  { key: "osm", label: "عادي", icon: "map" },
  { key: "satellite", label: "قمر صناعي", icon: "globe" },
  { key: "dark", label: "داكن", icon: "moon" },
  { key: "topo", label: "طبوغرافي", icon: "trail-sign" },
]

export function markerColor(s: string): string {
  const c: Record<string, string> = {
    for_sale: "#2563EB",
    sold: "#DC2626",
    rented: "#D97706",
    pending: "#16A34A",
  }
  return c[s] || "#64748B"
}
