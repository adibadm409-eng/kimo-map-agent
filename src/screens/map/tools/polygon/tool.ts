import type { LatLng } from "../../types"
import { polygonArea, polylineLength } from "../../measure"
import { fmtDistCalc } from "../../utils"
import type { ToolDefinition, ToolContext } from "../types"

export const polygonTool: ToolDefinition = {
  mode: "polygon",
  icon: "shapes-outline",
  label: "مضلع",
  shortLabel: "مساحة",
  color: "#3B82F6",
  hint: "ثلاث نقاط على الأقل، أداة المساحة والمحيط",
  minPoints: 3,
  needsSave: true,

  previewPoints: (ctx: ToolContext) => {
    const out: any[] = []
    const c = ctx.previewCenter

    if (ctx.drawPts.length >= 2) {
      out.push({ kind: "polygon", coords: ctx.drawPts, fillColor: "rgba(59,130,246,0.15)", strokeColor: "#3B82F6", width: 2 })
    }
    const previewPts = [...ctx.drawPts, c]
    if (previewPts.length >= 3) {
      out.push({ kind: "polygon", coords: previewPts, fillColor: "rgba(59,130,246,0.07)", strokeColor: "rgba(59,130,246,0.4)", width: 1, dash: [4, 4] })
    } else if (previewPts.length >= 2) {
      out.push({ kind: "polyline", coords: previewPts, color: "rgba(59,130,246,0.5)", width: 1.5, dash: [4, 4] })
    }
    if (ctx.drawPts.length >= 1) {
      out.push({
        kind: "bubble",
        coord: c,
        anchor: { x: 0.5, y: 0.5 },
        color: "#3B82F6",
        lines: ctx.drawPts.length >= 3
          ? [`${(polygonArea([...ctx.drawPts, c]) / 10000).toFixed(3)} هكتار`, `محيط: ${fmtDistCalc(polylineLength([...ctx.drawPts, c]))}`]
          : [`${ctx.drawPts.length} نقطة`],
        pointerEvents: "none",
      })
    }
    return out
  },

  summarize: (pts: LatLng[]) => {
    if (pts.length < 3) return `${pts.length} نقطة — تحتاج 3 على الأقل`
    const area = polygonArea([...pts, pts[0]])
    const perim = polylineLength([...pts, pts[0]])
    return `المساحة: ${(area / 10000).toFixed(3)} هكتار · المحيط: ${fmtDistCalc(perim)} · ${pts.length} نقطة`
  },

  canSave: (pts: LatLng[]) => pts.length >= 3,
  saveKind: "area",
}
