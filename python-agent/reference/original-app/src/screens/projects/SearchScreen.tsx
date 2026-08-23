import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card, Button } from '../../components/ui'
import {
  getAllProjects, searchEntities, filterPlots,
  PLOT_STATUS_LABELS, INSTALLMENT_TYPE_LABELS,
  type PlotStatus, type InstallmentType,
} from '../../database/projects'

type SearchResult = {
  projects: any[]
  blocks: any[]
  plots: any[]
}

export default function SearchScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult>({ projects: [], blocks: [], plots: [] })
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [showFilters, setShowFilters] = useState(false)
  const [fProject, setFProject] = useState('')
  const [fStatus, setFStatus] = useState<PlotStatus | ''>('')
  const [fInstall, setFInstall] = useState<InstallmentType | ''>('')
  const [fAreaMin, setFAreaMin] = useState('')
  const [fAreaMax, setFAreaMax] = useState('')
  const [fValMin, setFValMin] = useState('')
  const [fValMax, setFValMax] = useState('')
  const [fPlotNo, setFPlotNo] = useState('')
  const [fBuyer, setFBuyer] = useState('')
  const [filterResults, setFilterResults] = useState<any[] | null>(null)
  const [filtering, setFiltering] = useState(false)

  useEffect(() => {
    getAllProjects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResult({ projects: [], blocks: [], plots: [] }); return }
    setLoading(true)
    const t = setTimeout(() => {
      searchEntities(q)
        .then((r) => setResult(r as any))
        .catch(() => setResult({ projects: [], blocks: [], plots: [] }))
        .finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  async function runFilter() {
    setFiltering(true)
    setFilterResults(null)
    try {
      const rows = await filterPlots({
        project_id: fProject || undefined,
        status: fStatus || undefined,
        installment_type: fInstall || undefined,
        area_min: fAreaMin ? Number(fAreaMin) : undefined,
        area_max: fAreaMax ? Number(fAreaMax) : undefined,
        value_min: fValMin ? Number(fValMin) : undefined,
        value_max: fValMax ? Number(fValMax) : undefined,
        plot_no_query: fPlotNo || undefined,
        buyer_query: fBuyer || undefined,
      })
      setFilterResults(rows as any)
    } catch (e) {
      setFilterResults([])
    }
    setFiltering(false)
  }

  function resetFilters() {
    setFProject(''); setFStatus(''); setFInstall('')
    setFAreaMin(''); setFAreaMax(''); setFValMin(''); setFValMax('')
    setFPlotNo(''); setFBuyer(''); setFilterResults(null)
  }

  const fmtN = (n: number) => Number(n || 0).toLocaleString()
  const statusColor = (s: string) => s === 'available' ? colors.success : s === 'sold' ? colors.error : colors.warning

  function PlotRow({ p }: { p: any }) {
    const sc = statusColor(p.status)
    return (
      <Pressable onPress={() => navigation.navigate('PlotDetail', { plotId: p.id })} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
        <Card style={styles.rowCard}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{p.plot_no}</Text>
            <View style={[styles.statusChip, { backgroundColor: sc + '18' }]}>
              <Text style={[styles.statusText, { color: sc }]}>{PLOT_STATUS_LABELS[p.status as PlotStatus] || p.status}</Text>
            </View>
          </View>
          <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{p.project_name} · {p.block_name}</Text>
          <View style={styles.rowMeta}>
            <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>{fmtN(p.area_sqm)} م²</Text>
            <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>{fmtN(p.value)} ر.ي</Text>
            {p.buyer_name ? <Text style={[styles.rowMetaText, { color: colors.accent }]} numberOfLines={1}>{p.buyer_name}</Text> : null}
          </View>
        </Card>
      </Pressable>
    )
  }

  const numInput = (label: string, value: string, onChange: (v: string) => void) => (
    <View style={[styles.numField, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.numLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        style={[styles.numInput, { color: colors.textPrimary }]}
      />
    </View>
  )

  const chip = (label: string, active: boolean, onPress: () => void, activeColor = colors.accent) => (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? activeColor : colors.border, backgroundColor: active ? activeColor + '18' : colors.bgSecondary }]}
    >
      <Text style={[styles.chipText, { color: active ? activeColor : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  )

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-forward" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>البحث</Text>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          hitSlop={10}
          style={[styles.headerBtn, showFilters && { backgroundColor: colors.accentSurface, borderRadius: radius.md }]}
        >
          <Ionicons name="options-outline" size={20} color={showFilters ? colors.accent : colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.searchInputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن مشروع، بلوك، قطعة، مشتري"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable onPress={() => setShowFilters((v) => !v)} style={styles.filtersToggle}>
          <Ionicons name="options-outline" size={16} color={colors.accent} />
          <Text style={[styles.filtersToggleText, { color: colors.accent }]}>فلاتر متقدمة</Text>
          <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </Pressable>

        {showFilters ? (
          <Card style={styles.filterCard}>
            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>المشروع</Text>
            <View style={styles.chipRow}>
              {chip('الكل', fProject === '', () => setFProject(''))}
              {projects.map((p) => chip(p.name, fProject === p.id, () => setFProject(p.id), colors.accent))}
            </View>

            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>الحالة</Text>
            <View style={styles.chipRow}>
              {chip('الكل', fStatus === '', () => setFStatus(''))}
              {chip('متاحة', fStatus === 'available', () => setFStatus('available'), colors.success)}
              {chip('مبيعة', fStatus === 'sold', () => setFStatus('sold'), colors.error)}
              {chip('قيد التقسيط', fStatus === 'installment', () => setFStatus('installment'), colors.warning)}
            </View>

            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>نوع التقسيط</Text>
            <View style={styles.chipRow}>
              {chip('الكل', fInstall === '', () => setFInstall(''))}
              {(Object.keys(INSTALLMENT_TYPE_LABELS) as InstallmentType[]).map((k) => chip(INSTALLMENT_TYPE_LABELS[k], fInstall === k, () => setFInstall(k)))}
            </View>

            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>المساحة (م²)</Text>
            <View style={styles.numRow}>
              {numInput('من', fAreaMin, setFAreaMin)}
              {numInput('إلى', fAreaMax, setFAreaMax)}
            </View>

            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>القيمة (ر.ي)</Text>
            <View style={styles.numRow}>
              {numInput('من', fValMin, setFValMin)}
              {numInput('إلى', fValMax, setFValMax)}
            </View>

            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>رقم القطعة</Text>
            <View style={[styles.inlineInputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput value={fPlotNo} onChangeText={setFPlotNo} placeholder="مثال: قطعة 3" placeholderTextColor={colors.textMuted} style={[styles.inlineInput, { color: colors.textPrimary }]} />
            </View>

            <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>اسم المشتري</Text>
            <View style={[styles.inlineInputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput value={fBuyer} onChangeText={setFBuyer} placeholder="اسم المشتري" placeholderTextColor={colors.textMuted} style={[styles.inlineInput, { color: colors.textPrimary }]} />
            </View>

            <View style={styles.filterBtns}>
              <Button title={filtering ? 'جارٍ البحث...' : 'بحث'} onPress={runFilter} disabled={filtering} icon={<Ionicons name="search" size={14} color="#FFF" />} />
              <Button title="مسح" onPress={resetFilters} variant="ghost" />
            </View>
          </Card>
        ) : null}

        {filterResults !== null ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>نتائج الفلاتر ({filterResults.length})</Text>
            {filterResults.length === 0 ? (
              <Card style={styles.rowCard}><Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد نتائج مطابقة</Text></Card>
            ) : filterResults.map((p) => <PlotRow key={p.id} p={p} />)}
          </>
        ) : null}

        {query.trim().length === 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>تصفح المشاريع</Text>
            {projects.length === 0 ? (
              <Card style={styles.rowCard}><Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مشاريع</Text></Card>
            ) : projects.map((p) => (
              <Pressable key={p.id} onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id })} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
                <Card style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <View style={styles.projectIcon}>
                      <Ionicons name="grid-outline" size={18} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{p.name}</Text>
                      {p.description ? <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{p.description}</Text> : null}
                    </View>
                    <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        ) : null}

        {query.trim().length >= 2 ? (
          <>
            {loading ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.accent} /> : null}

            {result.projects.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>المشاريع</Text>
                {result.projects.map((p) => (
                  <Pressable key={p.id} onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id })} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
                    <Card style={styles.rowCard}>
                      <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{p.name}</Text>
                      {p.description ? <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{p.description}</Text> : null}
                    </Card>
                  </Pressable>
                ))}
              </>
            ) : null}

            {result.blocks.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>البلوكات</Text>
                {result.blocks.map((b) => (
                  <Pressable key={b.id} onPress={() => navigation.navigate('BlockDetail', { blockId: b.id, blockName: b.name, projectId: b.project_id })} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
                    <Card style={styles.rowCard}>
                      <View style={styles.rowTop}>
                        <View style={styles.projectIcon}><Ionicons name="layers-outline" size={18} color={colors.accent} /></View>
                        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{b.name}</Text>
                        <View style={[styles.statusChip, { backgroundColor: colors.surface }]}><Text style={[styles.statusText, { color: colors.textSecondary }]}>بلوك</Text></View>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </>
            ) : null}

            {result.plots.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>القطع</Text>
                {result.plots.map((p) => <PlotRow key={p.id} p={p} />)}
              </>
            ) : null}

            {!loading && result.projects.length === 0 && result.blocks.length === 0 && result.plots.length === 0 ? (
              <Card style={styles.rowCard}><Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد نتائج لـ "{query}"</Text></Card>
            ) : null}
          </>
        ) : null}
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
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, height: 46, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  filtersToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs },
  filtersToggleText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  filterCard: { padding: spacing.md, gap: spacing.sm },
  filterTitle: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold', marginTop: spacing.xs, color: '#475569' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  numRow: { flexDirection: 'row', gap: spacing.sm },
  numField: { flex: 1, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 6 },
  numLabel: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  numInput: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', padding: 0, height: 28 },
  inlineInputWrap: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
  inlineInput: { height: 42, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  filterBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold', marginTop: spacing.xs },
  rowCard: { padding: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  projectIcon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  rowSub: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', marginTop: 2 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  statusText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  rowMetaText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  emptyText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'center', paddingVertical: spacing.sm },
})