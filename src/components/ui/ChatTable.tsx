import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, fontSize } from '../../theme/tokens'

interface ChatTableProps {
  header: string[]
  rows: string[][]
}

const MIN_CELL_WIDTH = 96
const MAX_CELL_WIDTH = 280
const CHAR_PX = 7

function parseWidths(header: string[], rows: string[][]): number[] {
  const n = Math.max(header.length, ...rows.map((r) => r.length))
  const widths: number[] = []
  for (let c = 0; c < n; c++) {
    const longest = Math.max(
      String(header[c] ?? '').length,
      ...rows.map((r) => String(r[c] ?? '').length)
    )
    widths[c] = Math.min(MAX_CELL_WIDTH, Math.max(MIN_CELL_WIDTH, longest * CHAR_PX + spacing.lg * 2))
  }
  return widths
}

export default function ChatTable({ header, rows }: ChatTableProps) {
  const { colors } = useTheme()
  const widths = parseWidths(header, rows)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.table, { borderColor: colors.border }]}>
        {header.length ? (
          <View style={[styles.headRow, { backgroundColor: colors.surface }]}>
            {header.map((h, c) => (
              <View key={c} style={[styles.cell, { width: widths[c] ?? MIN_CELL_WIDTH, borderRightColor: colors.border }]}>
                <Text style={[styles.headText, { color: colors.textPrimary }]}>{h}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {rows.map((r, i) => (
          <View key={i} style={[styles.row, { borderTopColor: colors.border }]}>
            {r.map((v, c) => (
              <View key={c} style={[styles.cell, { width: widths[c] ?? MIN_CELL_WIDTH, borderRightColor: colors.border }]}>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{v}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { marginVertical: spacing.xs },
  scrollContent: { flexDirection: 'row' },
  table: { borderWidth: 1, borderRadius: 6, overflow: 'hidden' },
  headRow: { flexDirection: 'row' },
  row: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cell: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderRightWidth: StyleSheet.hairlineWidth },
  headText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold', textAlign: 'right' },
  bodyText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
})