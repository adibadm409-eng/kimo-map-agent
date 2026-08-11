import React, { useState, useEffect, useMemo } from "react"
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius } from "../../../theme/tokens"
import type { LayerVis, PropFilter } from "../types"
import { PROVIDER_GROUPS, loadProviderSettings } from "../mapProviders"

const STATUS_OPTS = [
  { key: "", label: "الكل" },
  { key: "for_sale", label: "للبيع" },
  { key: "sold", label: "مُباع" },
  { key: "rented", label: "مؤجر" },
  { key: "pending", label: "تحت المعالجة" },
]
const TYPE_OPTS = [
  { key: "", label: "الكل" },
  { key: "apartment", label: "شقة" },
  { key: "villa", label: "فيلا" },
  { key: "land", label: "أرض" },
  { key: "office", label: "مكتب" },
  { key: "commercial", label: "محل تجاري" },
]
const PRICE_OPTS = [
  { key: 0, label: "أي سعر" },
  { key: 500000, label: "< 500 ألف" },
  { key: 1000000, label: "< مليون" },
  { key: 5000000, label: "< 5 مليون" },
  { key: 10000000, label: "< 10 مليون" },
]
const MAP_TYPES: { key: string; label: string; icon: string; provider: string }[] = (() => {
  // تنظيم بصري فقط: كل الخرائط المفعّلة من الإعدادات (available وغير مخفية) في شبكة
  // بحد أقصى 3 لكل صف، مع اسم المزوّد أعلى كل خريطة. تُدمج التكرارات (نفس المفتاح
  // يظهر مرة واحدة تحت المزوّد الذي يوفرها فعلياً في التطبيق).
  const byKey = new Map<string, { key: string; label: string; icon: string; provider: string }>()
  for (const g of PROVIDER_GROUPS) {
    for (const m of g.maps) {
      if (!m.styleKey || m.status !== "available") continue
      byKey.set(m.styleKey, { key: m.styleKey, label: m.label, icon: m.icon, provider: g.name })
    }
  }
  return [...byKey.values()]
})()
const LAYER_ROWS: { key: keyof LayerVis; label: string; icon: string; color: string }[] = [
  { key: "properties", label: "عقارات", icon: "home-outline", color: "#16A34A" },
  { key: "waypoints", label: "نقاط", icon: "pin-outline", color: "#EF4444" },
  { key: "areas", label: "مناطق", icon: "shapes-outline", color: "#3B82F6" },
  { key: "tracks", label: "مسارات GPS", icon: "git-branch-outline", color: "#F59E0B" },
]

type Props = {
  layerVis: LayerVis
  propFilter: PropFilter
  mapType: string
  counts: { properties: number; waypoints: number; areas: number; tracks: number }
  connectionOnline: boolean
  onToggleConnection: () => void
  onToggleLayer: (k: keyof LayerVis) => void
  onFilterChange: (f: Partial<PropFilter>) => void
  onMapTypeChange: (t: string) => void
  onClose: () => void
}

