import React from "react"
import { View, Text, Pressable, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as FileSystem from "expo-file-system/legacy"
import { MAP_LAYERS, MapLayer } from "../constants"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"

interface Props {
  layerOpacity: number
  setLayerOpacity: (fn: (o: number) => number) => void
  mapLayer: MapLayer
  setMapLayer: (l: MapLayer) => void
  closePanel: () => void
  offlineMapInfo: string
}

export function MapsDrawer({ layerOpacity, setLayerOpacity, mapLayer, setMapLayer, closePanel, offlineMapInfo }: Props) {
  return (
    <View style={styles.drawerPanel}>
      <View style={[styles.drawerHeader, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={[styles.drawerTitle, { color: "#FFFFFF" }]}>خرائط</Text>
        <Pressable onPress={closePanel} style={styles.drawerCloseBtn}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>شفافية الطبقة</Text>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>10%</Text>
            <View style={styles.opacityBar}>
              <View style={[styles.opacityFill, { width: `${layerOpacity * 100}%` }]} />
            </View>
            <Text style={styles.drawerValue}>90%</Text>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={() => setLayerOpacity((o) => Math.max(0.1, o - 0.1))} style={styles.opacityBtn}>
              <Text style={styles.opacityBtnText}>−</Text>
            </Pressable>
            <Pressable onPress={() => setLayerOpacity((o) => Math.min(1, o + 0.1))} style={styles.opacityBtn}>
              <Text style={styles.opacityBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>طبقات الخريطة</Text>
          {MAP_LAYERS.map((layer) => (
            <Pressable
              key={layer.key}
              onPress={() => { setMapLayer(layer.key as MapLayer); closePanel() }}
              style={[styles.layerItem, mapLayer === layer.key && styles.layerItemActive]}
            >
              <Ionicons name={layer.icon as any} size={18} color={mapLayer === layer.key ? "#3B82F6" : "#94A3B8"} />
              <View>
                <Text style={styles.layerItemName}>{layer.label}</Text>
                <Text style={styles.layerItemDesc}>
                  {layer.key === "osm" ? "خريطة OpenStreetMap العادية" :
                   layer.key === "satellite" ? "صور الأقمار الصناعية ESRI" :
                   layer.key === "dark" ? "خريطة داكنة CARTO" :
                   "خريطة طبوغرافية OpenTopoMap"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.drawerSection}>
          <Text style={styles.drawerSectionTitle}>التخزين خارج الشبكة</Text>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>حجم الخرائط المخزنة</Text>
            <Text style={styles.drawerValue}>{offlineMapInfo}</Text>
          </View>
          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>الموقع</Text>
            <Text style={[styles.drawerValue, { fontSize: 10 }]}>{FileSystem.documentDirectory}offline_maps/</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
