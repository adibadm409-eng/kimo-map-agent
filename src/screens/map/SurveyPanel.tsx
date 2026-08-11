import { View, Text, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { spacing, radius, fontSize } from "../../theme/tokens"

type Theme = {
  bg: string
  bgSecondary: string
  border: string
  textPrimary: string
  textSecondary: string
  accent: string
}

type Mode = "polygon" | "polyline" | "measure"

type Props = {
  visible: boolean
  mode: Mode
  theme: Theme
  insets: { top: number; bottom: number }
  pointCount: number
  summary: string | null
  onAddPoint: () => void
  onUndoPoint: () => void
  onSave: () => void
  onClose: () => void
}

export function SurveyPanel({
  visible, mode, theme, insets, pointCount, summary, onAddPoint, onUndoPoint, onSave, onClose,
}: Props) {
  if (!visible) return null

  const modeTitle = mode === "polygon" ? "رسم مضلع" : mode === "polyline" ? "رسم مسار" : "رسم قياس"
  const saveLabel = mode === "polygon" ? "حفظ المنطقة" : mode === "polyline" ? "حفظ المسار" : "حفظ القياس"
  const canSave = mode === "polygon" ? pointCount >= 3 : pointCount >= 2

  return (
    <View style={[s.wrap, { bottom: insets.bottom + 64 }]}>
      <View style={[s.sheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <View style={s.header}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
            <Ionicons
              name={mode === "polygon" ? "shapes-outline" : mode === "polyline" ? "git-branch-outline" : "expand-outline"}
              size={16}
              color="#3B82F6"
            />
            <Text style={[s.title, { color: theme.textPrimary }]}>{modeTitle}</Text>
            <View style={[s.countBadge, { backgroundColor: "#3B82F6" }]}>
              <Text style={s.countText}>{pointCount} نقطة</Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        {summary && (
          <View style={[s.summary, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={[s.summaryText, { color: theme.textSecondary }]} numberOfLines={2}>{summary}</Text>
          </View>
        )}

        <View style={s.actions}>
          <Pressable onPress={onAddPoint} style={[s.btn, s.btnAdd, { backgroundColor: "#3B82F6" }]}>
            <Ionicons name="add" size={22} color="#FFF" />
            <Text style={s.btnText}>رسم نقطة</Text>
          </Pressable>

          <Pressable
            disabled={pointCount === 0}
            onPress={onUndoPoint}
            style={[s.btn, s.btnUndo, { borderColor: "#F59E0B", opacity: pointCount === 0 ? 0.4 : 1 }]}
          >
            <Ionicons name="arrow-undo" size={22} color="#F59E0B" />
            <Text style={[s.btnText, { color: "#F59E0B" }]}>حذف نقطة</Text>
          </Pressable>

          <Pressable
            disabled={!canSave}
            onPress={onSave}
            style={[s.btn, s.btnSave, { backgroundColor: "#16A34A", opacity: canSave ? 1 : 0.4 }]}
          >
            <Ionicons name="save" size={22} color="#FFF" />
            <Text style={s.btnText}>{saveLabel}</Text>
          </Pressable>
        </View>

        <Text style={[s.hint, { color: theme.textSecondary }]}>
          حرّك الخريطة بحرية، ثم اضغط «رسم نقطة» لإضافة نقطة عند مركز الشاشة 🎯
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.sm, right: spacing.sm, zIndex: 130 },
  sheet: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, elevation: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  title: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  countText: { color: "#FFF", fontSize: 10, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  summary: { padding: spacing.xs + 2, borderRadius: radius.sm, borderWidth: 1, marginBottom: spacing.sm, marginTop: spacing.xs, alignItems: "center" },
  summaryText: { fontSize: fontSize.xs, fontFamily: "Tajawal_500Medium", textAlign: "center" },
  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginBottom: spacing.sm },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent" },
  btnAdd: {},
  btnUndo: { backgroundColor: "transparent", borderWidth: 1.5 },
  btnSave: {},
  btnText: { color: "#FFF", fontFamily: "Tajawal_700Bold", fontSize: fontSize.sm },
  hint: { fontSize: 11, fontFamily: "Tajawal_400Regular", textAlign: "center" },
})
