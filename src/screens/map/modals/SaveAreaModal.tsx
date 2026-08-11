import React from "react"
import { View, Text, Pressable, TextInput, Modal } from "react-native"
import { styles } from "../styles"
import { spacing } from "../../../theme/tokens"
import { fmtDistCalc } from "../utils"

interface Props {
  visible: boolean
  onClose: () => void
  onSave: () => void
  areaName: string
  setAreaName: (v: string) => void
  areaDesc: string
  setAreaDesc: (v: string) => void
  measuredArea: number
  saveDist: number
  pendingMedia: string[]
  onAddMedia: () => void
  colors: any
}

export function SaveAreaModal({
  visible, onClose, onSave, areaName, setAreaName, areaDesc, setAreaDesc,
  measuredArea, saveDist, pendingMedia, onAddMedia, colors,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>حفظ المنطقة</Text>
          <TextInput
            placeholder="اسم المنطقة"
            placeholderTextColor={colors.textMuted}
            value={areaName}
            onChangeText={setAreaName}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border, marginBottom: spacing.sm }]}
          />
          <TextInput
            placeholder="الوصف (اختياري)"
            placeholderTextColor={colors.textMuted}
            value={areaDesc}
            onChangeText={setAreaDesc}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border, marginBottom: spacing.sm, minHeight: 60, textAlignVertical: "top" }]}
            multiline
          />
          <Text style={{ color: colors.textMuted, fontFamily: "Tajawal_400Regular", fontSize: 12, marginBottom: spacing.xs }}>
            المساحة: {fmtDistCalc(measuredArea).replace("كم", "هكتار")} | المحيط: {fmtDistCalc(saveDist)}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
            <Pressable onPress={onAddMedia} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.sm, borderRadius: 999, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textPrimary, fontFamily: "Tajawal_700Bold", fontSize: 14 }}>إضافة صور</Text>
            </Pressable>
            {pendingMedia.length > 0 && (
              <Text style={{ color: colors.accent, fontFamily: "Tajawal_700Bold", fontSize: 14, alignSelf: "center" }}>{pendingMedia.length} ملفات</Text>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.md, borderRadius: 999, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontFamily: "Tajawal_700Bold" }}>إلغاء</Text>
            </Pressable>
            <Pressable onPress={onSave} style={{ flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: 999, alignItems: "center" }}>
              <Text style={{ color: "#FFF", fontFamily: "Tajawal_700Bold" }}>حفظ المنطقة</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
