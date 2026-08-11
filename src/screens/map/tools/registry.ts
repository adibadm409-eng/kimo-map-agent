import type { ToolDefinition, DrawMode } from "./types"
import { markerTool } from "./marker/tool"
import { polygonTool } from "./polygon/tool"
import { polylineTool } from "./polyline/tool"
import { measureTool } from "./measure/tool"
import { eraserTool } from "./eraser/tool"

export const TOOLS: ToolDefinition[] = [
  markerTool,
  measureTool,
  polygonTool,
  polylineTool,
  eraserTool,
]

export const TOOLS_BY_MODE: Record<DrawMode, ToolDefinition | null> = {
  none: null,
  marker: markerTool,
  polygon: polygonTool,
  polyline: polylineTool,
  measure: measureTool,
  eraser: eraserTool,
}

export function getTool(mode: DrawMode): ToolDefinition | null {
  return TOOLS_BY_MODE[mode]
}

export const TOOL_FAB_ITEMS: { mode: DrawMode; icon: string; label: string; color: string }[] = [
  { mode: "marker", icon: markerTool.icon, label: "علامة", color: markerTool.color },
  { mode: "measure", icon: measureTool.icon, label: "قياس", color: measureTool.color },
  { mode: "polygon", icon: polygonTool.icon, label: "مساحة", color: polygonTool.color },
  { mode: "polyline", icon: polylineTool.icon, label: "مسار", color: polylineTool.color },
  { mode: "eraser", icon: eraserTool.icon, label: "مسح", color: eraserTool.color },
]
