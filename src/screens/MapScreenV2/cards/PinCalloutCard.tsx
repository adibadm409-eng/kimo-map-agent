import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { PinItem } from "./shareMedia"
import { fmtPrice, pinKindText, pinStatusText } from "./shareMedia"

// بطاقة معلومات سريعة تظهر داخل Callout — المحرك يرسمها مرتبطة بالدبوس نفسه
// ويلازمها عند تحرك الخريطة، دون أي حساب إحداثيات شاشة من جهة التطبيق.
export function PinCalloutCard({ item }: { item: PinItem }) {
  const data: any = item.data
  const isProp = item.kind === "property"
  const color = isProp ? "#16A34A" : "#EF4444"
  const typeText = pinKindText(item.kind, data)
  const statusText = pinStatusText(item.kind, data)
  const price = fmtPrice(Number(data.price))

  return (
    <View style={s.card}>
      <Text style={s.name} numberOfLines={2}>{item.name}</Text>
      <View style={s.chipsRow}>
        <View style={[s.chip, { backgroundColor: color + "14", borderColor: color + "44" }]}>
          <Ionicons name={isProp ? "business-outline" : "location-outline"} size={11} color={color} />
          <Text style={[s.chipText, { color }]}>{typeText}</Text>
        </View>
        {statusText !== "" && (
          <View style={[s.chip, { backgroundColor: "#F1F5F9", borderColor: "#E2E8F0" }]}>
            <Text style={[s.chipText, { color: "#475569" }]}>{statusText}</Text>
          </View>
        )}
      </View>
      {price !== "" && <Text style={s.price}>{price}</Text>}
      <View style={s.footer}>
        <Ionicons name="expand-outline" size={12} color="#2563EB" />
        <Text style={s.footerText}>اضغط للمزيد من التفاصيل</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: { width: 230, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12, elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  name: { fontSize: 14, fontFamily: "Tajawal_700Bold", color: "#0F172A", textAlign: "right" },
  chipsRow: { flexDirection: "row-reverse", gap: 6, marginTop: 7, marginBottom: 6 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 10, fontFamily: "Tajawal_700Bold" },
  price: { fontSize: 17, fontFamily: "Tajawal_700Bold", color: "#2563EB", textAlign: "right", marginBottom: 6 },
  footer: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0", paddingTop: 7 },
  footerText: { fontSize: 10, fontFamily: "Tajawal_500Medium", color: "#2563EB" },
})