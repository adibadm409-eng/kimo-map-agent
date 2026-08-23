import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card, Button } from '../../components/ui'
import { getProject, getBlocksByProject, getPlotsByBlock, deleteProject } from '../../database/projects'

type BlockRow = {
  id: string
  name: string
  notes: string
  plot_count: number
  available: number
  sold: number
  installment: number
}

export default function ProjectDetail() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const projectId: string = route.params?.projectId
  const [project, setProject] = useState<any>(null)
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [totals, setTotals] = useState({ plots: 0, available: 0, sold: 0, installment: 0, value: 0, collected: 0 })
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { load() }, [projectId]))

  async function load() {
    setLoading(true)
    try {
      const p = await getProject(projectId)
      setProject(p)
      const blks = await getBlocksByProject(projectId)
      const rows: BlockRow[] = await Promise.all(
        blks.map(async (b) => {
          const plots = await getPlotsByBlock(b.id)
          return {
            id: b.id,
            name: b.name,
            notes: b.notes || '',
            plot_count: b.plot_count,
            available: plots.filter((x) => x.status === 'available').length,
            sold: plots.filter((x) => x.status === 'sold').length,
            installment: plots.filter((x) => x.status === 'installment').length,
          }
        })
      )
      setBlocks(rows)
      const allPlots = await Promise.all(rows.map((r) => getPlotsByBlock(r.id).catch(() => [])))
      const flat = allPlots.flat()
      setTotals({
        plots: flat.length,
        available: flat.filter((x) => x.status === 'available').length,
        sold: flat.filter((x) => x.status === 'sold').length,
        installment: flat.filter((x) => x.status === 'installment').length,
        value: flat.reduce((s, x) => s + (x.value || 0), 0),
        collected: flat.reduce((s, x) => s + (x.paid_amount || 0), 0),
      })
    } catch (e) {
      console.error('load project detail failed', e)
    }
    setLoading(false)
  }

  function handleDelete() {
    Alert.alert('حذف المشروع', `هل تريد حذف مشروع "${project?.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteProject(projectId).then(() => navigation.navigate('ProjectsList')).catch(() => Alert.alert('خطأ', 'تعذر الحذف')) },
    ])
  }

  const fmtN = (n: number) => Number(n || 0).toLocaleString()

  if (loading || !project) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-forward" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{project.name}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('ProjectForm', { projectId })} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="pencil" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {project.description ? (
          <Card style={styles.card}>
            <Text style={[styles.desc, { color: colors.textSecondary }]}>{project.description}</Text>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <View style={styles.totalsGrid}>
            <View style={styles.totItem}>
              <Ionicons name="square-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.totLabel, { color: colors.textMuted }]}>القطع</Text>
              <Text style={[styles.totValue, { color: colors.textPrimary }]}>{totals.plots}</Text>
            </View>
            <View style={styles.totItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={[styles.totLabel, { color: colors.textMuted }]}>متاحة</Text>
              <Text style={[styles.totValue, { color: colors.success }]}>{totals.available}</Text>
            </View>
            <View style={styles.totItem}>
              <Ionicons name="close-circle-outline" size={16} color={colors.error} />
              <Text style={[styles.totLabel, { color: colors.textMuted }]}>مبيعة</Text>
              <Text style={[styles.totValue, { color: colors.error }]}>{totals.sold}</Text>
            </View>
            <View style={styles.totItem}>
              <Ionicons name="time-outline" size={16} color={colors.warning} />
              <Text style={[styles.totLabel, { color: colors.textMuted }]}>تقسيط</Text>
              <Text style={[styles.totValue, { color: colors.warning }]}>{totals.installment}</Text>
            </View>
            <View style={styles.totItem}>
              <Ionicons name="cash-outline" size={16} color={colors.accent} />
              <Text style={[styles.totLabel, { color: colors.textMuted }]}>القيمة</Text>
              <Text style={[styles.totValue, { color: colors.accent }]}>{fmtN(totals.value)}</Text>
            </View>
            <View style={styles.totItem}>
              <Ionicons name="trending-down-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.totLabel, { color: colors.textMuted }]}>المحصل</Text>
              <Text style={[styles.totValue, { color: colors.textSecondary }]}>{fmtN(totals.collected)}</Text>
            </View>
          </View>
        </Card>

        <View style={styles.actionsRow}>
          <View style={styles.actionsInner}>
            <Button title="إضافة بلوك" onPress={() => navigation.navigate('BlockForm', { projectId })} size="sm" icon={<Ionicons name="add" size={14} color="#FFF" />} />
          </View>
          <View style={styles.actionsInner}>
            <Button title="التقارير" onPress={() => navigation.navigate('ProjectReports', { projectId })} size="sm" variant="outline" icon={<Ionicons name="bar-chart-outline" size={14} color={colors.textPrimary} />} />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>البلوكات</Text>
        {blocks.length === 0 ? (
          <Card style={styles.card}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد بلوكات بعد — أضف البلوك الأول</Text>
          </Card>
        ) : (
          blocks.map((b) => (
            <Pressable key={b.id} onLongPress={() => navigation.navigate('BlockForm', { projectId, blockId: b.id })}>
              <Card style={styles.blockCard} onPress={() => navigation.navigate('BlockDetail', { blockId: b.id })}>
                <View style={styles.blockHeader}>
                  <View style={styles.blockNameWrap}>
                    <Ionicons name="grid-outline" size={18} color={colors.accent} />
                    <Text style={[styles.blockName, { color: colors.textPrimary }]}>{b.name}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
                </View>
                {b.notes ? <Text style={[styles.blockNotes, { color: colors.textMuted }]} numberOfLines={1}>{b.notes}</Text> : null}
                <View style={styles.blockStats}>
                  <View style={[styles.chip, { backgroundColor: colors.surface }]}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{b.plot_count} قطعة</Text></View>
                  <View style={[styles.chip, { backgroundColor: colors.successSurface }]}><Text style={[styles.chipText, { color: colors.success }]}>{b.available} متاحة</Text></View>
                  <View style={[styles.chip, { backgroundColor: colors.errorSurface }]}><Text style={[styles.chipText, { color: colors.error }]}>{b.sold} مبيعة</Text></View>
                  <View style={[styles.chip, { backgroundColor: colors.warningSurface }]}><Text style={[styles.chipText, { color: colors.warning }]}>{b.installment} تقسيط</Text></View>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 4 },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold', paddingHorizontal: spacing.xs },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { padding: spacing.md },
  desc: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', lineHeight: 20 },
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  totItem: { flex: 1, minWidth: '30%', alignItems: 'center', gap: 2, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: '#F8FAFC' },
  totLabel: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  totValue: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionsInner: { flex: 1 },
  sectionTitle: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold', marginTop: spacing.sm },
  blockCard: { padding: spacing.md },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockNameWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  blockName: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  blockNotes: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', marginTop: 2 },
  blockStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  chipText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  emptyText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'center', paddingVertical: spacing.sm },
})