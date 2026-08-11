import type { LatLng } from "../../types"
import type { ToolDefinition, ToolContext } from "../types"

export const markerTool: ToolDefinition = {
  mode: "marker",
  icon: "pin",
  label: "علامة",
  shortLabel: "علامة",
  color: "#EF4444",
  hint: "ضع علامة على المركز ثم احفظها كنقطة اهتمام",
  minPoints: 1,
  needsSave: true,

  previewPoints: (ctx: ToolContext) => {
    return [
      {
        kind: "marker",
        coord: ctx.previewCenter,
        anchor: { x: 0.5, y: 0.5 },
        view: { type: "previewPin", color: "#EF4444" },
        color: "#EF4444",
        pointerEvents: "none",
      },
    ]
  },

  summarize: (_pts: LatLng[]) => "",

  canSave: (_pts: LatLng[]) => true,
  saveKind: "waypoint",
}
