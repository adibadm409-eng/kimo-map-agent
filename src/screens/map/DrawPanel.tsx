import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { spacing, radius, fontSize } from "../../theme/tokens"
import { TOOL_FAB_ITEMS, getTool } from "./tools/registry"
import type { DrawMode } from "./tools/types"

type Theme = {
  bg: string
  bgSecondary: string
  border: string
  textPrimary: string
  textSecondary: string
  accent: string
}

export function DrawPanel({
  visible, drawMode, theme, insets, onPick, onClose,
}: {
  visible: boolean
  drawMode: DrawMode
  theme: Theme
  insets: { top: number; bottom: number }
  onPick: (m: DrawMode) => void
  onClose: () => void
}) {
  if (!visible) return null
  return (
    <View style={[s.wrap, { bottom: insets.bottom + 60 }]}>
      <View style={[s.sheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <View style={s.header}>
          <Text style={[s.title, { color: theme.textPrimary }]}>أدوات الرسم</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <View style={s.row}>
          {TOOL_FAB_ITEMS.map((t) => {
            const active = drawMode === t.mode
            const hint = getTool(t.mode)?.hint ?? t.label
            return (
              <Pressable
                key={t.mode}
                onPress={() => onPick(t.mode)}
                style={[s.tool, active && { backgroundColor: t.color + "20", borderColor: t.color }]}
              >
                <View style={[s.toolIcon, { backgroundColor: active ? t.color : "transparent" }]}>
                  <Ionicons name={t.icon as any} size={20} color={active ? "#FFF" : t.color} />
                </View>
                <Text style={[s.toolLabel, { color: active ? t.color : theme.textPrimary }]}>{t.label}</Text>
                <Text style={[s.toolHint, { color: theme.textSecondary }]} numberOfLines={1}>{hint}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.sm, right: spacing.sm, zIndex: 120 },
  sheet: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, elevation: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  row: { flexDirection: "row-reverse", justifyContent: "space-between" },
  tool: { flex: 1, alignItems: "center", paddingVertical: spacing.xs, marginHorizontal: 2, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent" },
  toolIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  toolLabel: { fontSize: fontSize.sm, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  toolHint: { fontSize: 9, fontFamily: "Tajawal_400Regular", marginTop: 2 },
})
