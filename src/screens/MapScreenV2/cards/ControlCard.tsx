import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"

export type CtrlKey =
  | "gps" | "layers" | "mapType" | "spatial" | "track" | "waypoint-list"

const ITEMS: { key: CtrlKey; icon: string; label: string; color: string }[] = [
  { key: "gps", icon: "navigate", label: "موقعي", color: "#2563EB" },
  { key: "layers", icon: "layers", label: "الطبقات", color: "#7C3AED" },
  { key: "spatial", icon: "analytics", label: "تحليلات", color: "#059669" },
  { key: "track", icon: "radio-button-on", label: "تسجيل", color: "#DC2626" },
  { key: "waypoint-list", icon: "list", label: "العناصر", color: "#475569" },
]

type Props = {
  onAction: (k: CtrlKey) => void
  trackRunning?: boolean
  activePanel: string | null
}

export function ControlCard({ onAction, trackRunning, activePanel }: Props) {
  const handle = (k: CtrlKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onAction(k)
  }

  return (
    <View style={s.bar}>
      {ITEMS.map((it) => {
        const isTrackingActive = it.key === "track" && trackRunning
        const isPanelOpen = it.key === activePanel
        const color = isTrackingActive ? "#16A34A" : it.color
        const label = isTrackingActive ? "إيقاف" : it.label
        const icon = isTrackingActive ? "stop-circle" : it.icon
        return (
          <Pressable
            key={it.key}
            onPress={() => handle(it.key)}
            style={({ pressed }) => [
              s.ctrlBtn,
              isPanelOpen && { backgroundColor: color + "18", borderColor: color, borderWidth: 1.5 },
              { transform: [{ scale: pressed ? 0.92 : 1 }] },
            ]}
          >
            <View style={[s.ctrlIconWrap, { backgroundColor: isPanelOpen ? color : color + "18" }]}>
              <Ionicons name={icon as any} size={19} color={isPanelOpen ? "#FFF" : color} />
            </View>
            <Text style={[s.ctrlLabel, { color: isPanelOpen ? color : "#475569" }]}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export const CONTROL_BAR_HEIGHT = 66

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    minHeight: CONTROL_BAR_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 6,
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  ctrlBtn: {
    alignItems: "center",
    flex: 1,
    width: 56,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  ctrlIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  ctrlLabel: {
    fontSize: 10,
    fontFamily: "Tajawal_700Bold",
    textAlign: "center",
  },
})