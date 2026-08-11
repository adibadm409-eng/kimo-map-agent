import React from "react"
import { KeyboardAvoidingView, Platform, Modal, View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius, SCREEN_HEIGHT as SH } from "../../../theme/tokens"
import { toDMS } from "../../map/utils"
import type { WaypointForm, LatLng } from "../types"

const CATS = [
  { key: "general", label: "عام" },
  { key: "property", label: "عقار" },
  { key: "office", label: "مكتب" },
  { key: "landmark", label: "معلم" },
  { key: "client", label: "عميل" },
  { key: "site_visit", label: "زيارة موقع" },
]

type Props = {
  visible: boolean
  form: WaypointForm
  setForm: (f: WaypointForm) => void
  coord: LatLng | null
  onClose: () => void
  onSave: () => void
}

export function SaveWaypointCard({ visible, form, setForm, coord, onClose, onSave }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.kbRoot}
        pointerEvents="box-none"
      >
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={s.sheetWrap} pointerEvents="box-none">
          <View style={s.sheet}>
            <View style={s.handle} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
            <View style={s.header}>
            <Text style={s.title}>حفظ نقطة جديدة</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          {coord && (
            <View style={s.coordChip}>
              <Ionicons name="location" size={12} color="#2563EB" />
              <Text style={s.coordText}>{toDMS(coord.latitude, true)} · {toDMS(coord.longitude, false)}</Text>
            </View>
          )}

          <Text style={s.label}>الاسم (مطلوب) *</Text>
          <TextInput
            placeholder="اسم النقطة" placeholderTextColor="#94A3B8"
            value={form.name} onChangeText={(v) => setForm({ ...form, name: v })}
            style={s.input}
          />

          <Text style={s.sectionTitle}>معلومات المالك</Text>
          <View style={s.row}>
            <TextInput
              placeholder="اسم المالك" placeholderTextColor="#94A3B8"
              value={form.ownerName} onChangeText={(v) => setForm({ ...form, ownerName: v })}
              style={[s.input, { flex: 1 }]}
            />
            <TextInput
              placeholder="رقم الجوال" placeholderTextColor="#94A3B8" keyboardType="numeric"
              value={form.ownerPhone} onChangeText={(v) => setForm({ ...form, ownerPhone: v })}
              style={[s.input, { flex: 1 }]}
            />
          </View>
          <TextInput
            placeholder="وسائل تواصل إضافية" placeholderTextColor="#94A3B8"
            value={form.ownerContact} onChangeText={(v) => setForm({ ...form, ownerContact: v })}
            style={s.input}
          />

          <Text style={s.sectionTitle}>تفاصيل</Text>
          <TextInput
            placeholder="وصف تفصيلي" placeholderTextColor="#94A3B8" multiline
            value={form.description} onChangeText={(v) => setForm({ ...form, description: v })}
            style={[s.input, { minHeight: 60, textAlignVertical: "top" }]}
          />
          <TextInput
            placeholder="تفاصيل إضافية" placeholderTextColor="#94A3B8" multiline
            value={form.details} onChangeText={(v) => setForm({ ...form, details: v })}
            style={[s.input, { minHeight: 60, textAlignVertical: "top" }]}
          />

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>السعر (ر.ي)</Text>
              <TextInput
                placeholder="0" placeholderTextColor="#94A3B8" keyboardType="numeric"
                value={form.price} onChangeText={(v) => setForm({ ...form, price: v })}
                style={s.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>المساحة (م²)</Text>
              <TextInput
                placeholder="0" placeholderTextColor="#94A3B8" keyboardType="numeric"
                value={form.area} onChangeText={(v) => setForm({ ...form, area: v })}
                style={s.input}
              />
            </View>
          </View>

          <Text style={s.label}>الوسائط</Text>
          <View style={s.mediaRow}>
            {[
              { key: "photo", icon: "camera", label: "صور" },
              { key: "video", icon: "videocam", label: "فيديو" },
              { key: "both", icon: "film", label: "كلاهما" },
            ].map((opt) => {
              const active = form.mediaKind === opt.key
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setForm({ ...form, mediaKind: opt.key as any })}
                  style={[s.chip, active && { borderColor: "#2563EB", borderWidth: 1.5 }]}
                >
                  <Ionicons name={opt.icon as any} size={14} color={active ? "#2563EB" : "#64748B"} />
                  <Text style={[s.chipText, { color: active ? "#2563EB" : "#64748B" }]}>{opt.label}</Text>
                </Pressable>
              )
            })}
          </View>

          <View style={s.mediaUploader}>
            <Ionicons name="cloud-upload-outline" size={24} color="#2563EB" />
            <Text style={s.placeholderText}>ارفع الصور/الفيديوهات</Text>
            <View style={s.row}>
              <Pressable
                onPress={async () => {
                  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
                  if (!perm.granted) { Alert.alert("إذن", "السماح بالوصول للصور"); return }
                  const r = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.All,
                    quality: 0.6, allowsMultipleSelection: true, selectionLimit: 8,
                  })
                  if (!r.canceled) {
                    const uris = r.assets.map((a) => a.uri)
                    setForm({ ...form, mediaUris: [...form.mediaUris, ...uris] })
                  }
                }}
                style={[s.mediaButton, { backgroundColor: "#2563EB" }]}
              >
                <Ionicons name="images-outline" size={14} color="#FFF" />
                <Text style={s.mediaButtonText}>المعرض</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const perm = await ImagePicker.requestCameraPermissionsAsync()
                  if (!perm.granted) { Alert.alert("إذن", "السماح بالكاميرا"); return }
                  const r = await ImagePicker.launchCameraAsync({ quality: 0.6 })
                  if (!r.canceled && r.assets[0]) {
                    setForm({ ...form, mediaUris: [...form.mediaUris, r.assets[0].uri] })
                  }
                }}
                style={[s.mediaButton, { borderColor: "#2563EB", borderWidth: 1.5 }]}
              >
                <Ionicons name="camera-outline" size={14} color="#2563EB" />
                <Text style={[s.mediaButtonText, { color: "#2563EB" }]}>الكاميرا</Text>
              </Pressable>
            </View>
            {form.mediaUris.length > 0 && (
              <ScrollView horizontal style={{ marginTop: spacing.sm }} showsHorizontalScrollIndicator={false}>
                <View style={s.thumbRow}>
                  {form.mediaUris.map((uri, i) => (
                    <View key={i} style={s.thumb}>
                      <Image source={{ uri }} style={s.thumbImg} />
                      <Pressable
                        hitSlop={6}
                        onPress={() => setForm({ ...form, mediaUris: form.mediaUris.filter((_, idx) => idx !== i) })}
                        style={s.thumbRemove}
                      >
                        <Ionicons name="close-circle" size={16} color="#DC2626" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <Text style={s.label}>الفئة</Text>
          <View style={s.chipsRow}>
            {CATS.map((c) => {
              const active = form.category === c.key
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setForm({ ...form, category: c.key })}
                  style={[s.chip, active && { borderColor: "#2563EB", borderWidth: 1.5 }]}
                >
                  <Text style={[s.chipText, { color: active ? "#2563EB" : "#64748B" }]}>{c.label}</Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={s.label}>التقييم</Text>
          <View style={s.row}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setForm({ ...form, rating: form.rating === n ? 0 : n })}>
                <Ionicons name={n <= form.rating ? "star" : "star-outline"} size={22} color={n <= form.rating ? "#F59E0B" : "#94A3B8"} />
              </Pressable>
            ))}
          </View>

          <View style={s.actions}>
            <Pressable onPress={onClose} style={[s.btn, { backgroundColor: "#F8FAFC", flex: 1 }]}>
              <Text style={[s.btnText, { color: "#475569" }]}>إلغاء</Text>
            </Pressable>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave() }}
              style={[s.btn, { backgroundColor: "#2563EB", flex: 1.5 }]}
            >
              <Ionicons name="save" size={16} color="#FFF" />
              <Text style={s.btnText}>حفظ النقطة</Text>
            </Pressable>
          </View>
        </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

import { Image } from "react-native"

const s = StyleSheet.create({
  kbRoot: { flex: 1, justifyContent: "flex-end" },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: 12, maxHeight: "85%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.55)" },
  sheet: { backgroundColor: "#FFF", borderRadius: 18, padding: 16, maxHeight: "100%" },
  handle: { alignSelf: "center", width: 40, height: 4, backgroundColor: "#CBD5E1", borderRadius: 2, marginBottom: 12 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  coordChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, padding: spacing.xs + 2, borderRadius: radius.sm, backgroundColor: "#EFF6FF", alignSelf: "center", marginBottom: spacing.sm },
  coordText: { fontSize: 10, fontFamily: "monospace", color: "#2563EB" },
  label: { fontSize: fontSize.xs, fontFamily: "Tajawal_700Bold", color: "#475569", marginTop: spacing.sm, marginBottom: 4 },
  sectionTitle: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#0F172A", marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, fontFamily: "Tajawal_400Regular", textAlign: "right" },
  row: { flexDirection: "row", gap: spacing.sm },
  mediaRow: { flexDirection: "row-reverse", gap: spacing.xs },
  mediaUploader: { padding: spacing.md, marginTop: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#E2E8F0", borderStyle: "dashed", alignItems: "center", gap: 4 },
  placeholderText: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", color: "#94A3B8" },
  mediaButton: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent" },
  mediaButtonText: { fontSize: fontSize.xs, fontFamily: "Tajawal_700Bold", color: "#FFF" },
  thumbRow: { flexDirection: "row-reverse", gap: 6 },
  thumb: { position: "relative", borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },
  thumbImg: { width: 50, height: 50, borderRadius: 6 },
  thumbRemove: { position: "absolute", top: -6, right: -6, borderRadius: 9, backgroundColor: "#FFF" },
  chipsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md - 2, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 4 },
  chipText: { fontSize: fontSize.xs, fontFamily: "Tajawal_500Medium" },
  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: 999 },
  btnText: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#FFF" },
})
