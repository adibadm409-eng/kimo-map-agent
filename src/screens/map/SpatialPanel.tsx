import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { spacing, radius, fontSize } from "../../theme/tokens"
type LatLng = { latitude: number; longitude: number }

type Theme = {
  bg: string
  bgSecondary: string
  border: string
  textPrimary: string
  textSecondary: string
  accent: string
}

type Props = {
  visible: boolean
  theme: Theme
  insets: { top: number; bottom: number }
  originLat: number
  originLng: number
  nearestProperties: { id: string; name: string; dist: number }[]
  nearestWaypoints: { id: string; name: string; dist: number }[]
  insideAreas: { id: string; name: string }[]
  onSelectProperty: (id: string) => void
  onSelectWaypoint: (id: string) => void
  onFocusArea: (id: string) => void
  onClose: () => void
}

export function SpatialPanel({
  visible, theme, insets,
  originLat, originLng,
  nearestProperties, nearestWaypoints, insideAreas,
  onSelectProperty, onSelectWaypoint, onFocusArea,
  onClose,
}: Props) {
  if (!visible) return null
  return (
    <View style={[s.wrap, { bottom: insets.bottom + 60 }]}>
      <View style={[s.sheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <View style={s.header}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
            <Ionicons name="analytics-outline" size={16} color="#8B5CF6" />
            <Text style={[s.title, { color: theme.textPrimary }]}>تحليلات مكانية</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={[s.coordBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <Ionicons name="location-outline" size={14} color={theme.accent} />
          <Text style={[s.coordText, { color: theme.textSecondary }]}>{originLat.toFixed(5)}, {originLng.toFixed(5)}</Text>
        </View>

        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {nearestProperties.length > 0 && (
            <View style={{ marginBottom: spacing.md }}>
              <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>🏠 أقرب 3 عقارات</Text>
              {nearestProperties.map((p) => (
                <Pressable key={p.id} onPress={() => onSelectProperty(p.id)} style={[s.row, { borderBottomColor: theme.border }]}>
                  <Ionicons name="business-outline" size={16} color="#16A34A" />
                  <Text style={[s.rowName, { color: theme.textPrimary }]}>{p.name}</Text>
                  <Text style={[s.rowDist, { color: theme.textSecondary }]}>{(p.dist < 1 ? `${(p.dist * 1000).toFixed(0)} م` : `${p.dist.toFixed(2)} كم`)}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {nearestWaypoints.length > 0 && (
            <View style={{ marginBottom: spacing.md }}>
              <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>📌 أقرب 3 نقاط</Text>
              {nearestWaypoints.map((w) => (
                <Pressable key={w.id} onPress={() => onSelectWaypoint(w.id)} style={[s.row, { borderBottomColor: theme.border }]}>
                  <Ionicons name="pin-outline" size={16} color="#EF4444" />
                  <Text style={[s.rowName, { color: theme.textPrimary }]}>{w.name}</Text>
                  <Text style={[s.rowDist, { color: theme.textSecondary }]}>{(w.dist < 1 ? `${(w.dist * 1000).toFixed(0)} م` : `${w.dist.toFixed(2)} كم`)}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {insideAreas.length > 0 ? (
            <View>
              <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>🟦 داخل أي مناطق؟</Text>
              {insideAreas.map((a) => (
                <Pressable key={a.id} onPress={() => onFocusArea(a.id)} style={[s.row, { borderBottomColor: theme.border }]}>
                  <Ionicons name="shapes-outline" size={16} color="#3B82F6" />
                  <Text style={[s.rowName, { color: theme.textPrimary }]}>{a.name}</Text>
                  <Ionicons name="chevron-back" size={14} color={theme.textSecondary} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={[s.emptyBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>نقطة المركز خارج أي منطقة محفوظة</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.sm, right: spacing.sm, zIndex: 130, maxHeight: 480 },
  sheet: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, elevation: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  coordBox: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, marginBottom: spacing.sm },
  coordText: { fontSize: 11, fontFamily: "monospace" },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", fontFamily: "Tajawal_700Bold", marginBottom: 4 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowName: { flex: 1, fontSize: fontSize.sm, fontFamily: "Tajawal_500Medium", textAlign: "right" },
  rowDist: { fontSize: fontSize.xs, fontFamily: "monospace" },
  emptyBox: { flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1 },
  emptyText: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular" },
})
