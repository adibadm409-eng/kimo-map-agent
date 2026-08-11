import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { Polygon, Polyline, Marker } from "react-native-maps"
import { Ionicons } from "@expo/vector-icons"
import type { LatLng } from "../types"
import type { ToolContext } from "./types"
import { getTool } from "./registry"

type PreviewItem = {
  kind: "polyline" | "polygon" | "marker" | "bubble"
  coords?: LatLng[]
  coord?: LatLng
  color?: string
  fillColor?: string
  strokeColor?: string
  width?: number
  dash?: number[]
  anchor?: { x: number; y: number }
  view?: any
  pointerEvents?: string
}

const STYLES = StyleSheet.create({
  bubbleView: { backgroundColor: "#8B5CF6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, elevation: 6, minWidth: 80, alignItems: "center" },
  bubbleLabel: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontFamily: "Tajawal_700Bold", marginBottom: 1 },
  bubbleText: { color: "#FFF", fontSize: 13, fontWeight: "bold", fontFamily: "Tajawal_700Bold" },
  bubbleSub: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontFamily: "Tajawal_500Medium", marginTop: 2 },
  returnBubble: { backgroundColor: "#8B5CF6", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, elevation: 4 },
  returnBubbleText: { color: "#FFF", fontSize: 11, fontWeight: "bold", fontFamily: "Tajawal_700Bold" },
  previewPin: { alignItems: "center", justifyContent: "center" },
})

export function renderToolPreview(ctx: ToolContext): React.ReactNode {
  const tool = getTool(ctx.drawMode)
  if (!tool) return null
  const items = tool.previewPoints(ctx) as PreviewItem[]
  return items.map((item, idx) => {
    if (item.kind === "polygon" && item.coords && item.coords.length >= 3) {
      return (
        <Polygon key={`p-${idx}`} coordinates={item.coords} fillColor={item.fillColor} strokeColor={item.strokeColor || item.color} strokeWidth={item.width || 1} lineDashPattern={item.dash as any} />
      )
    }
    if (item.kind === "polyline" && item.coords && item.coords.length >= 2) {
      return <Polyline key={`l-${idx}`} coordinates={item.coords} strokeColor={item.color} strokeWidth={item.width || 2} lineDashPattern={item.dash as any} />
    }
    if (item.kind === "marker" && item.coord) {
      const v = item.view
      const bg1 = (v as any)?.color || "rgba(0,0,0,0)"
      return (
        <Marker key={`m-cell-${idx}`} coordinate={item.coord} anchor={item.anchor as any} pointerEvents={item.pointerEvents as any}>
          <View style={[STYLES.previewPin, { backgroundColor: bg1, borderRadius: 10, width: 40, height: 40 }]}>
            <Ionicons name="pin" size={22} color={(v as any)?.color || "#EF4444"} />
          </View>
        </Marker>
      )
    }
    if (item.kind === "bubble" && item.coord) {
      const v = item.view as any
      return (
        <Marker key={`b-cell-${idx}`} coordinate={item.coord} anchor={item.anchor as any} pointerEvents={item.pointerEvents as any}>
          {v?.type === "returnBubble" ? (
            <View style={[STYLES.returnBubble, { backgroundColor: item.color }]}>
              <Text style={[STYLES.returnBubbleText, { color: "#FFF" }]}>{v.text}</Text>
            </View>
          ) : (
            <View style={[STYLES.bubbleView, { backgroundColor: item.color }]}>
              {(v?.lines as string[])?.map((ln, li) => (
                <Text key={`ln-${li}`} style={li === 0 ? STYLES.bubbleLabel : (li === 1 ? STYLES.bubbleText : STYLES.bubbleSub)}>{ln}</Text>
              ))}
            </View>
          )}
        </Marker>
      )
    }
    return null
  })
}
