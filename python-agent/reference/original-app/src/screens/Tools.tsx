import { useState } from "react"
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Share, TextInput, Clipboard } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useTheme } from "../theme/ThemeContext"
import { spacing, fontSize, radius } from "../theme/tokens"
import { getAllProperties, getAllWaypoints, getAllAreas } from "../database/db"
import { importSpatialItems } from "../database/spatialImport"
import { exportGeoJSON, exportKML, exportGPX, writeExportFile, parseImportAny } from "./map/io"

export default function ToolsScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [busy, setBusy] = useState(false)

  async function gatherAll() {
    const [props, wps, ars] = await Promise.all([getAllProperties(), getAllWaypoints(), getAllAreas()])
    const items: { kind: "waypoint" | "area"; data: any }[] = []
    for (const p of props) {
      if (!p.latitude || !p.longitude) continue
      items.push({ kind: "waypoint" as const, data: { id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude, description: p.description } })
      if (p.geojson) items.push({ kind: "area" as const, data: { id: p.id, name: p.name, geojson: p.geojson, area_sqm: p.area_sqm, description: p.description } })
    }
    for (const w of wps) items.push({ kind: "waypoint" as const, data: w })
    for (const a of ars) items.push({ kind: "area" as const, data: a })
    return items
  }

  async function doExport(fmt: "geojson" | "kml" | "gpx") {
    setBusy(true)
    try {
      const items = await gatherAll()
      if (items.length === 0) { Alert.alert("تنبيه", "لا توجد عناصر مكانية للتصدير"); return }
      let content = ""
      let ext = fmt
      if (fmt === "geojson") content = exportGeoJSON(items)
      else if (fmt === "kml") content = exportKML(items)
      else content = exportGPX(items)
      const stamp = new Date().toISOString().substring(0, 10).replace(/-/g, "")
      const fileName = `realestate-export-${stamp}.${ext}`
      const path = await writeExportFile(fileName, content)
      await Share.share({ url: path, message: `Exported ${items.length} items as ${fmt.toUpperCase()}` })
    } catch (e: any) {
      Alert.alert("خطأ", "تعذر التصدير: " + (e?.message || String(e)))
    } finally { setBusy(false) }
  }

  const [importText, setImportText] = useState("")

  async function doImport() {
    setBusy(true)
    try {
      let text = importText.trim()
      if (!text) {
        const clip = await Clipboard.getString()
        if (!clip || !clip.trim()) { Alert.alert("تنبيه", "الصق نص GeoJSON/KML/GPX في الحقل أعلاه أو انسخه من ملف أولاً"); return }
        text = clip
        setImportText(clip)
      }
      const parsed = parseImportAny(text)
      if (parsed.length === 0) { Alert.alert("تنبيه", "لم يتم التعرف على صيغة النص"); return }
      const result = await importSpatialItems(parsed.map((item: any) => ({ kind: item.kind, data: item.data })))
      Alert.alert("تم الاستيراد", `نقاط جديدة: ${result.waypoints} · مناطق جديدة: ${result.areas} · تم تجاوزها كتكرار: ${result.skipped}`)
      setImportText("")
    } catch (e: any) {
      Alert.alert("خطأ", "تعذر الاستيراد: " + (e?.message || String(e)))
    } finally { setBusy(false) }
  }

  async function pasteFromClipboard() {
    const clip = await Clipboard.getString()
    if (clip) setImportText(clip)
    else Alert.alert("تنبيه", "الحافظة فارغة")
  }

  const exportBtns: { key: "geojson" | "kml" | "gpx"; label: string; icon: any; color: string }[] = [
    { key: "geojson", label: "GeoJSON\n(افتراضي)", icon: "code-slash-outline", color: "#3B82F6" },
    { key: "kml",     label: "KML\n(Google Earth)", icon: "earth-outline", color: "#16A34A" },
    { key: "gpx",     label: "GPX\n(للنقاط والمسارات)", icon: "git-branch-outline", color: "#8B5CF6" },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /></Pressable>
        <Text style={[s.title, { color: colors.textPrimary }]}>أدوات التصدير والاستيراد</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: spacing.md }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>تصدير البيانات المكانية</Text>
        <Text style={[s.sectionHint, { color: colors.textSecondary }]}>
          صدّر كل العقارات والنقاط والمناطق بصيغة واحدة قابلة للفتح في Google Earth أو QGIS أو ArcGIS.
        </Text>
        <View style={s.row}>
          {exportBtns.map((b) => (
            <Pressable
              key={b.key}
              disabled={busy}
              onPress={() => doExport(b.key)}
              style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
            >
              <Ionicons name={b.icon} size={26} color={b.color} />
              <Text style={[s.cardLabel, { color: colors.textPrimary }]}>{b.label.split("\n")[0]}</Text>
              <Text style={[s.cardHint, { color: colors.textSecondary }]}>{b.label.split("\n")[1]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: spacing.xl }]}>استيراد ملف</Text>
        <Text style={[s.sectionHint, { color: colors.textSecondary }]}>
          انسخ نص GeoJSON أو KML أو GPX من جهازك، ثم الصقه هنا لاستيراده كنقاط ومناطق جديدة.
        </Text>
        <View style={[s.importCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row-reverse", gap: spacing.sm }}>
            <TextInput
              multiline
              value={importText}
              onChangeText={setImportText}
              placeholder='مثلاً: {"type":"FeatureCollection",...}'
              placeholderTextColor={colors.textMuted}
              style={[s.importInput, { color: colors.textPrimary, backgroundColor: colors.bg, borderColor: colors.border, flex: 1 }]}
            />
            <Pressable onPress={pasteFromClipboard} style={[s.smallBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
              <Text style={[s.smallBtnText, { color: colors.accent }]}>لصق</Text>
            </Pressable>
          </View>
          <Pressable
            disabled={busy}
            onPress={doImport}
            style={[s.bigBtn, { backgroundColor: colors.accent, opacity: busy ? 0.5 : 1 }]}
          >
            <Ionicons name="cloud-upload-outline" size={22} color="#FFF" />
            <Text style={s.bigBtnText}>{busy ? "جاري..." : "استيراد البيانات"}</Text>
          </Pressable>
        </View>

        <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: spacing.xl }]}>ملاحظات</Text>
        <View style={[s.note, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[s.noteText, { color: colors.textSecondary }]}>
            - التصدير يشمل العقارات مع محيطاتها (إن وُجدت) + النقاط + المناطق.
            {"\n"}- الاستيراد يعاين التكرار ويكتب العناصر داخل معاملة واحدة؛ لا يحلّ محل الموجود.
            {"\n"}- الصيغ المدعومة للاستيراد: GeoJSON, KML, GPX.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: spacing.md, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: spacing.xs },
  title: { fontSize: fontSize.lg, fontWeight: "700", fontFamily: "Tajawal_700Bold", flex: 1, textAlign: "center" },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold", marginBottom: 6 },
  sectionHint: { fontSize: fontSize.sm, fontFamily: "Tajawal_400Regular", marginBottom: spacing.md },
  row: { flexDirection: "row-reverse", gap: spacing.sm, justifyContent: "space-between" },
  card: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: 4 },
  cardLabel: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  cardHint: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", textAlign: "center" },
  bigBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.md, borderRadius: radius.md },
  importCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm },
  importInput: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, minHeight: 80, textAlign: "right", fontFamily: "monospace", fontSize: fontSize.xs },
  smallBtn: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, gap: 2, minWidth: 56 },
  smallBtnText: { fontSize: fontSize.xs, fontFamily: "Tajawal_700Bold" },
  bigBtnText: { color: "#FFF", fontFamily: "Tajawal_700Bold", fontSize: fontSize.md },
  note: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  noteText: { flex: 1, fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", lineHeight: 18, textAlign: "right" },
})
