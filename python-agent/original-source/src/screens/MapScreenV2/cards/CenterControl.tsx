import React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import * as Haptics from "expo-haptics"
import { TOOL_BY_ID } from "../toolsConfig"
import type { ToolId } from "../types"

type Props = {
  activeTool: ToolId | null
  onPress: () => void
}

export function CenterControl({ activeTool, onPress }: Props) {
  const accent = activeTool ? (TOOL_BY_ID[activeTool]?.color ?? "#0F172A") : "#0F172A"

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      hitSlop={22}
      style={({ pressed }) => [
        s.btn,
        activeTool && { backgroundColor: accent + "2E" },
        pressed && { transform: [{ scale: 0.9 }] },
      ]}
    >
      <View style={[s.tick, s.tickTop, { backgroundColor: accent }]} />
      <View style={[s.tick, s.tickBottom, { backgroundColor: accent }]} />
      <View style={[s.tick, s.tickLeft, { backgroundColor: accent }]} />
      <View style={[s.tick, s.tickRight, { backgroundColor: accent }]} />
      <View style={[s.crossCenter, { borderColor: accent }]} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.38)",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  tick: { position: "absolute", width: 7, height: 1.5, borderRadius: 1, opacity: 0.85 },
  tickTop: { top: 6 },
  tickBottom: { bottom: 6 },
  tickLeft: { left: 6, width: 1.5, height: 7 },
  tickRight: { right: 6, width: 1.5, height: 7 },
  crossCenter: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, backgroundColor: "rgba(255,255,255,0.85)" },
})