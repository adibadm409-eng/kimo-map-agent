import type { LatLng } from "../../types"
import { haversineCalc, fmtDistCalc, bearingDir } from "../../utils"
import type { ToolDefinition, ToolContext } from "../types"

function calcBearing(a: LatLng, b: LatLng): number {
  const dLon = (b.longitude - a.longitude) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(b.latitude * Math.PI / 180)
  const x = Math.cos(a.latitude * Math.PI / 180) * Math.sin(b.latitude * Math.PI / 180) -
    Math.sin(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function totalLength(pts: LatLng[]): number {
  let t = 0
  for (let i = 1; i < pts.length; i++) t += haversineCalc(pts[i-1].latitude, pts[i-1].longitude, pts[i].latitude, pts[i].longitude)
  return t
}

// أداة القياس: مسافة فقط — لا مساحة، لا محيط، لا مضلع
export const measureTool: ToolDefinition = {
  mode: "measure",
  icon: "expand-outline",
  label: "قياس",
  shortLabel: "قياس",
  color: "#8B5CF6",
  hint: "اضغط لوضع نقطة واحدة في كل مرة لقياس المسافة التراكمية",
  minPoints: 2,
  needsSave: true,

  previewPoints: (ctx: ToolContext) => {
    const out: any[] = []
    const c = ctx.previewCenter

    if (ctx.drawPts.length >= 2) {
      out.push({ kind: "polyline", coords: ctx.drawPts, color: "#8B5CF6", width: 3, dash: [6, 4] })
    }
    if (ctx.drawPts.length >= 1) {
      out.push({ kind: "polyline", coords: [...ctx.drawPts, c], color: "rgba(139,92,246,0.5)", width: 1.5, dash: [4, 4] })
    }
    if (ctx.drawPts.length >= 1) {
      const last = ctx.drawPts[ctx.drawPts.length - 1]
      const seg = haversineCalc(last.latitude, last.longitude, c.latitude, c.longitude)
      const total = totalLength(ctx.drawPts) + seg
      out.push({
        kind: "marker",
        coord: c,
        anchor: { x: 0.5, y: 0.5 },
        view: { type: "bubble", lines: ["مقطع", fmtDistCalc(seg), ctx.drawPts.length >= 2 ? `الإجمالي: ${fmtDistCalc(total)}` : null].filter(Boolean) },
        color: "#8B5CF6",
        pointerEvents: "none",
      })
    }
    if (ctx.drawPts.length >= 2) {
      const start = ctx.drawPts[0]
      const d = haversineCalc(start.latitude, start.longitude, c.latitude, c.longitude)
      out.push({
        kind: "marker",
        coord: start,
        anchor: { x: 0.5, y: 1.4 },
        view: { type: "returnBubble", text: `↩ ${fmtDistCalc(d)} من نقطة الانطلاق` },
        color: "#8B5CF6",
        pointerEvents: "none",
      })
    }
    return out
  },

  summarize: (pts: LatLng[]) => {
    if (pts.length < 2) return ""
    const total = totalLength(pts)
    const last = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    const seg = haversineCalc(prev.latitude, prev.longitude, last.latitude, last.longitude)
    const b = calcBearing(prev, last)
    return `${fmtDistCalc(total)} · ${pts.length} نقطة · المقطع ${fmtDistCalc(seg)} · ${b.toFixed(0)}° ${bearingDir(b)}`
  },

  canSave: (pts: LatLng[]) => pts.length >= 2,
  saveKind: "measurement",
}
