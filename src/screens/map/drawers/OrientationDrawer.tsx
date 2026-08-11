import React from "react"
import { View, Text, Pressable, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { styles } from "../styles"

interface Props {
  compassEnabled: boolean
  setCompassEnabled: (v: boolean) => void
  mapRotation: boolean
  setMapRotation: (v: boolean) => void
  headingValue: number
  closePanel: () => void
}

export function OrientationDrawer({ compassEnabled, setCompassEnabled, mapRotation, setMapRotation, headingValue, closePanel }: Props) {
  function headingDir(h: number): string {
    if (h === 0) return "شمال"
    if (h < 45) return "شمال شرق"
    if (h < 90) return "شرق"
    if (h < 135) return "جنوب شرق"
    if (h < 180) return "جنوب"
    if (h < 225) return "جنوب غرب"
    if (h < 270) return "غرب"
    if (h < 315) return "شمال غرب"
    return "شمال"
  }

  return (
    <View style={styles.drawerPanel}>
      <View style={[styles.drawerHeader, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={[styles.drawerTitle, { color: "#FFFFFF" }]}>اتجاه</Text>
        <Pressable onPress={closePanel} style={styles.drawerCloseBtn}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>المستشعرات</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>بوصلة</Text>
            <Pressable onPress={() => setCompassEnabled(!compassEnabled)} style={[styles.toggleTrack, compassEnabled && styles.toggleTrackActive]}>
              {compassEnabled && <View style={styles.toggleDot} />}
            </Pressable>
          </View>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الحالة</Text>
            <Text style={styles.drawerValue}>{compassEnabled ? "مفعّلة" : "معطّلة"}</Text>
          </View>
          <View style={[styles.toggleRow, { marginTop: 12 }]}>
            <Text style={styles.toggleLabel}>تدوير الخريطة</Text>
            <Pressable onPress={() => setMapRotation(!mapRotation)} style={[styles.toggleTrack, mapRotation && styles.toggleTrackActive]}>
              {mapRotation && <View style={styles.toggleDot} />}
            </Pressable>
          </View>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الحالة</Text>
            <Text style={styles.drawerValue}>{mapRotation ? "مفعّل" : "معطّل"}</Text>
          </View>
        </View>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>الميل (Heading)</Text>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الاتجاه الحالي</Text>
            <Text style={styles.drawerValue}>{headingValue.toFixed(0)}°</Text>
          </View>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الاتجاه</Text>
            <Text style={styles.drawerValue}>{headingDir(headingValue)}</Text>
          </View>
          <Text style={{ color: "#94A3B8", fontFamily: "Tajawal_400Regular", fontSize: 12, marginTop: 8 }}>
            يظهر الميل فقط عند تفعيل البوصلة
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
