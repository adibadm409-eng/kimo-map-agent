import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import type { WorkspaceColumn } from '../../database/workspace'

interface GenericDataTableProps {
  title: string
  columns: WorkspaceColumn[]
  rows: Record<string, any>[]
}

/**
 * عارض بيانات عام لأي جدول من مساحات العمل:
 * يعرض الأعمدة كأول صف عريض ثم كل صف تحته بقيم أعمته بتوزيع متساوٍ —
 * بلا ربط بنموذج عقاري محدد، فيخدم أي جداول/أعمدة/صفوف ينشئها الوكيل.
 */
export function GenericDataTable({ title, columns, rows }: GenericDataTableProps) {
  const { colors } = useTheme()
  if (!columns.length) {
    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.empty, { color: colors.textMuted }]}>جدول بلا أعمدة</Text>
      </View>
    )
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.rowCount, { color: colors.textMuted }]}>{rows.length} سجل</Text>
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>لا صفوف بعد</Text>
      ) : (
        <View style={styles.wrap}>
          <View style={[styles.headRow, { backgroundColor: colors.surface }]}>
            {columns.map((c) => (
              <View key={c.key} style={styles.cell}>
                <Text style={[styles.headCellText, { color: colors.textPrimary }]} numberOfLines={1}>{c.label}</Text>
              </View>
            ))}
          </View>
          <ScrollView>
            {rows.map((r, i) => (
              <View key={i} style={[styles.bodyRow, { borderBottomColor: colors.border }]}>
                {columns.map((c) => {
                  const v = r?.[c.key]
                  return (
                    <View key={c.key} style={styles.cell}>
                      <Text style={[styles.bodyCellText, { color: colors.textSecondary }]} numberOfLines={2}>{v == null || v === '' ? '—' : String(v)}</Text>
                    </View>
                  )
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.lg },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  rowCount: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  empty: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'center', paddingVertical: spacing.md },
  headRow: { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.xs },
  bodyRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs },
  wrap: { flexDirection: 'row' },
  cell: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 6, minWidth: 80 },
  headCellText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  bodyCellText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
})