export function LayersCard({
  layerVis, propFilter, mapType, counts,
  connectionOnline, onToggleConnection,
  onToggleLayer, onFilterChange, onMapTypeChange, onClose,
}: Props) {
  const [hiddenMaps, setHiddenMaps] = useState<string[]>([])
  useEffect(() => { loadProviderSettings().then((s) => setHiddenMaps(s.hidden)) }, [])

  const enabledMaps = useMemo(
    () => MAP_TYPES.filter((m) => !hiddenMaps.includes(m.key)),
    [hiddenMaps]
  )

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>الطبقات والفلاتر</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color="#64748B" />
        </Pressable>
      </View>

      <Text style={s.sectionTitle}>وضع الاتصال</Text>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onToggleConnection() }}
        style={({ pressed }) => [
          s.connRow,
          connectionOnline ? { backgroundColor: "#ECFDF5", borderColor: "#10B981" } : { backgroundColor: "#F8FAFC", borderColor: "#CBD5E1" },
          pressed && { opacity: 0.75 },
        ]}
      >
        <View style={[s.connIcon, { backgroundColor: connectionOnline ? "#10B981" + "1A" : "#94A3B8" + "1A" }]}>
          <Ionicons name={connectionOnline ? "cloud-done" : "cloud-offline"} size={18} color={connectionOnline ? "#10B981" : "#64748B"} />
        </View>
        <View style={s.connTextWrap}>
          <Text style={[s.connTitle, { color: connectionOnline ? "#065F46" : "#475569" }]}>
            {connectionOnline ? "الاتصال مفعّل" : "وضع عدم الاتصال"}
          </Text>
          <Text style={s.connDesc}>
            {connectionOnline
              ? "تُحمَّل وتُحدَّث طبقات الخريطة وتُحفظ محلياً"
              : "تُعرض الطبقات المحفوظة محلياً فقط دون تحميل"}
          </Text>
        </View>
        <View style={[s.switch, connectionOnline ? { backgroundColor: "#10B981" } : { backgroundColor: "#CBD5E1" }]}>
          <View style={[s.switchDot, connectionOnline && { transform: [{ translateX: 12 }] }]} />
        </View>
      </Pressable>

      <Text style={s.sectionTitle}>نوع الخريطة</Text>
      <View style={s.mapGrid}>
        {enabledMaps.map((m) => {
          const active = mapType === m.key
          return (
            <Pressable
              key={m.key}
              onPress={() => { Haptics.selectionAsync(); onMapTypeChange(m.key) }}
              style={[s.mapTile, active && s.mapTileActive]}
            >
              <Text style={[s.mapProvider, active && s.mapProviderActive]} numberOfLines={1}>{m.provider}</Text>
              <View style={s.mapTileBody}>
                <Ionicons name={m.icon as any} size={17} color={active ? "#2563EB" : "#64748B"} />
                <Text style={[s.mapTileText, active && s.mapTileTextActive]} numberOfLines={1}>{m.label}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      <Text style={s.sectionTitle}>عرض الطبقات</Text>
      {LAYER_ROWS.map((row) => {
        const visible = layerVis[row.key]
        const count = counts[row.key as keyof typeof counts] ?? 0
        return (
          <Pressable key={row.key} style={s.row} onPress={() => { Haptics.selectionAsync(); onToggleLayer(row.key) }}>
            <View style={s.rowRight}>
              <Ionicons name={row.icon as any} size={18} color={row.color} />
              <Text style={s.rowLabel}>{row.label}</Text>
              <Text style={s.rowCount}>({count})</Text>
            </View>
            <Ionicons name={visible ? "checkbox" : "square-outline"} size={20} color={visible ? "#2563EB" : "#94A3B8"} />
          </Pressable>
        )
      })}

      <Text style={s.sectionTitle}>فلترة العقارات</Text>
      <Text style={s.fieldLabel}>الحالة</Text>
      <View style={s.chips}>
        {STATUS_OPTS.map((o) => {
          const active = propFilter.status === o.key
          return (
            <Pressable
              key={o.key}
              onPress={() => onFilterChange({ status: o.key })}
              style={[s.chip, active && { borderColor: "#2563EB", borderWidth: 1.5 }]}
            >
              <Text style={[s.chipText, { color: active ? "#2563EB" : "#475569" }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={s.fieldLabel}>النوع</Text>
      <View style={s.chips}>
        {TYPE_OPTS.map((o) => {
          const active = propFilter.type === o.key
          return (
            <Pressable
              key={o.key}
              onPress={() => onFilterChange({ type: o.key })}
              style={[s.chip, active && { borderColor: "#2563EB", borderWidth: 1.5 }]}
            >
              <Text style={[s.chipText, { color: active ? "#2563EB" : "#475569" }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={s.fieldLabel}>السعر الأقصى</Text>
      <View style={s.chips}>
        {PRICE_OPTS.map((o) => {
          const active = propFilter.priceMax === o.key
          return (
            <Pressable
              key={o.key}
              onPress={() => onFilterChange({ priceMax: o.key })}
              style={[s.chip, active && { borderColor: "#2563EB", borderWidth: 1.5 }]}
            >
              <Text style={[s.chipText, { color: active ? "#2563EB" : "#475569" }]}>{o.label}</Text>
            </Pressable>
          )
        })}
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
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: fontSize.md, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  sectionTitle: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#0F172A", marginTop: spacing.sm, marginBottom: spacing.xs },
  fieldLabel: { fontSize: 11, fontFamily: "Tajawal_700Bold", color: "#475569", marginTop: spacing.xs, marginBottom: 4 },
  mapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  mapTile: { flexGrow: 1, flexBasis: "30%", maxWidth: "31.5%", borderRadius: radius.md, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFF", overflow: "hidden" },
  mapTileActive: { borderColor: "#2563EB", borderWidth: 1.5, backgroundColor: "#EFF6FF" },
  mapProvider: { width: "100%", paddingHorizontal: 5, paddingVertical: 3, fontSize: 9, fontFamily: "Tajawal_500Medium", color: "#94A3B8", textAlign: "center", backgroundColor: "#F1F5F9", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  mapProviderActive: { color: "#2563EB", backgroundColor: "#DBEAFE", borderBottomColor: "#BFDBFE" },
  mapTileBody: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4 },
  mapTileText: { fontSize: 11, fontFamily: "Tajawal_700Bold", color: "#475569", flexShrink: 1 },
  mapTileTextActive: { color: "#2563EB" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md - 2, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 4 },
  chipActive: { borderWidth: 1.5 },
  chipText: { fontSize: fontSize.xs, fontFamily: "Tajawal_500Medium" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: "#F1F5F9", marginBottom: 4 },
  rowRight: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  rowLabel: { fontSize: fontSize.sm, fontFamily: "Tajawal_500Medium", color: "#1E293B" },
  rowCount: { fontSize: 10, fontFamily: "monospace", color: "#94A3B8" },
  connRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.xs, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  connIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  connTextWrap: { flex: 1, alignItems: "flex-start", gap: 1 },
  connTitle: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  connDesc: { fontSize: 9, fontFamily: "Tajawal_400Regular", color: "#94A3B8" },
  switch: { width: 36, height: 20, borderRadius: 10, padding: 2, marginLeft: 2 },
  switchDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFF" },
})
