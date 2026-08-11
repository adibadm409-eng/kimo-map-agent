import React from "react"
import { View, Text, Pressable, TextInput, Modal } from "react-native"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"
import { toDMS } from "../utils"

interface Props {
  visible: boolean
  onClose: () => void
  onGoto: () => void
  gpsLat: string
  setGpsLat: (v: string) => void
  gpsLng: string
  setGpsLng: (v: string) => void
  onUseMyLocation: () => void
  gpsAccuracy: number | null
  location: { latitude: number; longitude: number } | null
  colors: any
}

export function GpsPickerModal({
  visible, onClose, onGoto, gpsLat, setGpsLat, gpsLng, setGpsLng,
  onUseMyLocation, gpsAccuracy, location, colors,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>إحداثيات الموقع</Text>
          <Text style={{ color: colors.textMuted, fontFamily: "Tajawal_400Regular", marginBottom: spacing.md }}>
            أدخل الإحداثيات يدوياً أو اضغط على الخريطة
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontFamily: "Tajawal_500Medium", fontSize: 14, marginBottom: 4 }}>خط العرض</Text>
              <TextInput value={gpsLat} onChangeText={setGpsLat} keyboardType="numeric" placeholder="24.713600" placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontFamily: "Tajawal_500Medium", fontSize: 14, marginBottom: 4 }}>خط الطول</Text>
              <TextInput value={gpsLng} onChangeText={setGpsLng} keyboardType="numeric" placeholder="46.675300" placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]} />
            </View>
          </View>
          {gpsLat && gpsLng && !isNaN(parseFloat(gpsLat)) && !isNaN(parseFloat(gpsLng)) && (
            <Text style={{ color: colors.textMuted, fontFamily: "monospace", fontSize: 9, marginBottom: spacing.sm, textAlign: "center" }}>
              DMS: {toDMS(parseFloat(gpsLat), true)}  {toDMS(parseFloat(gpsLng), false)}
            </Text>
          )}
          {gpsAccuracy && (
            <Text style={{ color: colors.textMuted, fontFamily: "Tajawal_400Regular", fontSize: 12, marginBottom: spacing.sm }}>
              الدقة: {gpsAccuracy.toFixed(1)} م
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={onGoto} style={{ flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: 999, alignItems: "center" }}>
              <Text style={{ color: "#FFF", fontWeight: "700", fontFamily: "Tajawal_700Bold" }}>انتقال</Text>
            </Pressable>
            <Pressable onPress={onUseMyLocation} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.md, borderRadius: 999, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600", fontFamily: "Tajawal_700Bold" }}>موقعي</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={{ marginTop: spacing.md, padding: spacing.sm, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontFamily: "Tajawal_400Regular" }}>إلغاء</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
