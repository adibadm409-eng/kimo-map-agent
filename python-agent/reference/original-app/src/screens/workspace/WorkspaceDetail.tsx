import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card } from '../../components/ui'
import { GenericDataTable } from '../../components/ui/GenericWorkspaceTable'
import { getWorkspace, listProjectMemory, deleteProjectMemoryEntry } from '../../database/workspace'
import { useReloadOnData, notifyDataChanged } from '../../database/dataSync'

const ORIGIN_LABELS: Record<string, string> = { manual: 'يدوي', template: 'قالب', import: 'مستورد من ملف' }

export default function WorkspaceDetail() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const [ws, setWs] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<any[]>([])
  const workspaceId = route.params?.workspaceId

  useReloadOnData(load, [workspaceId])

  async function load() {
    setLoading(true)
    try {
      setWs(await getWorkspace(workspaceId, { includeRows: true }))
      setNotes(await listProjectMemory(workspaceId).catch(() => []))
    } catch (e) {
      console.error('load workspace failed', e)
    }
    setLoading(false)
  }

  function confirmDeleteNote(note: any) {
    Alert.alert('حذف المذكرة', 'سيتم حذف هذه الملاحظة التي كتبها المساعد عن المشروع. هل تريد المتابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deleteProjectMemoryEntry(note.id).catch(() => {})
          notifyDataChanged('workspace')
          load()
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  if (!ws) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textMuted, fontFamily: 'Tajawal_400Regular' }}>لم يتم العثور على مساحة العمل</Text>
      </View>
    )
  }

  const origin = ORIGIN_LABELS[ws.origin] || ws.origin || ''

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{ws.name}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {origin}{ws.sourceFile ? ` • من "${ws.sourceFile}"` : ''}{ws.description ? `\n${ws.description}` : ''}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Ionicons name="layers-outline" size={14} color={colors.accent} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{ws.tablesCount} جدول</Text>
            </View>
            <View style={styles.statChip}>
              <Ionicons name="list-outline" size={14} color={colors.accent} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{ws.rowsCount} سجل</Text>
            </View>
          </View>
        </View>

        {(ws.tables ?? []).length === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="grid-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد جداول في هذه المساحة بعد</Text>
          </Card>
        ) : (
          ws.tables.map((t: any) => (
            <View key={t.id}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableTitle, { color: colors.textPrimary }]}>{t.name}</Text>
                <View style={styles.tableMeta}>
                  <Text style={[styles.tableRows, { color: colors.textSecondary }]}>{t.rowCount} سجل</Text>
                </View>
              </View>
              <GenericDataTable title={t.name} columns={t.columns} rows={t.rows ?? []} />
            </View>
          ))
        )}

        <View style={styles.notesSection}>
          <View style={styles.tableHeader}>
            <View style={styles.notesTitleRow}>
              <Ionicons name="document-text-outline" size={16} color={colors.warning} />
              <Text style={[styles.tableTitle, { color: colors.textPrimary }]}>مذكرات المساعد</Text>
            </View>
            <Text style={[styles.tableRows, { color: colors.textMuted }]}>ملاحظات يفهم بها المشروع في جلسات لاحقة — يمكنك حذفها</Text>
          </View>
          {notes.length === 0 ? (
            <Card style={styles.notesEmpty}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مذكرات محفوظة بعد</Text>
            </Card>
          ) : (
            notes.map((n) => (
              <View key={n.id} style={[styles.noteRow, { backgroundColor: colors.warningSurface, borderColor: colors.border }]}>
                <Ionicons name="sparkles-outline" size={13} color={colors.warning} style={{ marginTop: 2 }} />
                <Text style={[styles.noteText, { color: colors.textSecondary }]}>{n.body}</Text>
                <Pressable onPress={() => confirmDeleteNote(n)} hitSlop={10} style={styles.noteDelete}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backBtn: { position: 'absolute', top: 8, right: spacing.xl, zIndex: 10, width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' },
  subtitle: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', color: '#94A3B8' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full },
  statText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  empty: { padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'center' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  tableTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  tableMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tableRows: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  notesSection: { gap: spacing.sm, marginTop: spacing.sm },
  notesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notesEmpty: { padding: spacing.lg, alignItems: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  noteText: { flex: 1, fontSize: fontSize.sm, lineHeight: 20, fontFamily: 'Tajawal_400Regular' },
  noteDelete: { padding: 2 },
})