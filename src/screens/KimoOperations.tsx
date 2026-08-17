import { useCallback, useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../theme/ThemeContext'
import { spacing, fontSize, radius } from '../theme/tokens'
import { queryChangeLog, type ChangeLogEntry } from '../database/audit'
import { useReloadOnData } from '../database/dataSync'

type ScopeFilter = 'agent' | 'all'

type Summary = {
  total: number
  create: number
  update: number
  delete: number
  other: number
}

function actionLabel(action: string): string {
  if (action === 'create') return 'إنشاء'
  if (action === 'update') return 'تعديل'
  if (action === 'delete') return 'حذف'
  if (action === 'restore') return 'استعادة'
  if (action === 'import') return 'استيراد'
  return action || 'عملية'
}

function actionColor(action: string): string {
  if (action === 'create') return '#16A34A'
  if (action === 'update') return '#2563EB'
  if (action === 'delete') return '#DC2626'
  return '#64748B'
}

function scopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    properties: 'العقارات',
    clients: 'العملاء',
    offers: 'العروض',
    viewings: 'المعاينات',
    campaigns: 'الحملات',
    waypoints: 'نقاط الخريطة',
    areas: 'المناطق',
    projects: 'المشاريع',
    blocks: 'البلوكات',
    plots: 'القطع',
    reminders: 'التذكيرات',
  }
  return labels[scope] ?? scope
}

