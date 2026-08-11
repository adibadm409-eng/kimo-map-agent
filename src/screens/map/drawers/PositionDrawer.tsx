import React from "react"
import { View, Text, Pressable, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"
import { fmtDistCalc } from "../utils"

interface Props {
  gpsActive: boolean
  setGpsActive: (v: boolean) => void
  getCurrentLocation: () => void
  location: { latitude: number; longitude: number } | null
  gpsAccuracy: number | null
  tracking: boolean
  toggleTrack: () => void
  trackDist: number
  trackPoints: any[]
  trackDuration: number
  barometerStatus: string
  closePanel: () => void
}

export function PositionDrawer({
  gpsActive, setGpsActive, getCurrentLocation,
  location, gpsAccuracy, tracking, toggleTrack, trackDist,
  trackPoints, trackDuration, barometerStatus, closePanel,
}: Props) {
  return (
    <View style={styles.drawerPanel}>
      <View style={[styles.drawerHeader, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={[styles.drawerTitle, { color: "#FFFFFF" }]}>تموضع</Text>
        <Pressable onPress={closePanel} style={styles.drawerCloseBtn}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>الإشارات المرجعية للجهاز</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>GPS</Text>
            <Pressable
              onPress={() => {
                if (!gpsActive) { getCurrentLocation(); setGpsActive(true) }
                else { setGpsActive(false) }
              }}
              style={[styles.toggleTrack, gpsActive && styles.toggleTrackActive]}
            >
              {gpsActive && <View style={styles.toggleDot} />}
            </Pressable>
          </View>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الحالة</Text>
            <Text style={styles.drawerValue}>{gpsActive ? "مفعّل" : "معطّل"}</Text>
          </View>
          {gpsActive && location && (
            <>
              <View style={styles.drawerRow}>
                <Text style={styles.drawerLabel}>خط العرض</Text>
                <Text style={[styles.drawerValue, { fontSize: 10 }]}>{location.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.drawerRow}>
                <Text style={styles.drawerLabel}>خط الطول</Text>
                <Text style={[styles.drawerValue, { fontSize: 10 }]}>{location.longitude.toFixed(6)}</Text>
              </View>
              <View style={styles.drawerRow}>
                <Text style={styles.drawerLabel}>الدقة</Text>
                <Text style={styles.drawerValue}>{gpsAccuracy ? gpsAccuracy.toFixed(1) + " م" : "—"}</Text>
              </View>
            </>
          )}
        </View>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>تسجيل المسار</Text>
          <Pressable onPress={toggleTrack} style={[styles.drawBtn, tracking && styles.drawBtnActive]}>
            <Ionicons name={tracking ? "stop" : "radio-button-on"} size={18} color={tracking ? "#FFF" : "#94A3B8"} />
            <Text style={styles.drawBtnText}>{tracking ? "إيقاف التسجيل" : "بدء التسجيل"}</Text>
          </Pressable>
          {tracking && (
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>المسافة</Text>
                <Text style={styles.statValue}>{fmtDistCalc(trackDist)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>النقاط</Text>
                <Text style={styles.statValue}>{trackPoints.length}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>المدة</Text>
                <Text style={styles.statValue}>
                  {Math.floor(trackDuration / 60)}:{trackDuration % 60 < 10 ? "0" : ""}{trackDuration % 60}
                </Text>
              </View>
            </View>
          )}
        </View>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>بارومتر</Text>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الحالة</Text>
            <Text style={styles.drawerValue}>{barometerStatus}</Text>
          </View>
          <Text style={{ color: "#94A3B8", fontFamily: "Tajawal_400Regular", fontSize: 12, marginTop: spacing.xs }}>
            الضغط الجوي الحالي غير متاح على هذا الجهاز
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
