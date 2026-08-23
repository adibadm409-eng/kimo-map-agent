import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { fmtDistCalc, haversineCalc } from "../../map/utils"
import { polygonArea, polylineLength } from "../../map/measure"
import { PopupCard } from "./PopupCard"
import type { ToolId, LatLng } from "../types"

type Props = {
  tool: ToolId
  coords: LatLng[]
  nextPt?: LatLng
  canFinish: boolean
  onSave: () => void
  onAddPoint: () => void
  onUndo: () => void
  onClear: () => void
}

function fmtArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(1)} هكتار`
  if (m2 >= 1000) return `${(m2 / 1000).toFixed(1)} كم²`
  return `${Math.round(m2)} م²`
}

export function DrawControlCard({
  tool, coords, nextPt, canFinish, onSave, onAddPoint, onUndo, onClear,
}: Props) {
  const isPolygon = tool === "polygon"
  const isPolyline = tool === "polyline"
  const isEraser = tool === "eraser"
  const title = isEraser ? "محو العناصر" : isPolygon ? "رسم مساحة" : "رسم مسار"
  const accent = isPolygon ? "#3B82F6" : isPolyline ? "#10B981" : "#DC2626"
  const target = isPolygon ? "≥3" : "≥2"

  const currentArea = isPolygon && coords.length >= 3 ? polygonArea(coords) : null
  const predictedArea = isPolygon && coords.length >= 2 && nextPt ? polygonArea([...coords, nextPt]) : null
  const currentLen = isPolyline && coords.length >= 2 ? polylineLength(coords) : null
  const predictedLen = isPolyline && coords.length >= 1 && nextPt ? polylineLength([...coords, nextPt]) : null
  // المسافة بين آخر نقطتين — يراها المستخدم بدقة أثناء رسم المساحة/المسار
  const lastSegDist = (isPolygon || isPolyline) && coords.length >= 2
    ? haversineCalc(coords[coords.length - 2].latitude, coords[coords.length - 2].longitude, coords[coords.length - 1].latitude, coords[coords.length - 1].longitude)
    : null

  const nowStat = isPolygon ? currentArea : currentLen
  const nextStat = isPolygon ? predictedArea : predictedLen
  const nowText = nowStat === null ? "—" : isPolygon ? fmtArea(nowStat) : fmtDistCalc(nowStat)
  const nextText = nextStat === null ? "—" : isPolygon ? fmtArea(nextStat) : fmtDistCalc(nextStat)

  return (
    <PopupCard
      title={title}
      icon={isEraser ? "trash-outline" : isPolygon ? "shapes-outline" : "git-branch-outline"}
      accent={accent}
      maxWidth={360}
    >
      {isEraser ? (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClear() }}
          style={({ pressed }) => [s.eraseBig, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <Ionicons name="trash" size={16} color="#B91C1C" />
          <Text style={s.eraseBigText}>مسح جميع العناصر المرسومة</Text>
        </Pressable>
      ) : (
        <>
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statLabel}>الآن</Text>
            <Text style={[s.statValue, { color: accent }]}>{nowText}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: accent + "22" }]} />
          <View style={s.statBox}>
            <Text style={s.statLabel}>+ نقطة المركز</Text>
            <Text style={[s.statValue, { color: accent }]}>{nextText}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: accent + "22" }]} />
          <View style={s.statBox}>
            <Text style={s.statLabel}>النقاط</Text>
            <Text style={[s.statValue, { color: accent }]}>{coords.length} {target}</Text>
          </View>
        </View>

        {/* المسافة بين آخر نقطتين — يراها المستخدم بدقة أثناء الرسم */}
        <View style={[s.segRow, { borderColor: accent + "33", backgroundColor: accent + "0a" }]}>
          <Ionicons name="git-commit-outline" size={14} color={accent} />
          <Text style={s.segLabel}>المسافة بين آخر نقطتين</Text>
          <Text style={[s.segValue, { color: accent }]}>{lastSegDist === null ? "—" : fmtDistCalc(lastSegDist)}</Text>
        </View>
        </>
      )}

      {isEraser ? null : (
        <View style={s.btnsRow}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAddPoint() }}
            style={({ pressed }) => [s.btn, s.addBtn, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={s.addText}>نقطة</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onUndo() }}
            style={({ pressed }) => [s.btn, s.inlineBtn, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <Ionicons name="arrow-undo" size={15} color="#1E40AF" />
            <Text style={s.inlineText}>تراجع</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClear() }}
            style={({ pressed }) => [s.btn, s.inlineBtn, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <Ionicons name="trash" size={15} color="#B91C1C" />
            <Text style={s.inlineText}>حذف</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave() }}
            disabled={!canFinish}
            style={({ pressed }) => [
              s.btn, s.saveBtn,
              !canFinish && { opacity: 0.35 },
              pressed && canFinish && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <Ionicons name="checkmark-done" size={16} color="#FFF" />
            <Text style={s.saveText}>حفظ</Text>
          </Pressable>
        </View>
      )}
    </PopupCard>
  )
}

const s = StyleSheet.create({
  statsRow: { flexDirection: "row", alignItems: "stretch", borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  statBox: { flex: 1, alignItems: "center", backgroundColor: "#F8FAFC" },
  statLabel: { fontSize: 8.5, fontFamily: "Tajawal_500Medium", color: "#94A3B8", marginTop: 6 },
  statValue: { fontSize: 14, fontFamily: "Tajawal_700Bold", marginTop: 2, marginBottom: 6 },
  statDivider: { width: 1, marginVertical: 6 },
  segRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  segLabel: { flex: 1, fontSize: 11, fontFamily: "Tajawal_500Medium", color: "#64748B" },
  segValue: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  btnsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10, paddingVertical: 9 },
  addBtn: { flex: 1.1, backgroundColor: "#0F172A" },
  addText: { color: "#FFF", fontSize: 11, fontFamily: "Tajawal_700Bold" },
  inlineBtn: { flex: 1, backgroundColor: "#F1F5F9" },
  inlineText: { fontSize: 11, fontFamily: "Tajawal_700Bold", color: "#1E293B" },
  saveBtn: { flex: 1.2, backgroundColor: "#10B981" },
  saveText: { color: "#FFF", fontSize: 11, fontFamily: "Tajawal_700Bold" },
  eraseBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" },
  eraseBigText: { color: "#B91C1C", fontSize: 12, fontFamily: "Tajawal_700Bold" },
})