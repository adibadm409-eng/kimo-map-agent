import React from "react"
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useTheme } from "../theme/ThemeContext"
import { spacing, fontSize, radius } from "../theme/tokens"

const SERVICES = [
  { name: "Google Maps (react-native-maps)", license: "Apache License 2.0", url: "https://maps.google.com" },
  { name: "OpenStreetMap", license: "Open Database License (ODbL)", url: "https://www.openstreetmap.org" },
  { name: "MapLibre GL JS", license: "BSD 3-Clause", url: "https://maplibre.org" },
  { name: "Leaflet", license: "BSD 2-Clause", url: "https://leafletjs.com" },
  { name: "Expo SDK (Framework، SQLite، FileSystem، DocumentPicker، Sharing، Fonts، Video وغيرها)", license: "MIT License", url: "https://expo.dev" },
  { name: "React Native", license: "MIT License", url: "https://reactnative.dev" },
  { name: "react-native-webview", license: "MIT License", url: "https://github.com/react-native-webview/react-native-webview" },
  { name: "react-native-reanimated / gesture-handler / screens", license: "MIT License", url: "https://docs.swmansion.com/react-native-reanimated/" },
  { name: "Ionicons", license: "MIT License", url: "https://ionic.io/ionicons" },
  { name: "خط Tajawal", license: "SIL Open Font License 1.1", url: "https://fonts.google.com/specimen/Tajawal" },
  { name: "ExcelJS (تصدير الجداول)", license: "MIT License", url: "https://github.com/exceljs/exceljs" },
  { name: "JSZip (ضغط الملفات)", license: "MIT License", url: "https://stuk.github.io/jszip/" },
  { name: "docx (تصدير المستندات)", license: "MIT License", url: "https://docx.js.org" },
  { name: "Fuse.js (البحث الذكي)", license: "Apache License 2.0", url: "https://fusejs.io" },
  { name: "react-native-markdown-display", license: "MIT License", url: "https://github.com/iamacup/react-native-markdown-display" },
  { name: "crypto-js (تشفير النسخ الاحتياطية)", license: "MIT License", url: "https://github.com/brix/crypto-js" },
]

const AI_PROVIDERS = [
  { name: "OpenAI", url: "https://openai.com" },
  { name: "Google Gemini", url: "https://ai.google.dev" },
  { name: "DeepSeek", url: "https://platform.deepseek.com" },
  { name: "Mistral AI", url: "https://mistral.ai" },
  { name: "Qwen (Alibaba Cloud DashScope)", url: "https://dashscope.aliyun.com" },
  { name: "OpenRouter", url: "https://openrouter.ai" },
  { name: "NVIDIA NIM", url: "https://build.nvidia.com" },
]

const MAP_TILE_PROVIDERS = [
  { name: "Carto", url: "https://carto.com" },
  { name: "Esri", url: "https://www.esri.com" },
  { name: "Sentinel-2 (برنامج كوبرنيكوس)", url: "https://www.copernicus.eu" },
  { name: "USGS", url: "https://www.usgs.gov" },
  { name: "NASA GIBS", url: "https://earthdata.nasa.gov" },
  { name: "Wikimedia", url: "https://wikimediafoundation.org" },
  { name: "OpenFreeMap", url: "https://openfreemap.org" },
]

