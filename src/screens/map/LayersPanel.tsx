import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { spacing, radius, fontSize } from "../../theme/tokens"

type Theme = {
  bg: string
  bgSecondary: string
  border: string
  textPrimary: string
  textSecondary: string
  accent: string
}

export type LayerVisibility = {
  properties: boolean
  waypoints: boolean
  areas: boolean
  tracks: boolean
  labels: boolean
}

export type PropertyFilter = {
  status: string
  type: string
  priceMax: number
}

type Props = {
  visible: boolean
  theme: Theme
  insets: { top: number; bottom: number }
  mapType: string
  onMapTypeChange: (t: "standard" | "satellite" | "terrain") => void
  layerVisibility: LayerVisibility
  onLayerToggle: (key: keyof LayerVisibility) => void
  counts: { properties: number; waypoints: number; areas: number; tracks: number }
  propertyFilter: PropertyFilter
  onFilterChange: (f: Partial<PropertyFilter>) => void
  onClose: () => void
}

const STATUS_OPTS = [
  { key: "",        label: "الكل" },
  { key: "for_sale", label: "للبيع" },
  { key: "sold",    label: "مُباع" },
  { key: "rented",  label: "مؤجر" },
  { key: "pending", label: "تحت المعالجة" },
]
const TYPE_OPTS = [
  { key: "",          label: "الكل" },
  { key: "apartment",  label: "شقة" },
  { key: "villa",      label: "فيلا" },
  { key: "land",       label: "أرض" },
  { key: "office",     label: "مكتب" },
  { key: "commercial", label: "محل تجاري" },
]
const PRICE_OPTS = [
  { key: 0,        label: "أي سعر" },
  { key: 500000,   label: "< 500 ألف" },
  { key: 1000000,  label: "< مليون" },
  { key: 5000000,  label: "< 5 مليون" },
  { key: 10000000, label: "< 10 مليون" },
]
const MAP_TYPES: { key: "standard" | "satellite" | "terrain"; label: string }[] = [
  { key: "standard",  label: "عادي" },
  { key: "satellite", label: "قمر صناعي" },
  { key: "terrain",   label: "طبوغرافي" },
]

export function LayersPanel({
  visible, theme, insets, mapType, onMapTypeChange,
  layerVisibility, onLayerToggle, counts,
  propertyFilter, onFilterChange, onClose,
}: Props) {
  if (!visible) return null

  const SectionTitle = ({ children }: { children: string }) => (
    <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>{children}</Text>
  )
  const LAYER_ROWS: { key: keyof LayerVisibility; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: "properties", label: "عقارات",  icon: "home-outline",      color: "#16A34A" },
    { key: "waypoints",  label: "نقاط اهتمام", icon: "pin-outline",    color: "#EF4444" },
    { key: "areas",      label: "مناطق",   icon: "shapes-outline",    color: "#3B82F6" },
    { key: "tracks",     label: "مسارات GPS", icon: "git-branch-outline", color: "#F59E0B" },
    { key: "labels",     label: "تسميات",   icon: "text-outline",      color: "#94A3B8" },
  ]

  return (
    <View style={[s.wrap, { bottom: insets.bottom + 60 }]}>
      <View style={[s.sheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <View style={s.header}>
          <Text style={[s.title, { color: theme.textPrimary }]}>الطبقات والفلترة</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        <SectionTitle>نوع الخريطة</SectionTitle>
        <View style={s.chips}>
          {MAP_TYPES.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => onMapTypeChange(t.key)}
              style={[s.chip, mapType === t.key && s.chipActive, { borderColor: mapType === t.key ? theme.accent : theme.border }]}
            >
              <Text style={[s.chipText, { color: mapType === t.key ? theme.accent : theme.textPrimary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[s.divider, { borderBottomColor: theme.border }]}>
          <SectionTitle>العرض</SectionTitle>
          {LAYER_ROWS.map((row) => {
            const visible = layerVisibility[row.key]
            return (
              <Pressable
                key={row.key}
                style={s.row}
                onPress={() => onLayerToggle(row.key)}
                hitSlop={8}
              >
                <View style={s.rowRight}>
                  <Ionicons name={row.icon} size={18} color={row.color} />
                  <Text style={[s.rowLabel, { color: theme.textPrimary }]}>{row.label}</Text>
                  <Text style={[s.count, { color: theme.textSecondary }]}>
                    ({(row.key === "properties" || row.key === "waypoints" || row.key === "areas" || row.key === "tracks") ? counts[row.key] : ""})
                  </Text>
                </View>
                <Ionicons
                  name={visible ? "checkbox" : "square-outline"}
                  size={20}
                  color={visible ? theme.accent : theme.textSecondary}
                />
              </Pressable>
            )
          })}
        </View>

        <View style={[s.divider, { borderBottomColor: theme.border }]}>
          <SectionTitle>فلترة العقارات</SectionTitle>
          <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>الحالة</Text>
          <View style={s.chips}>
            {STATUS_OPTS.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => onFilterChange({ status: o.key })}
                style={[s.chip, propertyFilter.status === o.key && s.chipActive, { borderColor: propertyFilter.status === o.key ? theme.accent : theme.border }]}
              >
                <Text style={[s.chipText, { color: propertyFilter.status === o.key ? theme.accent : theme.textPrimary }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.fieldLabel, { color: theme.textSecondary, marginTop: spacing.sm }]}>النوع</Text>
          <View style={s.chips}>
            {TYPE_OPTS.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => onFilterChange({ type: o.key })}
                style={[s.chip, propertyFilter.type === o.key && s.chipActive, { borderColor: propertyFilter.type === o.key ? theme.accent : theme.border }]}
              >
                <Text style={[s.chipText, { color: propertyFilter.type === o.key ? theme.accent : theme.textPrimary }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.fieldLabel, { color: theme.textSecondary, marginTop: spacing.sm }]}>السعر</Text>
          <View style={s.chips}>
            {PRICE_OPTS.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => onFilterChange({ priceMax: o.key })}
                style={[s.chip, propertyFilter.priceMax === o.key && s.chipActive, { borderColor: propertyFilter.priceMax === o.key ? theme.accent : theme.border }]}
              >
                <Text style={[s.chipText, { color: propertyFilter.priceMax === o.key ? theme.accent : theme.textPrimary }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.sm, right: spacing.sm, zIndex: 120, maxHeight: 420 },
  sheet: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, elevation: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", fontFamily: "Tajawal_700Bold", marginTop: spacing.xs, marginBottom: spacing.xs },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 999, borderWidth: 1 },
  chipActive: { borderWidth: 1.5 },
  chipText: { fontSize: fontSize.xs, fontFamily: "Tajawal_500Medium" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  rowRight: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  rowLabel: { fontSize: fontSize.sm, fontFamily: "Tajawal_500Medium" },
  count: { fontSize: 10, fontFamily: "monospace" },
  fieldLabel: { fontSize: 11, fontFamily: "Tajawal_700Bold", marginBottom: 4 },
  divider: { marginTop: spacing.sm, paddingTop: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
})
