import React from "react"
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius, SCREEN_WIDTH } from "../../../theme/tokens"
import { TOOLS } from "../toolsConfig"
import type { ToolId } from "../types"

type Props = {
  active: ToolId | null
  drawableCount: number
  onPick: (id: ToolId) => void
  onClear: () => void
}

export function ToolCard({ active, drawableCount, onPick, onClear }: Props) {
  const handlePick = (id: ToolId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPick(id)
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>أدوات الرسم</Text>
        {drawableCount > 0 && (
          <Pressable onPress={onClear} style={s.clearBtn}>
            <Ionicons name="close-circle" size={14} color="#DC2626" />
            <Text style={s.clearText}>مسح ({drawableCount})</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.toolsRow}
      >
        {TOOLS.map((t) => {
          const isActive = active === t.id
          return (
            <Pressable
              key={t.id}
              onPress={() => handlePick(t.id)}
              style={({ pressed }) => [
                s.toolBtn,
                isActive && { backgroundColor: t.color, borderColor: t.color },
                { transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}
            >
              <View
                style={[
                  s.toolIconWrap,
                  { backgroundColor: isActive ? "rgba(255,255,255,0.25)" : t.color + "20" },
                ]}
              >
                <Ionicons name={t.icon as any} size={18} color={isActive ? "#FFF" : t.color} />
              </View>
              <Text style={[s.toolLabel, { color: isActive ? "#FFF" : "#475569" }]}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
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
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  clearBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#FEF2F2" },
  clearText: { fontSize: 10, fontFamily: "Tajawal_700Bold", color: "#DC2626" },
  toolsRow: { gap: spacing.xs, paddingHorizontal: 2 },
  toolBtn: {
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    minWidth: 64,
  },
  toolIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  toolLabel: { fontSize: 11, fontFamily: "Tajawal_700Bold" },
})
