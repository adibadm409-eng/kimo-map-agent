import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { TOOLS } from "../toolsConfig"
import { PopupCard } from "./PopupCard"
import type { ToolId } from "../types"

type Props = {
  activeTool: ToolId | null
  onPickTool: (id: ToolId) => void
  onClose: () => void
}

export function DrawToolsCard({ activeTool, onPickTool, onClose }: Props) {
  return (
    <PopupCard
      title="أدوات الرسم"
      icon="color-wand-outline"
      accent="#0F172A"
      onClose={onClose}
      maxWidth={250}
    >
      <View style={s.toolsRow}>
        {TOOLS.map((t) => {
          const isActive = activeTool === t.id
          return (
            <Pressable
              key={t.id}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPickTool(t.id) }}
              style={({ pressed }) => [
                s.toolBtn,
                isActive && { backgroundColor: t.color, borderColor: t.color },
                pressed && { transform: [{ scale: 0.93 }] },
              ]}
              hitSlop={4}
            >
              <Ionicons name={t.icon as any} size={17} color={isActive ? "#FFF" : t.color} />
              <Text style={[s.toolLabel, { color: isActive ? "#FFF" : "#475569" }]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </PopupCard>
  )
}

const s = StyleSheet.create({
  toolsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center" },
  toolBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: "#E2E8F0", minWidth: 64, backgroundColor: "#FFF" },
  toolLabel: { fontSize: 10, fontFamily: "Tajawal_700Bold" },
})