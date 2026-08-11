import type { LatLng } from "../../types"
import type { ToolDefinition, ToolContext } from "../types"

export const eraserTool: ToolDefinition = {
  mode: "eraser",
  icon: "trash-outline",
  label: "ممحاة",
  shortLabel: "مسح",
  color: "#F59E0B",
  hint: "اضغط مطولاً على أي علامة قريبة لحذفها",
  minPoints: 0,
  needsSave: false,

  previewPoints: (_ctx: ToolContext) => [],

  summarize: (_pts: LatLng[]) => "",

  canSave: (_pts: LatLng[]) => false,
  saveKind: "waypoint",
}
