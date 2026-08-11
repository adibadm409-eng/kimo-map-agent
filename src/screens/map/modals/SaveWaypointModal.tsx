import React from "react"
import { View, Text, Pressable, TextInput, Modal, Alert } from "react-native"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"
import { toDMS } from "../utils"

interface Props {
  visible: boolean
  onClose: () => void
  onSave: () => void
  gpsLat: string
  setGpsLat: (v: string) => void
  gpsLng: string
  setGpsLng: (v: string) => void
  waypointName: string
  setWaypointName: (v: string) => void
  waypointDesc: string
  setWaypointDesc: (v: string) => void
  pendingMedia: string[]
  onAddMedia: () => void
  gpsAccuracy: number | null
  colors: any
}

export function SaveWaypointModal({
  visible, onClose, onSave, gpsLat, setGpsLat, gpsLng, setGpsLng,
  waypointName, setWaypointName, waypointDesc, setWaypointDesc,
  pendingMedia, onAddMedia, gpsAccuracy, colors,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>حفظ نقطة</Text>
          <TextInput
            placeholder="الاسم (مثال: مكتب العميل)"
            placeholderTextColor={colors.textMuted}
            value={waypointName}
            onChangeText={setWaypointName}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border, marginBottom: spacing.sm }]}
          />
          <TextInput
            placeholder="الوصف (اختياري)"
            placeholderTextColor={colors.textMuted}
            value={waypointDesc}
            onChangeText={setWaypointDesc}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border, marginBottom: spacing.sm, minHeight: 60, textAlignVertical: "top" }]}
            multiline
          />
          <Text style={{ color: colors.textMuted, fontFamily: "monospace", fontSize: 9, marginBottom: spacing.xs, textAlign: "center" }}>
            {toDMS(parseFloat(gpsLat) || 0, true)}  {toDMS(parseFloat(gpsLng) || 0, false)}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
            <Pressable onPress={onAddMedia} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.sm, borderRadius: 999, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textPrimary, fontFamily: "Tajawal_700Bold", fontSize: 14 }}>إضافة صورة</Text>
            </Pressable>
            {pendingMedia.length > 0 && (
              <Text style={{ color: colors.accent, fontFamily: "Tajawal_700Bold", fontSize: 14, alignSelf: "center" }}>{pendingMedia.length} صور</Text>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.md, borderRadius: 999, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontFamily: "Tajawal_700Bold" }}>إلغاء</Text>
            </Pressable>
            <Pressable onPress={onSave} style={{ flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: 999, alignItems: "center" }}>
              <Text style={{ color: "#FFF", fontFamily: "Tajawal_700Bold" }}>حفظ النقطة</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
