import React, { useState } from "react"
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Modal, ActivityIndicator, Alert, TextInput } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTheme } from "../theme/ThemeContext"
import { spacing, fontSize, radius } from "../theme/tokens"
import {
  buildFullBackup, parseFullBackup, unlockFullBackup, restoreFullBackup,
  saveBackupAsDeviceFile, pickBackupFileFromDevice, backupFileName,
} from "../database/backup"
import type { FullBackup } from "../database/backup"

type Tab = "create" | "restore"

export default function BackupManager() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Tab>("create")
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState("")

  // إنشاء
  const [createName, setCreateName] = useState("")
  const [includeKeys, setIncludeKeys] = useState(true)
  const [pass, setPass] = useState("")
  const [pass2, setPass2] = useState("")
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  // استعادة
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [pickedFile, setPickedFile] = useState<FullBackup | null>(null)
  const [restorePass, setRestorePass] = useState("")
  const [summary, setSummary] = useState<string | null>(null)
  const [stats, setStats] = useState<{ tables: number; rows: number; files: number } | null>(null)

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true); setBusyLabel(label)
    try { await fn() } catch (e: any) { Alert.alert("خطأ", e.message || String(e)) }
    finally { setBusy(false); setBusyLabel("") }
  }

  // ── إنشاء وحفظ كملف ─────────────────────────────────────────────────────
  const handleCreate = () =>
    run("جارٍ إنشاء النسخة وحفظها...", async () => {
      const wantPass = pass.length > 0
      if (wantPass && pass !== pass2) { Alert.alert("تنبيه", "كلمتا السر غير متطابقتين"); return }
      if (!wantPass && includeKeys) {
        // سنكتشف لاحقاً في buildFullBackup إن وُجدت مفاتيح فعلاً — هنا تحذير مبكر لا يمنع
      }
      const text = await buildFullBackup(createName, { includeKeys, password: wantPass ? pass : undefined })
      const fileName = backupFileName(createName || "Kimo")
      const res = await saveBackupAsDeviceFile(text, fileName)
      if (res.cancelled) return
      setLastSaved(fileName)
      setCreateName(""); setPass(""); setPass2("")
      Alert.alert(
        "تم حفظ النسخة",
        res.shared
          ? "تم إنشاء ملف النسخة (YACB1) وحفظه عبر المشاركة.\nشاملاً كل البيانات والمحادثات والإعدادات."
          : `تم حفظ ملف النسخة (YACB1) في الموقع الذي اخترته:\n${fileName}\n\nشاملاً كل البيانات والمحادثات والإعدادات والمفاتيح.`,
        [{ text: "حسناً" }]
      )
    })

  // ── اختيار ملف واستعادته ────────────────────────────────────────────────
  const handlePick = () =>
    run("جارٍ قراءة الملف...", async () => {
      const picked = await pickBackupFileFromDevice()
      if (!picked) return
      const file = parseFullBackup(picked.text)
      setPickedName(picked.name)
      setPickedFile(file)
      setRestorePass(""); setSummary(null); setStats(null)
      if (!file.encrypted) {
        // فك التشفير ليس مطلوباً — نعرض ملخصاً فوراً
        const s = unlockFullBackup(file)
        const rows = Object.values(s.sqlite.tables).reduce<number>((n, t) => n + t.rows.length, 0)
        setStats({ tables: Object.keys(s.sqlite.tables).length, rows, files: s.files.length })
        setSummary(`النسخة مفتوحة: ${Object.keys(s.sqlite.tables).length} جدولاً، ${rows} صفاً، ${s.files.length} ملفاً — جاهزة للاستعادة.`)
      } else {
        setSummary("هذه النسخة مشفرة بكلمة سر — أدخلها لفتحها ثم استعدّها")
      }
    })

  const handleUnlock = () =>
    run("جارٍ فتح النسخة...", async () => {
      if (!pickedFile) return
      const s = unlockFullBackup(pickedFile, restorePass)
      const rows = Object.values(s.sqlite.tables).reduce<number>((n, t) => n + t.rows.length, 0)
      setStats({ tables: Object.keys(s.sqlite.tables).length, rows, files: s.files.length })
      setSummary(`تم فتح النسخة: ${Object.keys(s.sqlite.tables).length} جدولاً، ${rows} صفاً، ${s.files.length} ملفاً — جاهزة للاستعادة.`)
    })

  const handleRestore = () =>
    run("جارٍ استعادة البيانات...", async () => {
      if (!pickedFile) return
      const res = await restoreFullBackup(pickedFile, restorePass)
      Alert.alert(
        "اكتملت الاستعادة",
        `تمت استعادة النسخة «${pickedFile.name}»:\n• ${res.tables} جدولاً (${res.rows} صفاً)\n• ${res.files} ملفاً\n${res.includesKeys ? "• تشمل مفاتيح مزودي الذكاء الاصطناعي/الخرائط" : ""}\n\nستُقرأ البيانات الجديدة عند فتح الشاشات المعنية.`,
        [{ text: "حسناً" }]
      )
    })

  const FileBadge = ({ on, label }: { on: boolean; label: string }) => (
    <View style={[s.badge, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent + "12" : "transparent" }]}>
      <Text style={[s.badgeText, { color: on ? colors.accent : colors.textMuted }]}>{label}</Text>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary, paddingTop: insets.top }}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.title, { color: colors.textPrimary }]}>النسخ الاحتياطي</Text>
      </View>

      <View style={[s.tabs, { backgroundColor: colors.bgSecondary }]}>
        {([
          { k: "create" as const, label: "إنشاء نسخة" },
          { k: "restore" as const, label: "استعادة من ملف" },
        ]).map((t) => (
          <Pressable
            key={t.k}
            onPress={() => setTab(t.k)}
            style={[s.tabBtn, { backgroundColor: tab === t.k ? colors.accent : "transparent", borderColor: tab === t.k ? colors.accent : colors.border }]}
          >
            <Text style={[s.tabText, { color: tab === t.k ? "#FFF" : colors.textSecondary }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {busy && (
        <View style={s.busyOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.busyText, { color: colors.textPrimary }]}>{busyLabel}</Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      >
        {/* ── إنشاء نسخة ─────────────────────────────────────────────── */}
        {tab === "create" && (
          <>
            <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>نسخة شاملة لكل بيانات التطبيق</Text>
              <Text style={[s.sectionSubtitle, { color: colors.textMuted }]}>
                تشمل: العقارات والنقاط والمساحات، المحادثات والوكيل، الإعدادات، مفاتيح المزوّدين، الملفات المولّدة، مساحات العمل والمشاريع — كل شيء في التطبيق.
              </Text>

              <Text style={[s.label, { color: colors.textSecondary, marginTop: spacing.sm }]}>اسم النسخة (اختياري)</Text>
              <TextInput
                value={createName}
                onChangeText={setCreateName}
                placeholder="مثال: نسخة قبل ترقية المفاتيح"
                placeholderTextColor={colors.textMuted}
                style={[s.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              />

              <View style={[s.switchRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: colors.textPrimary }]}>تضمين مفاتيح مزودي الذكاء الاصطناعي والخرائط</Text>
                  <Text style={[s.hint, { color: colors.textMuted }]}>
                    عند تضمين المفاتيح تصبح كلمة السر إلزامية على هذه النسخة
                  </Text>
                </View>
                <Switch
                  value={includeKeys}
                  onValueChange={setIncludeKeys}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>

              <Text style={[s.label, { color: includeKeys ? colors.accent : colors.textSecondary, marginTop: spacing.sm }]}>
                كلمة سر النسخة {includeKeys ? "(إلزامية — النسخة تشمل المفاتيح)" : "(اختياري)"}
              </Text>
              <TextInput
                value={pass}
                onChangeText={setPass}
                placeholder="كلمة السر"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={[s.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: includeKeys ? colors.accent : colors.border }]}
              />
              <TextInput
                value={pass2}
                onChangeText={setPass2}
                placeholder="تأكيد كلمة السر"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={[s.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              />

              {includeKeys && (
                <Text style={[s.warn, { color: "#B45309" }]}>
                  تنبيه: مفاتيحك تبقى مسؤوليتك وحدك — احفظ كلمة السر في مكان آمن؛ بدونها لا يمكن فتح هذه النسخة ولا استردادها.
                </Text>
              )}
            </View>

            <Pressable onPress={handleCreate} disabled={busy} style={[s.bigBtn, { backgroundColor: colors.accent, opacity: busy ? 0.5 : 1 }]}>
              <Text style={s.bigBtnText}>إنشاء وحفظ كملف على الجهاز</Text>
            </Pressable>
            {lastSaved && (
              <Text style={[s.lastSaved, { color: colors.textMuted }]}>آخر حفظ: {lastSaved}</Text>
            )}
          </>
        )}

        {/* ── استعادة من ملف ─────────────────────────────────────────── */}
        {tab === "restore" && (
          <>
            <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>استعادة من ملف نسخة (YACB1)</Text>
              <Text style={[s.sectionSubtitle, { color: colors.textMuted }]}>
                اختر ملف النسخة من ملفات جهازك. إذا كانت النسخة مشفرة بكلمة سر فلن تُفتح ولن تُستعاد إلا بكلمتها.
              </Text>
              <Pressable onPress={handlePick} disabled={busy} style={[s.bigBtn, { backgroundColor: colors.accent, opacity: busy ? 0.5 : 1, marginTop: spacing.sm }]}>
                <Text style={s.bigBtnText}>اختيار ملف النسخة من الجهاز</Text>
              </Pressable>
            </View>

            {pickedFile && (
              <View style={[s.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{pickedName}</Text>
                <Text style={[s.sectionSubtitle, { color: colors.textMuted }]}>
                  إنشاء: {new Date(pickedFile.createdAt).toLocaleString("ar")} — «{pickedFile.name}»
                </Text>

                <View style={s.badges}>
                  <FileBadge on label={pickedFile.encrypted ? "مشفرة بكلمة سر" : "غير مشفرة"} />
                  <FileBadge on={pickedFile.includesKeys} label={pickedFile.includesKeys ? "تشمل مفاتيح" : "بدون مفاتيح"} />
                </View>

                {pickedFile.encrypted && (
                  <>
                    <Text style={[s.label, { color: colors.textSecondary, marginTop: spacing.sm }]}>كلمة سر النسخة</Text>
                    <TextInput
                      value={restorePass}
                      onChangeText={setRestorePass}
                      placeholder="أدخل كلمة السر لفتح هذه النسخة"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry
                      style={[s.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                    />
                    <Pressable onPress={handleUnlock} disabled={busy} style={[s.smallBtn, { borderColor: colors.accent, borderWidth: 1, backgroundColor: "transparent" }]}>
                      <Text style={[s.smallBtnText, { color: colors.accent }]}>فتح النسخة والاطلاع على المحتويات</Text>
                    </Pressable>
                  </>
                )}

                {summary && <Text style={[s.summary, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textSecondary }]}>{summary}</Text>}

                <Pressable
                  onPress={handleRestore}
                  disabled={busy || (pickedFile.encrypted && !stats)}
                  style={[s.smallBtn, { backgroundColor: "#16A34A", opacity: busy || (pickedFile.encrypted && !stats) ? 0.5 : 1 }]}
                >
                  <Text style={s.smallBtnText}>استعادة كل البيانات من هذه النسخة</Text>
                </Pressable>

                <Text style={[s.warn, { color: "#B45309" }]}>
                  الاستعادة تحل محل بيانات التطبيق الحالية (كل الجداول والملفات والإعدادات بما فيها المحادثات). ننصح بإنشاء نسخة من بياناتك الحالية قبلها.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  title: { fontSize: fontSize.xxl, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  tabs: { flexDirection: "row", gap: 4, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", borderWidth: 1 },
  tabText: { fontSize: fontSize.xs, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  busyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center", zIndex: 100, gap: spacing.md },
  busyText: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold" },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 6 },
  cardTitle: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  sectionSubtitle: { fontSize: fontSize.sm, fontFamily: "Tajawal_400Regular", lineHeight: 20 },
  label: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold" },
  hint: { fontSize: 10, fontFamily: "Tajawal_400Regular", lineHeight: 15 },
  warn: { fontSize: 10, fontFamily: "Tajawal_400Regular", lineHeight: 16, borderRadius: radius.md, backgroundColor: "#FEF3C730", padding: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, fontFamily: "Tajawal_400Regular", textAlign: "right" },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm },
  bigBtn: { alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.full },
  bigBtnText: { color: "#FFF", fontFamily: "Tajawal_700Bold", fontSize: fontSize.md },
  smallBtn: { alignItems: "center", paddingVertical: spacing.sm + 2, borderRadius: radius.md, marginTop: spacing.sm },
  smallBtnText: { color: "#FFF", fontFamily: "Tajawal_700Bold", fontSize: fontSize.sm },
  lastSaved: { textAlign: "center", fontSize: 10, fontFamily: "Tajawal_400Regular" },
  badges: { flexDirection: "row-reverse", gap: 6, marginTop: spacing.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 10, fontFamily: "Tajawal_700Bold" },
  summary: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", lineHeight: 18, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, marginTop: spacing.sm },
})