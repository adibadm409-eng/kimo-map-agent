import React from "react"
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius } from "../../../theme/tokens"
import { fmtDistCalc } from "../../map/utils"

type Item = { id: string; name: string; dist?: number }

type Props = {
  originLat: number
  originLng: number
  nearestProperties: Item[]
  nearestWaypoints: Item[]
  insideAreas: Item[]
  onSelectProperty: (id: string) => void
  onSelectWaypoint: (id: string) => void
  onFocusArea: (id: string) => void
  onClose: () => void
}

export function SpatialCard({
  originLat, originLng,
  nearestProperties, nearestWaypoints, insideAreas,
  onSelectProperty, onSelectWaypoint, onFocusArea, onClose,
}: Props) {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.titleWrap}>
          <Ionicons name="analytics" size={18} color="#7C3AED" />
          <Text style={s.title}>تحليلات مكانية</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color="#64748B" />
        </Pressable>
      </View>

      <View style={s.coordChip}>
        <Ionicons name="location" size={12} color="#7C3AED" />
        <Text style={s.coordText}>
          نقطة المرجع: {originLat.toFixed(5)}, {originLng.toFixed(5)}
        </Text>
      </View>

      <Text style={s.sectionTitle}>أقرب العقارات</Text>
      {nearestProperties.length === 0 ? (
        <Text style={s.emptyText}>لا توجد عقارات قريبة</Text>
      ) : (
        nearestProperties.map((p) => (
          <Pressable
            key={p.id}
            style={s.listItem}
            onPress={() => { Haptics.selectionAsync(); onSelectProperty(p.id) }}
          >
            <View style={s.itemLeft}>
              <View style={[s.itemIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="home" size={14} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={1}>{p.name}</Text>
                <Text style={s.itemMeta}>عقار</Text>
              </View>
            </View>
            <Text style={s.itemDist}>{fmtDistCalc(p.dist || 0)}</Text>
          </Pressable>
        ))
      )}

      <Text style={s.sectionTitle}>أقرب النقاط</Text>
      {nearestWaypoints.length === 0 ? (
        <Text style={s.emptyText}>لا توجد نقاط قريبة</Text>
      ) : (
        nearestWaypoints.map((w) => (
          <Pressable
            key={w.id}
            style={s.listItem}
            onPress={() => { Haptics.selectionAsync(); onSelectWaypoint(w.id) }}
          >
            <View style={s.itemLeft}>
              <View style={[s.itemIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="pin" size={14} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={1}>{w.name}</Text>
                <Text style={s.itemMeta}>نقطة</Text>
              </View>
            </View>
            <Text style={s.itemDist}>{fmtDistCalc(w.dist || 0)}</Text>
          </Pressable>
        ))
      )}

      <Text style={s.sectionTitle}>المناطق المحيطة</Text>
      {insideAreas.length === 0 ? (
        <Text style={s.emptyText}>لا توجد مناطق محيطة بالنقطة</Text>
      ) : (
        insideAreas.map((a) => (
          <Pressable
            key={a.id}
            style={s.listItem}
            onPress={() => { Haptics.selectionAsync(); onFocusArea(a.id) }}
          >
            <View style={s.itemLeft}>
              <View style={[s.itemIcon, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="shapes" size={14} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={1}>{a.name}</Text>
                <Text style={s.itemMeta}>منطقة محيطة</Text>
              </View>
            </View>
            <Ionicons name="chevron-back" size={18} color="#94A3B8" />
          </Pressable>
        ))
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
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  titleWrap: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  title: { fontSize: fontSize.md, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  coordChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, padding: spacing.xs + 2, borderRadius: radius.sm, backgroundColor: "#F5F3FF", marginBottom: spacing.xs },
  coordText: { fontSize: 10, fontFamily: "monospace", color: "#5B21B6" },
  sectionTitle: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#0F172A", marginTop: spacing.sm, marginBottom: spacing.xs },
  emptyText: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", color: "#94A3B8", textAlign: "center", paddingVertical: spacing.xs },
  listItem: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: "#F1F5F9", marginBottom: 4 },
  itemLeft: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, flex: 1 },
  itemIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#1E293B" },
  itemMeta: { fontSize: 10, fontFamily: "Tajawal_400Regular", color: "#94A3B8" },
  itemDist: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#2563EB" },
})
