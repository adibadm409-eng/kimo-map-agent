import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius } from "../../../theme/tokens"
import { TOOL_BY_ID } from "../toolsConfig"
import type { ToolId, MeasureSummary } from "../types"

type Props = {
  tool: ToolId
  points: number
  summary: MeasureSummary | null
  canFinish: boolean
  onAdd: () => void
  onUndo: () => void
  onFinish: () => void
  onCancel: () => void
}

export function DrawCard({
  tool, points, summary, canFinish, onAdd, onUndo, onFinish, onCancel,
}: Props) {
  const meta = TOOL_BY_ID[tool]
  const handle = (cb: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    cb()
  }

  return (
    <View style={[s.card, { borderColor: meta.color }]}>
      <View style={s.header}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
          <Ionicons name={meta.icon as any} size={16} color={meta.color} />
          <Text style={[s.title, { color: meta.color }]}>{meta.label}</Text>
          <View style={[s.counter, { backgroundColor: meta.color }]}>
            <Text style={s.counterText}>{points} نقطة</Text>
          </View>
        </View>
        <Pressable onPress={handle(onCancel)} hitSlop={10}>
          <Ionicons name="close" size={18} color="#64748B" />
        </Pressable>
      </View>

      <Text style={s.hint}>{meta.hint}</Text>

      {summary && (
        <View style={s.summaryBox}>
          <Ionicons name="information-circle" size={14} color="#8B5CF6" />
          <Text style={s.summaryText} numberOfLines={2}>{summary.display}</Text>
        </View>
      )}

      <View style={s.actions}>
        <Pressable onPress={handle(onAdd)} style={[s.btn, { backgroundColor: meta.color }]}>
          <Ionicons name="add-circle" size={18} color="#FFF" />
          <Text style={s.btnText}>إضافة نقطة</Text>
        </Pressable>
        <Pressable
          disabled={points === 0}
          onPress={handle(onUndo)}
          style={[s.btn, { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#F59E0B", opacity: points === 0 ? 0.4 : 1 }]}
        >
          <Ionicons name="arrow-undo" size={18} color="#F59E0B" />
          <Text style={[s.btnText, { color: "#F59E0B" }]}>تراجع</Text>
        </Pressable>
        {tool !== "eraser" && (
          <Pressable
            disabled={!canFinish}
            onPress={handle(onFinish)}
            style={[s.btn, { backgroundColor: "#16A34A", opacity: canFinish ? 1 : 0.4 }]}
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={s.btnText}>حفظ</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  counter: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  counterText: { color: "#FFF", fontSize: 10, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  hint: { fontSize: 11, fontFamily: "Tajawal_400Regular", color: "#64748B", textAlign: "right", marginBottom: spacing.xs },
  summaryBox: { flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: spacing.xs + 2, borderRadius: radius.sm, backgroundColor: "#F5F3FF", marginBottom: spacing.sm, marginTop: spacing.xs },
  summaryText: { flex: 1, fontSize: fontSize.xs, fontFamily: "Tajawal_500Medium", color: "#5B21B6", textAlign: "right" },
  actions: { flexDirection: "row-reverse", gap: spacing.sm },
  btn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: spacing.sm, borderRadius: radius.md },
  btnText: { color: "#FFF", fontFamily: "Tajawal_700Bold", fontSize: fontSize.sm },
})