function formatTime(timestamp: number): string {
  if (!timestamp) return 'وقت غير متاح'
  return new Date(timestamp).toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatSnapshot(value: unknown): string {
  if (value == null) return 'لا توجد لقطة'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function KimoOperationsScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [filter, setFilter] = useState<ScopeFilter>('agent')
  const [entries, setEntries] = useState<ChangeLogEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const rows = await queryChangeLog({ actor: filter === 'agent' ? 'agent' : undefined, limit: 160 })
      setEntries(rows)
    } finally {
      setBusy(false)
    }
  }, [filter])

  useReloadOnData(load, [load])

  const summary = useMemo<Summary>(() => {
    const result: Summary = { total: entries.length, create: 0, update: 0, delete: 0, other: 0 }
    for (const entry of entries) {
      if (entry.action === 'create') result.create += 1
      else if (entry.action === 'update') result.update += 1
      else if (entry.action === 'delete') result.delete += 1
      else result.other += 1
    }
    return result
  }, [entries])

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}> 
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}> 
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="العودة">
          <Ionicons name="arrow-forward" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>إشراف Kimo</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>بيانات محلية وسجل عمليات قابل للمراجعة</Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.refreshButton} accessibilityLabel="تحديث سجل عمليات Kimo">
          <Ionicons name="refresh-outline" size={21} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={[styles.sourceBanner, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}> 
          <Ionicons name="shield-checkmark-outline" size={20} color="#16A34A" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>المصدر: SQLite المحلي</Text>
            <Text style={[styles.bannerText, { color: colors.textSecondary }]}>كل عملية تظهر هنا من قاعدة التطبيق نفسها؛ لا توجد نسخة سحابية أو سجل منفصل.</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard label="الإجمالي" value={summary.total} color={colors.accent} colors={colors} />
          <SummaryCard label="إنشاء" value={summary.create} color="#16A34A" colors={colors} />
          <SummaryCard label="تعديل" value={summary.update} color="#2563EB" colors={colors} />
          <SummaryCard label="حذف" value={summary.delete} color="#DC2626" colors={colors} />
        </View>

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>سجل العمليات</Text>
            <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>راجع المنفذ والكيان والنتيجة قبل اعتبار أي مهمة مكتملة.</Text>
          </View>
          <View style={[styles.filter, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}> 
            <Pressable onPress={() => setFilter('agent')} style={[styles.filterButton, filter === 'agent' && { backgroundColor: colors.accent }]}> 
              <Text style={[styles.filterText, { color: filter === 'agent' ? '#FFF' : colors.textSecondary }]}>Kimo</Text>
            </Pressable>
            <Pressable onPress={() => setFilter('all')} style={[styles.filterButton, filter === 'all' && { backgroundColor: colors.accent }]}> 
              <Text style={[styles.filterText, { color: filter === 'all' ? '#FFF' : colors.textSecondary }]}>الكل</Text>
            </Pressable>
          </View>
        </View>

        {busy && entries.length === 0 ? (
          <View style={styles.emptyState}><ActivityIndicator color={colors.accent} /><Text style={[styles.emptyText, { color: colors.textSecondary }]}>جاري قراءة السجل المحلي...</Text></View>
        ) : entries.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}> 
            <Ionicons name="document-text-outline" size={30} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>لا توجد عمليات مسجلة في النطاق الحالي.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {entries.map((entry) => (
              <OperationCard key={entry.id} entry={entry} expanded={expandedId === entry.id} onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)} colors={colors} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function SummaryCard({ label, value, color, colors }: { label: string; value: number; color: string; colors: any }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}> 
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

function OperationCard({ entry, expanded, onToggle, colors }: { entry: ChangeLogEntry; expanded: boolean; onToggle: () => void; colors: any }) {
  const color = actionColor(entry.action)
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.operationCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}> 
      <View style={styles.operationTop}>
        <View style={[styles.actionBadge, { backgroundColor: color + '18' }]}> 
          <Text style={[styles.actionText, { color }]}>{actionLabel(entry.action)}</Text>
        </View>
        <View style={styles.operationMeta}>
          <Text style={[styles.scopeText, { color: colors.textPrimary }]}>{scopeLabel(entry.scope)}</Text>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(entry.createdAt)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </View>
      <Text style={[styles.summaryText, { color: colors.textPrimary }]}>{entry.summary || 'عملية مسجلة دون وصف'}</Text>
      <Text style={[styles.idText, { color: colors.textMuted }]} numberOfLines={1}>المعرف: {entry.scopeId}{entry.tool ? ` · المسار: ${entry.tool}` : ''}</Text>
      {expanded && (
        <View style={[styles.details, { borderTopColor: colors.border }]}> 
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>المنفذ: {entry.actor} · الجلسة: {entry.sessionId || 'غير مرتبطة'}</Text>
          <Text style={[styles.snapshotLabel, { color: colors.textSecondary }]}>قبل التنفيذ</Text>
          <Text selectable style={[styles.snapshot, { color: colors.textPrimary, backgroundColor: colors.bg }]}>{formatSnapshot(entry.before)}</Text>
          <Text style={[styles.snapshotLabel, { color: colors.textSecondary }]}>بعد التنفيذ</Text>
          <Text selectable style={[styles.snapshot, { color: colors.textPrimary, backgroundColor: colors.bg }]}>{formatSnapshot(entry.after)}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { padding: spacing.xs },
  refreshButton: { padding: spacing.xs },
  headerText: { flex: 1, alignItems: 'flex-end', marginHorizontal: spacing.sm },
  title: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.lg },
  subtitle: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs, marginTop: 2 },
  content: { padding: spacing.md, gap: spacing.md },
  sourceBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  bannerTitle: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm, textAlign: 'right' },
  bannerText: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs, textAlign: 'right', marginTop: 2 },
  summaryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: { flexGrow: 1, flexBasis: '22%', minWidth: 70, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  summaryValue: { fontFamily: 'Tajawal_800ExtraBold', fontSize: 22 },
  summaryLabel: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.xs, marginTop: 2 },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.md, textAlign: 'right' },
  sectionHint: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs, textAlign: 'right', marginTop: 2 },
  filter: { flexDirection: 'row-reverse', borderWidth: 1, borderRadius: radius.md, padding: 2 },
  filterButton: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm },
  filterText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.xs },
  operationCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  operationTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  actionBadge: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  actionText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.xs },
  operationMeta: { flex: 1, alignItems: 'flex-end' },
  scopeText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  timeText: { fontFamily: 'Tajawal_400Regular', fontSize: 11, marginTop: 2 },
  summaryText: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm, textAlign: 'right', marginTop: spacing.sm },
  idText: { fontFamily: 'Tajawal_400Regular', fontSize: 10, textAlign: 'right', marginTop: 4 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.sm, paddingTop: spacing.sm },
  detailLabel: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs, textAlign: 'right' },
  snapshotLabel: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.xs, textAlign: 'right', marginTop: spacing.sm, marginBottom: 4 },
  snapshot: { fontFamily: 'monospace', fontSize: 10, padding: spacing.sm, borderRadius: radius.sm, textAlign: 'left', writingDirection: 'ltr' },
  emptyState: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.lg },
  emptyText: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.sm, textAlign: 'center' },
})
