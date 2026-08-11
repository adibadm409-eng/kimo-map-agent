import type { LatLng } from "../types"

export type DrawMode = "none" | "marker" | "polygon" | "polyline" | "measure" | "eraser"

export type ToolContext = {
  drawMode: DrawMode
  region: LatLng
  previewCenter: LatLng
  drawPts: LatLng[]
  colors: any
  insets: any
  spacing: any
  fontSize: any
  radius: any
}

export type PreviewRender = {
  polygon?: any
  polylines?: any[]
  markers?: any[]
}

export type ToolDefinition = {
  mode: DrawMode
  icon: string
  label: string
  shortLabel: string
  color: string
  hint: string
  minPoints: number
  needsSave: boolean

  previewPoints: (ctx: ToolContext) => any[]

  summarize: (pts: LatLng[]) => string

  canSave: (pts: LatLng[]) => boolean

  saveKind: "waypoint" | "area" | "linestring" | "measurement"
}
