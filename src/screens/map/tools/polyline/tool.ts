import type { LatLng } from "../../types"
import { polylineLength } from "../../measure"
import { fmtDistCalc } from "../../utils"
import type { ToolDefinition, ToolContext } from "../types"

export const polylineTool: ToolDefinition = {
  mode: "polyline",
  icon: "git-branch-outline",
  label: "مسار",
  shortLabel: "مسار",
  color: "#16A34A",
  hint: "ارسم مساراً متعدد الفقرات — يقيس الطول التراكمي",
  minPoints: 2,
  needsSave: true,

  previewPoints: (ctx: ToolContext) => {
    const out: any[] = []
    const c = ctx.previewCenter
    if (ctx.drawPts.length >= 2) {
      out.push({ kind: "polyline", coords: ctx.drawPts, color: "#16A34A", width: 3 })
    }
    if (ctx.drawPts.length >= 1) {
      out.push({ kind: "polyline", coords: [...ctx.drawPts, c], color: "rgba(22,163,74,0.5)", width: 1.5, dash: [4, 4] })
    }
    if (ctx.drawPts.length >= 1) {
      out.push({
        kind: "bubble",
        coord: c,
        anchor: { x: 0.5, y: 0.5 },
        color: "#16A34A",
        lines: [`مقطع: ${fmtDistCalc(polylineLength([...ctx.drawPts, c]))}`,
          ctx.drawPts.length >= 2 ? `الإجمالي: ${fmtDistCalc(polylineLength(ctx.drawPts))}` : null].filter(Boolean),
        pointerEvents: "none",
      })
    }
    return out
  },

  summarize: (pts: LatLng[]) => {
    if (pts.length < 2) return ""
    return `${fmtDistCalc(polylineLength(pts))} · ${pts.length} نقطة`
  },

  canSave: (pts: LatLng[]) => pts.length >= 2,
  saveKind: "linestring",
}
