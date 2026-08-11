import React, { useState, useEffect } from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { VECTOR_STYLES } from "../vector/vectorStyles"
import { loadProviderSettings } from "../mapProviders"

const MAPTYPE_OPTS: { key: string; label: string; icon: string }[] = [
  { key: "standard", label: "عادي", icon: "map-outline" },
  { key: "satellite", label: "قمر صناعي", icon: "globe-outline" },
  { key: "latest", label: "الأحدث", icon: "refresh-circle-outline" },
  { key: "osm", label: "شوارع OSM", icon: "map-outline" },
  { key: "carto-positron", label: "Positron", icon: "sunny-outline" },
  { key: "carto-dark", label: "داكن Carto", icon: "contrast-outline" },
  { key: "carto-positron-nl", label: "Positron بلا تسميات", icon: "sunny-outline" },
  { key: "carto-dark-nl", label: "Dark بلا تسميات", icon: "contrast-outline" },
  { key: "carto-voyager-nl", label: "Voyager بلا تسميات", icon: "map-outline" },
  { key: "esri-streets", label: "شوارع Esri", icon: "map-outline" },
  { key: "esri-clarity", label: "قمر واضح", icon: "aperture-outline" },
  { key: "sentinel2", label: "سينتينل-2", icon: "satellite-outline" },
  { key: "sentinel2-2021", label: "S2 2021", icon: "time-outline" },
  { key: "usgs-imagery", label: "جوي أمريكي", icon: "airplane-outline" },
  { key: "gibs-marble", label: "الكرة الزرقاء", icon: "planet-outline" },
  { key: "gibs-lights", label: "أضواء الليل", icon: "moon-outline" },
  { key: "terrain", label: "تضاريس", icon: "earth-outline" },
  { key: "3d", label: "ثلاثي الأبعاد", icon: "cube-outline" },
  { key: "dark", label: "داكن", icon: "moon-outline" },
  { key: "hot", label: "حراري", icon: "flame-outline" },
  { key: "wikimedia", label: "ويكي", icon: "library-outline" },
  ...Object.entries(VECTOR_STYLES).map(([key, v]) => ({ key, label: v.label + " (كلاسيكي)", icon: v.icon })),
]

type Props = {
  mapType: string
  onChange: (t: string) => void
  onClose: () => void
}

export function MapTypeCard({ mapType, onChange, onClose }: Props) {
  // احترام إعدادات «مزوّدو الخرائط»: الأنماط المخفية من زر العين لا تظهر هنا
  const [hiddenMaps, setHiddenMaps] = useState<string[]>([])
  useEffect(() => { loadProviderSettings().then((s) => setHiddenMaps(s.hidden)) }, [])

  const enabledOptions = MAPTYPE_OPTS.filter((o) => !hiddenMaps.includes(o.key))

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>نوع الخريطة</Text>
        <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
          <Ionicons name="close" size={16} color="#64748B" />
        </Pressable>
      </View>
      <View style={s.row}>
        {enabledOptions.map((o) => {
          const active = mapType === o.key
          return (
            <Pressable
              key={o.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                if (!active) onChange(o.key)
              }}
              style={[s.opt, active && { borderColor: "#0891B2", borderWidth: 1.5, backgroundColor: "#ECFEFF" }]}
            >
              <Ionicons name={o.icon as any} size={20} color={active ? "#0891B2" : "#64748B"} />
              <Text style={[s.optText, active && { color: "#0891B2" }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, elevation: 10, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: -3 } },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 14, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  opt: { flex: 1, minWidth: "45%", alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFF", gap: 6 },
  optText: { fontSize: 12, fontFamily: "Tajawal_700Bold", color: "#64748B" },
})