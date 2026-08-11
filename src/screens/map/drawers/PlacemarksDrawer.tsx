import React from "react"
import { View, Text, Pressable, ScrollView, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"
import { deleteWaypoint, deleteArea } from "../../../database/db"

interface Props {
  waypoints: any[]
  areas: any[]
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void
  loadInitialData: () => Promise<void>
  closePanel: () => void
}

export function PlacemarksDrawer({ waypoints, areas, onFocusCoordinate, loadInitialData, closePanel }: Props) {
  async function handleDeleteWp(id: string) {
    try {
      await deleteWaypoint(id)
      await loadInitialData()
    } catch (e) {
      Alert.alert("خطأ", "تعذر حذف النقطة")
    }
  }

  async function handleDeleteArea(id: string) {
    try {
      await deleteArea(id)
      await loadInitialData()
    } catch (e) {
      Alert.alert("خطأ", "تعذر حذف المنطقة")
    }
  }

  return (
    <View style={styles.drawerPanel}>
      <View style={[styles.drawerHeader, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={[styles.drawerTitle, { color: "#FFFFFF" }]}>نقاط</Text>
        <Pressable onPress={closePanel} style={styles.drawerCloseBtn}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>نقاط الطرق ({waypoints.length})</Text>
          {waypoints.length === 0 && (
            <Text style={{ color: "#94A3B8", fontFamily: "Tajawal_400Regular", fontSize: 14, textAlign: "center", paddingVertical: spacing.lg }}>
              لا توجد نقاط محفوظة
            </Text>
          )}
          {waypoints.map((wp: any) => (
            <View key={wp.id} style={styles.waypointItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.waypointName}>{wp.name}</Text>
                <Text style={styles.waypointCoords}>{Number(wp.latitude).toFixed(5)}, {Number(wp.longitude).toFixed(5)}</Text>
              </View>
              <Pressable onPress={() => onFocusCoordinate(wp.latitude, wp.longitude, 16)} style={styles.waypointDelete}>
                <Ionicons name="eye" size={16} color="#3B82F6" />
              </Pressable>
              <Pressable onPress={() => handleDeleteWp(wp.id)} style={styles.waypointDelete}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>المساحات ({areas.length})</Text>
          {areas.length === 0 && (
            <Text style={{ color: "#94A3B8", fontFamily: "Tajawal_400Regular", fontSize: 14, textAlign: "center", paddingVertical: spacing.lg }}>
              لا توجد مناطق محفوظة
            </Text>
          )}
          {areas.map((ar: any) => (
            <View key={ar.id} style={styles.waypointItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.waypointName}>{ar.name}</Text>
                <Text style={styles.waypointCoords}>{ar.area_sqm ? Number(ar.area_sqm).toFixed(0) + " م²" : ""}</Text>
              </View>
              <Pressable
                onPress={() => {
                  try {
                    const geo = JSON.parse(ar.geojson)
                    if (geo.type === "Polygon" && geo.coordinates[0].length > 0) {
                      const c = geo.coordinates[0][0]
                      onFocusCoordinate(c[1], c[0], 15)
                    }
                  } catch (e) {}
                }}
                style={styles.waypointDelete}
              >
                <Ionicons name="eye" size={16} color="#3B82F6" />
              </Pressable>
              <Pressable onPress={() => handleDeleteArea(ar.id)} style={styles.waypointDelete}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
