import React, { useState } from "react"
import { View, Text, Pressable, ScrollView, TextInput, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"

interface Props {
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void
  closePanel: () => void
}

export function SearchDrawer({ onFocusCoordinate, closePanel }: Props) {
  const [query, setQuery] = useState("")

  function handleSearch() {
    const q = query.trim()
    if (!q) return
    const parts = q.split(/[,\s]+/).filter(Boolean)
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0])
      const lng = parseFloat(parts[1])
      if (!isNaN(lat) && !isNaN(lng)) {
        onFocusCoordinate(lat, lng, 15)
        setQuery("")
        closePanel()
        return
      }
    }
    Alert.alert("بحث", "جاري البحث عن: " + q)
  }

  return (
    <View style={styles.drawerPanel}>
      <View style={[styles.drawerHeader, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={[styles.drawerTitle, { color: "#FFFFFF" }]}>بحث</Text>
        <Pressable onPress={closePanel} style={styles.drawerCloseBtn}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 12 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="اسم مكان أو إحداثيات (lat,lng)"
            placeholderTextColor="#64748B"
            style={styles.searchInputDrawer}
          />
          <View style={{ flexDirection: "row-reverse", gap: spacing.sm }}>
            <Pressable onPress={handleSearch} style={styles.searchBtnDrawer}>
              <Text style={styles.searchBtnText}>بحث</Text>
            </Pressable>
            <Pressable
              onPress={() => { setQuery(""); closePanel() }}
              style={{ backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
            >
              <Text style={{ color: "#CBD5E1", fontSize: 14, fontWeight: "700", fontFamily: "Tajawal_700Bold", textAlign: "center" }}>إلغاء</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
