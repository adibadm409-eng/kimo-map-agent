import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius } from "../../../theme/tokens"
import { fmtDistCalc } from "../../map/utils"

type SavedEntry = {
  id: string
  name: string
  kind: "property" | "waypoint" | "area"
  latitude: number | null
  longitude: number | null
  area_sqm?: number
}

type Props = {
  items: SavedEntry[]
  onSelect: (item: SavedEntry) => void
  onClose: () => void
}

export function ItemsListCard({ items, onSelect, onClose }: Props) {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.titleWrap}>
          <Ionicons name="list" size={18} color="#475569" />
          <Text style={s.title}>العناصر المحفوظة</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{items.length}</Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color="#64748B" />
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Text style={s.empty}>لا توجد عناصر محفوظة بعد</Text>
      ) : (
        <View>
          {items.map((it) => (
            <Pressable
              key={`${it.kind}-${it.id}`}
              style={s.row}
              onPress={() => { Haptics.selectionAsync(); onSelect(it) }}
            >
              <View style={s.left}>
                <View
                  style={[
                    s.icon,
                    { backgroundColor: it.kind === "property" ? "#DCFCE7" : it.kind === "waypoint" ? "#FEE2E2" : "#DBEAFE" },
                  ]}
                >
                  <Ionicons
                    name={it.kind === "property" ? "home-outline" : it.kind === "waypoint" ? "pin" : "shapes-outline"}
                    size={14}
                    color={it.kind === "property" ? "#16A34A" : it.kind === "waypoint" ? "#EF4444" : "#3B82F6"}
                  />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{it.name}</Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {it.latitude != null && it.longitude != null
                      ? `${Number(it.latitude).toFixed(5)}, ${Number(it.longitude).toFixed(5)}`
                      : `مساحة: ${fmtDistCalc(it.area_sqm || 0)}`}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-back" size={16} color="#94A3B8" />
            </Pressable>
          ))}
        </View>
      )}
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
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  titleWrap: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  title: { fontSize: fontSize.md, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  badge: { backgroundColor: "#E2E8F0", paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999 },
  badgeText: { fontSize: 10, fontFamily: "Tajawal_700Bold", color: "#475569" },
  empty: { padding: spacing.md, textAlign: "center", color: "#94A3B8", fontFamily: "Tajawal_400Regular" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F1F5F9" },
  left: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, flex: 1 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  name: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#1E293B" },
  meta: { fontSize: 10, fontFamily: "monospace", color: "#94A3B8" },
})
