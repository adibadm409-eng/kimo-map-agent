export type LatLng = { latitude: number; longitude: number }

export type MapTypeKey =
  | "standard" | "satellite" | "terrain" | "dark" | "hot" | "wikimedia" | "3d"
  | "esri-clarity" | "sentinel2" | "usgs-imagery" | "gibs-marble" | "gibs-lights"
  | "latest" | "osm" | "carto-positron" | "carto-dark"
  | "carto-positron-nl" | "carto-dark-nl" | "carto-voyager-nl" | "esri-streets" | "sentinel2-2021"

export type ToolId = "marker" | "measure" | "polygon" | "polyline" | "eraser"

export type DetailItem =
  | { kind: "property"; id: string; name: string; data: any }
  | { kind: "waypoint"; id: string; name: string; data: any }
  | { kind: "area"; id: string; name: string; data: any }
  | null

export type LayerVis = {
  properties: boolean
  waypoints: boolean
  areas: boolean
  tracks: boolean
}

export type PropFilter = {
  status: string
  type: string
  priceMax: number
}

export type MeasureSummary = {
  points: number
  distance: number
  display: string
}

export type WaypointForm = {
  name: string
  description: string
  category: string
  rating: number
  ownerName: string
  ownerPhone: string
  ownerContact: string
  details: string
  area: string
  price: string
  listingDate: string
  mediaKind: "photo" | "video" | "both"
  mediaUris: string[]
}

export type AreaForm = {
  name: string
  description: string
  category: string
  rating: number
}

export type SaveTarget = "area" | "property" | "attach" | null

export type BottomPanel =
  | "layers"
  | "mapType"
  | "spatial"
  | "waypoint-list"
  | null

export type ToolMeta = {
  id: ToolId
  icon: string
  label: string
  color: string
  hint: string
}
