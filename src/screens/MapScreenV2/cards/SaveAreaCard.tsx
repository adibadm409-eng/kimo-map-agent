import React from "react"
import { KeyboardAvoidingView, Platform, Modal, View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius } from "../../../theme/tokens"
import { fmtDistCalc } from "../../map/utils"
import type { AreaForm, SaveTarget } from "../types"
import { TYPE_LABELS } from "../../../types"

const AREA_CATS = [
  { key: "general", label: "عام" },
  { key: "residential", label: "سكني" },
  { key: "commercial", label: "تجاري" },
  { key: "agricultural", label: "زراعي" },
  { key: "industrial", label: "صناعي" },
]

type Props = {
  visible: boolean
  mode: "choose" | "attach" | "form"
  form: AreaForm
  setForm: (f: AreaForm) => void
  pending: { coords: any[]; area: number; perimeter: number } | null
  saveTarget: SaveTarget
  setSaveTarget: (t: SaveTarget) => void
  attachPropId: string | null
  setAttachPropId: (id: string | null) => void
  properties: any[]
  onClose: () => void
  onSave: () => void
}

export function SaveAreaCard({
  visible, mode, form, setForm, pending,
  saveTarget, setSaveTarget,
  attachPropId, setAttachPropId, properties,
  onClose, onSave,
}: Props) {
  if (!visible || !pending) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
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
          {mode === "choose" && (
            <>
              <View style={s.header}>
                <Text style={s.title}>حفظ المساحة المرسومة</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </Pressable>
              </View>
              <Row icon="shapes-outline" color="#3B82F6" title="منطقة مستقلة"
                desc="تسجيل المنطقة كقطعة أرض في قاعدة البيانات"
                onPress={() => setSaveTarget("area")}
              />
              <Row icon="business-outline" color="#16A34A" title="عقار جديد"
                desc="إنشاء عقار جديد مع ربط المساحة كمحيطه"
                onPress={() => setSaveTarget("property")}
              />
              <Row icon="link-outline" color="#2563EB" title="إلحاق بعقار موجود"
                desc="ربط هذه المساحة بمحيط عقار موجود"
                onPress={() => setSaveTarget("attach")}
              />
            </>
          )}

          {mode === "attach" && (
            <>
              <View style={s.header}>
                <Text style={s.title}>اختر العقار</Text>
                <Pressable onPress={() => setSaveTarget(null)} hitSlop={10}>
                  <Ionicons name="arrow-back" size={20} color="#64748B" />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 320 }}>
                {properties.map((p) => (
                  <Pressable
                    key={p.id}
                    style={[s.selectRow, attachPropId === p.id && { backgroundColor: "#EFF6FF", borderColor: "#2563EB" }]}
                    onPress={() => { Haptics.selectionAsync(); setAttachPropId(p.id) }}
                  >
                    <Ionicons
                      name={attachPropId === p.id ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={attachPropId === p.id ? "#2563EB" : "#94A3B8"}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.labelBold}>{p.name}</Text>
                      <Text style={s.labelSub}>{TYPE_LABELS[p.type] || p.type} · {p.area || 0} م²</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
              {attachPropId && (
                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave() }} style={[s.btn, { backgroundColor: "#2563EB", marginTop: spacing.sm }]}>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                  <Text style={s.btnText}>إلحاق بالعقار</Text>
                </Pressable>
              )}
            </>
          )}

          {mode === "form" && (saveTarget === "area" || saveTarget === "property") && (
            <>
              <View style={s.header}>
                <Text style={s.title}>{saveTarget === "area" ? "حفظ منطقة" : "إنشاء عقار"}</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </Pressable>
              </View>

              <View style={s.statsBox}>
                <Stat label="المساحة" value={`${(pending.area / 10000).toFixed(2)} هكتار`} />
                <Stat label="المحيط" value={fmtDistCalc(pending.perimeter)} />
                <Stat label="النقاط" value={`${pending.coords.length}`} />
              </View>

              <Text style={s.label}>الاسم</Text>
              <TextInput
                placeholderTextColor="#94A3B8"
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                style={s.input}
              />
              <Text style={s.label}>الوصف</Text>
              <TextInput
                placeholderTextColor="#94A3B8" multiline
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                style={[s.input, { minHeight: 60, textAlignVertical: "top" }]}
              />
              <Text style={s.label}>الفئة</Text>
              <View style={s.chipsRow}>
                {AREA_CATS.map((c) => {
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
                  <Text style={s.btnText}>حفظ</Text>
                </Pressable>
              </View>
            </>
          )}
</ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Row({ icon, color, title, desc, onPress }: { icon: string; color: string; title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.labelBold}>{title}</Text>
        <Text style={s.labelSub}>{desc}</Text>
      </View>
      <Ionicons name="chevron-back" size={18} color="#94A3B8" />
    </Pressable>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 10, fontFamily: "Tajawal_400Regular", color: "#94A3B8" }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#1E293B" }}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  kbRoot: { flex: 1, justifyContent: "flex-end" },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: 12, maxHeight: "85%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.55)" },
  sheet: { backgroundColor: "#FFF", borderRadius: 18, padding: 16, maxHeight: "100%" },
  handle: { alignSelf: "center", width: 40, height: 4, backgroundColor: "#CBD5E1", borderRadius: 2, marginBottom: 12 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontFamily: "Tajawal_700Bold", color: "#0F172A" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: spacing.xs },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  labelBold: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#1E293B" },
  labelSub: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", color: "#94A3B8", marginTop: 2 },
  statsBox: { flexDirection: "row-reverse", justifyContent: "space-around", padding: spacing.md, borderRadius: radius.md, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", marginBottom: spacing.sm },
  label: { fontSize: fontSize.xs, fontFamily: "Tajawal_700Bold", color: "#475569", marginTop: spacing.sm, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, fontFamily: "Tajawal_400Regular", textAlign: "right" },
  chipsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md - 2, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0" },
  chipText: { fontSize: fontSize.xs, fontFamily: "Tajawal_500Medium" },
  rowActions: { flexDirection: "row-reverse", gap: spacing.sm },
  selectRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 4 },
  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: 999 },
  btnText: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#FFF" },
})