export default function AboutScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary, paddingTop: insets.top }}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.title, { color: colors.textPrimary }]}>حقوق الملكية</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>

        {/* والتحقوق الفكرية — ملكية كاملة لشخص واحد */}
        <View style={[s.brandCard, { backgroundColor: "#0F172A", borderColor: "#1E293B" }]}>
          <View style={s.brandIcon}>
            <Ionicons name="person-circle" size={36} color="#C0C0C0" />
          </View>
          <Text style={s.brandName}>علي كمال الدين المقطري</Text>
          <Text style={s.brandRole}>المؤسس والمطوّر</Text>
          <View style={s.divider} />
          <Text style={s.brandRights}>
            جميع الحقوق الفكرية والملكية لهذا التطبيق تعود بالكامل وبصفة حصرية لعلي كمال الدين المقطري — المؤسس والمطوّر
          </Text>
          <Text style={s.brandRights}>© 2026 علي كمال الدين المقطري. جميع الحقوق محفوظة.</Text>
          <View style={s.divider} />
          <Text style={s.brandRights}>
            المطوّر هو أيضاً مؤسس منصة YAC AI الاكاديمية — وهي منصة مستقلة تماماً ولا علاقة لها بهذا التطبيق إطلاقاً؛
            لا يجمعهما سوى أن مطوّرهما هو الشخص ذاته.
          </Text>
        </View>

        {/* وصف التطبيق */}
        <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>مدير العقارات</Text>
          <Text style={[s.cardVersion, { color: colors.textMuted }]}>الإصدار 1.0.0</Text>
          <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
            نظام متكامل لإدارة العقارات وتنظيم عمليات البيع والشراء وطلبات العملاء بشكل مؤرشف ومرئي على الخريطة،
            مزوّد بوكيل ذكاء اصطناعي للمساعدة في الأعمال الإدارية وإعداد التقارير وتعديل البيانات.
          </Text>
          <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
            يعمل التطبيق محلياً بالكامل على جهاز المستخدم، ولا يتصل بأي شكل من الأشكال بالمطوّر — لا بيانات ولا إحصاءات ولا مفاتيح.
          </Text>

          <View style={[s.noticeBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#B45309" />
            <Text style={[s.noticeText, { color: colors.textSecondary }]}>
              حماية بياناتك ومفاتيحك تقع على عاتقك أنت وحدك. عند استخدام أي مزوّد ذكاء اصطناعي أو خرائط،
              عليك مراجعة شروط كل مزوّد تود استخدامه والالتزام بها — فبياناتك تُرسل إليه وفق إعداداتك أنت وليس للتطبيق أي دور في ذلك.
            </Text>
          </View>
        </View>

        {/* الخدمات الخارجية */}
        <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>الخدمات الخارجية المستخدمة</Text>
          <Text style={[s.hint, { color: colors.textMuted }]}>هذا التطبيق يستخدم الخدمات والمكتبات التالية بموجب التراخيص المذكورة:</Text>
          {SERVICES.map((svc, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(svc.url)} style={[s.serviceRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.serviceName, { color: colors.textPrimary }]}>{svc.name}</Text>
                <Text style={[s.serviceLicense, { color: colors.textMuted }]}>{svc.license}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.accent} />
            </Pressable>
          ))}
        </View>

        {/* مزودو الذكاء الاصطناعي */}
        <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>مزوّدو الذكاء الاصطناعي (حسب اختيار المستخدم)</Text>
          <Text style={[s.hint, { color: colors.textMuted }]}>
            الوكيل يستخدم مزوّداً يختاره المستخدم من إعدادات المساعد — كل مزوّد بشروطه وسياسات خصوصيته الخاصة:
          </Text>
          {[...AI_PROVIDERS, { name: "مزوّد مخصص (يحدده المستخدم)", url: "https://en.wikipedia.org/wiki/OpenAI_API" }].map((svc, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(svc.url)} style={[s.serviceRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.serviceName, { color: colors.textPrimary }]}>{svc.name}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.accent} />
            </Pressable>
          ))}
          <Text style={[s.hint, { color: colors.textMuted, marginTop: spacing.xs }]}>
            مراجعة شروط كل مزوّد قبل استخدامه مسؤولية المستخدم وحده.
          </Text>
        </View>

        {/* مزودو الخرائط */}
        <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>مزوّدو بلاطات الخرائط (حسب اختيار المستخدم)</Text>
          <Text style={[s.hint, { color: colors.textMuted }]}>الخرائط تُحمَّل من المزوّدين التاليين وفق إعدادات المستخدم:</Text>
          {MAP_TILE_PROVIDERS.map((svc, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(svc.url)} style={[s.serviceRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.serviceName, { color: colors.textPrimary }]}>{svc.name}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.accent} />
            </Pressable>
          ))}
        </View>

        <Text style={[s.footer, { color: colors.textMuted }]}>
          صُمم وطُوّر بعناية فائقة بواسطة علي كمال الدين المقطري. الحقوق الفكرية والملكية لهذا التطبيق تعود له بالكامل وبصفة حصرية.
        </Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  title: { fontSize: fontSize.xxl, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  brandCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  brandIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  brandName: { color: "#C0C0C0", fontSize: 24, fontWeight: "700", fontFamily: "Tajawal_700Bold", letterSpacing: 1, textAlign: "center" },
  brandRole: { color: "#94A3B8", fontSize: fontSize.sm, fontFamily: "Tajawal_500Medium" },
  divider: { width: 140, height: 1, backgroundColor: "#334155", marginVertical: spacing.sm },
  brandRights: { color: "#CBD5E1", fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", textAlign: "center", lineHeight: 18 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  cardVersion: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular" },
  cardDesc: { fontSize: fontSize.sm, fontFamily: "Tajawal_400Regular", lineHeight: 22, marginTop: spacing.xs },
  noticeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, marginTop: spacing.sm },
  noticeText: { flex: 1, fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", lineHeight: 19 },
  hint: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", marginBottom: spacing.sm },
  serviceRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  serviceName: { fontSize: fontSize.sm, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  serviceLicense: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", marginTop: 2 },
  footer: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", textAlign: "center", lineHeight: 18, marginTop: spacing.sm },
})