import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Alert, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card, Button } from '../../components/ui'
import { getAllProjects, getProjectReport, PLOT_STATUS_LABELS, type PlotStatus } from '../../database/projects'

export default function ReportsScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const paramProjectId: string | undefined = route.params?.projectId
  const [projects, setProjects] = useState<any[]>([])
  const [selected, setSelected] = useState<string>(paramProjectId || '')
  const [report, setReport] = useState<any | null>(null)
  const [allReport, setAllReport] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'project' | 'all'>(paramProjectId ? 'project' : 'all')

  useFocusEffect(useCallback(() => {
    getAllProjects().then(setProjects).catch(() => {})
  }, []))

  useEffect(() => {
    if (paramProjectId) {
      setSelected(paramProjectId)
      setMode('project')
      loadProjectReport(paramProjectId)
    }
  }, [paramProjectId])

  useEffect(() => {
    if (mode === 'all') {
      loadAllReports()
    } else if (selected) {
      loadProjectReport(selected)
    }
  }, [mode, selected])

  async function loadProjectReport(id: string) {
    setLoading(true)
    try {
      const r = await getProjectReport(id)
      setReport(r)
      setAllReport(null)
    } catch (e) {
      setReport(null)
    }
    setLoading(false)
  }

  async function loadAllReports() {
    setLoading(true)
    setReport(null)
    try {
      const all = await getAllProjects()
      const rows = await Promise.all(all.map((p) => getProjectReport(p.id).catch(() => null)))
      setAllReport(rows.filter(Boolean))
    } catch (e) {
      setAllReport([])
    }
    setLoading(false)
  }

  const fmtN = (n: number) => Number(n || 0).toLocaleString()

  function statusLabel(s: string) {
    return (PLOT_STATUS_LABELS as Record<string, string>)[s] || s
  }

  function buildProjectText(r: any) {
    if (!r || !r.project) return ''
    const lines: string[] = []
    lines.push(`تقرير المشروع: ${r.project.name}`)
    lines.push(`القطع: ${r.totals.plots} | متاحة: ${r.totals.available} | مبيعة: ${r.totals.sold} | قيد التقسيط: ${r.totals.installment}`)
    lines.push(`إجمالي القيمة: ${fmtN(r.totals.value)} ر.ي`)
    lines.push(`المحصّل: ${fmtN(r.totals.collected)} ر.ي | المتبقي: ${fmtN(r.totals.remaining)} ر.ي`)
    lines.push('')
    for (const b of r.blocks) {
      lines.push(`— ${b.name} (${b.plots.length} قطعة) —`)
      for (const p of b.plots) {
        const buyer = p.buyer_name ? ` | المشتري: ${p.buyer_name}` : ''
        lines.push(`قطعة ${p.plot_no}: ${statusLabel(p.status)} | مساحة ${fmtN(p.area_sqm)} م² | قيمة ${fmtN(p.value)} ر.ي | محصّل ${fmtN(p.paid_amount)} | متبقي ${fmtN(p.remaining_amount)}${buyer}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  async function shareProject() {
    try {
      const r = mode === 'all' ? null : report
      if (mode === 'all' && allReport) {
        const text = allReport.map((r: any) => buildProjectText(r)).join('\n========================\n')
        await Share.share({ message: text, title: 'تقرير جميع المشاريع' })
      } else if (r) {
        await Share.share({ message: buildProjectText(r), title: 'تقرير المشروع' })
      }
    } catch (e) { /* user cancelled or error */ }
  }

  function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
    return (
      <View style={[styles.statCard, { backgroundColor: colors.bgSecondary }]}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={[styles.statValue, { color: color }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      </View>
    )
  }

  function PlotRow({ p }: { p: any }) {
    const sc = p.status === 'available' ? colors.success : p.status === 'sold' ? colors.error : colors.warning
    return (
      <View style={[styles.plotRow, { borderBottomColor: colors.border }]}>
        <View style={styles.plotRowMain}>
          <View style={styles.plotRowTitleWrap}>
            <Text style={[styles.plotNo, { color: colors.textPrimary }]}>{p.plot_no}</Text>
            <View style={[styles.statusChip, { backgroundColor: sc + '18' }]}>
              <Text style={[styles.statusText, { color: sc }]}>{statusLabel(p.status)}</Text>
            </View>
          </View>
          <View style={styles.plotRowMeta}>
            <Text style={[styles.plotMetaText, { color: colors.textSecondary }]}>{fmtN(p.area_sqm)} م²</Text>
            <Text style={[styles.plotMetaText, { color: colors.textSecondary }]}>قيمة {fmtN(p.value)}</Text>
            <Text style={[styles.plotMetaText, { color: colors.success }]}>مُحصّل {fmtN(p.paid_amount)}</Text>
            <Text style={[styles.plotMetaText, { color: colors.warning }]}>متبقي {fmtN(p.remaining_amount)}</Text>
          </View>
        </View>
      </View>
    )
  }

  function ProjectBlock({ r }: { r: any }) {
    return (
      <Card style={styles.blockCard}>
        <View style={styles.blockHeader}>
          <Text style={[styles.blockName, { color: colors.textPrimary }]}>{r.project.name}</Text>
          <Pressable onPress={() => setSelected(r.project.id)} hitSlop={6}>
            <Ionicons name="open-outline" size={18} color={colors.accent} />
          </Pressable>
        </View>
        <View style={styles.totalsRow}>
          <Text style={[styles.totalsText, { color: colors.textMuted }]}>القطع {r.totals.plots} · متاحة {r.totals.available} · مبيعة {r.totals.sold} · تقسيط {r.totals.installment}</Text>
          <Text style={[styles.totalsText, { color: colors.accent }]}>المحصل {fmtN(r.totals.collected)} ر.ي</Text>
        </View>
        {r.blocks.map((b: any) => (
          <View key={b.id} style={styles.blockSection}>
            <Text style={[styles.blockName, { color: colors.textSecondary }]}>{b.name} · {b.plots.length} قطعة</Text>
            {b.plots.map((p: any) => <PlotRow key={p.id} p={p} />)}
          </View>
        ))}
      </Card>
    )
  }

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 8, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  const reportForMode = mode === 'all' ? null : report

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-forward" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>التقارير</Text>
        <Pressable onPress={shareProject} hitSlop={8} style={[styles.headerBtn, { backgroundColor: colors.accentSurface, borderRadius: radius.md }]}>
          <Ionicons name="share-outline" size={20} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode('all')} style={[styles.modeBtn, { borderColor: mode === 'all' ? colors.accent : colors.border, backgroundColor: mode === 'all' ? colors.accentSurface : colors.bgSecondary }]}>
            <Text style={[styles.modeText, { color: mode === 'all' ? colors.accent : colors.textSecondary }]}>كل المشاريع</Text>
          </Pressable>
          <Pressable onPress={() => { if (projects.length > 0) { setMode('project'); setSelected(projects[0].id) } }} style={[styles.modeBtn, { borderColor: mode === 'project' ? colors.accent : colors.border, backgroundColor: mode === 'project' ? colors.accentSurface : colors.bgSecondary }]}>
            <Text style={[styles.modeText, { color: mode === 'project' ? colors.accent : colors.textSecondary }]}>مشروع محدد</Text>
          </Pressable>
        </View>

        {mode === 'project' ? (
          <View style={styles.chipRow}>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => setSelected(p.id)} style={[styles.chip, { borderColor: selected === p.id ? colors.accent : colors.border, backgroundColor: selected === p.id ? colors.accentSurface : colors.bgSecondary }]}>
                <Text style={[styles.chipText, { color: selected === p.id ? colors.accent : colors.textSecondary }]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {mode === 'all' && allReport ? (
          allReport.length === 0 ? (
            <Card style={styles.blockCard}><Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مشاريع</Text></Card>
          ) : allReport.map((r: any) => <ProjectBlock key={r.project.id} r={r} />)
        ) : null}

        {mode === 'project' && reportForMode ? (
          <>
            <Card style={styles.blockCard}>
              <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>{reportForMode.project.name}</Text>
              <View style={styles.statsGrid}>
                <StatCard label="القطع" value={String(reportForMode.totals.plots)} color={colors.textPrimary} icon="square-outline" />
                <StatCard label="متاحة" value={String(reportForMode.totals.available)} color={colors.success} icon="checkmark-circle-outline" />
                <StatCard label="مبيعة" value={String(reportForMode.totals.sold)} color={colors.error} icon="close-circle-outline" />
                <StatCard label="قيد التقسيط" value={String(reportForMode.totals.installment)} color={colors.warning} icon="time-outline" />
              </View>
              <View style={styles.finSummary}>
                <View style={styles.finItem}>
                  <Text style={[styles.finLabel, { color: colors.textMuted }]}>إجمالي القيمة</Text>
                  <Text style={[styles.finValue, { color: colors.accent }]}>{fmtN(reportForMode.totals.value)} ر.ي</Text>
                </View>
                <View style={styles.finItem}>
                  <Text style={[styles.finLabel, { color: colors.textMuted }]}>المحصّل</Text>
                  <Text style={[styles.finValue, { color: colors.success }]}>{fmtN(reportForMode.totals.collected)} ر.ي</Text>
                </View>
                <View style={styles.finItem}>
                  <Text style={[styles.finLabel, { color: colors.textMuted }]}>المتبقي</Text>
                  <Text style={[styles.finValue, { color: colors.warning }]}>{fmtN(reportForMode.totals.remaining)} ر.ي</Text>
                </View>
              </View>
            </Card>

            {reportForMode.blocks.map((b: any) => (
              <Card key={b.id} style={styles.blockCard}>
                <Text style={[styles.blockName, { color: colors.textPrimary }]}>{b.name}</Text>
                <Text style={[styles.blockCount, { color: colors.textMuted }]}>{b.plots.length} قطعة</Text>
                {b.plots.map((p: any) => <PlotRow key={p.id} p={p} />)}
              </Card>
            ))}
          </>
        ) : null}

        <View style={styles.shareRow}>
          <Button
            title="تصدير التقرير"
            onPress={shareProject}
            variant="primary"
            icon={<Ionicons name="share-outline" size={16} color="#FFF" />}
          />
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold' },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  modeText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  blockCard: { padding: spacing.md, gap: spacing.sm },
  reportTitle: { fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  statCard: { flex: 1, minWidth: '45%', borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  statValue: { fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold' },
  finSummary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm },
  finItem: { flex: 1, alignItems: 'center', gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#F8FAFC' },
  finLabel: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  finValue: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  blockName: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  blockCount: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalsRow: { gap: 2, marginTop: 2 },
  totalsText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  blockSection: { marginTop: spacing.sm },
  plotRow: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  plotRowMain: { gap: 4 },
  plotRowTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  plotNo: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  statusText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  plotRowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  plotMetaText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  emptyText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'center', paddingVertical: spacing.sm },
  shareRow: { marginTop: spacing.sm },
})