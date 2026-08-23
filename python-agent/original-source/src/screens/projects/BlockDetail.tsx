import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card } from '../../components/ui'
import { getBlock, getPlotsByBlock, ensurePlotSlots, deletePlot, deleteBlock, PLOT_STATUS_LABELS, type PlotStatus } from '../../database/projects'

export default function BlockDetail() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const blockId: string = route.params?.blockId
  const [blockName, setBlockName] = useState<string>(route.params?.blockName || 'البلوك')
  const [projectId, setProjectId] = useState<string | undefined>(route.params?.projectId)
  const [plots, setPlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { load() }, [blockId]))

  async function load() {
    setLoading(true)
    try {
      await ensurePlotSlots(blockId)
      const blk = await getBlock(blockId)
      if (blk) {
        setBlockName(blk.name)
        if (blk.project_id) setProjectId(blk.project_id)
      }
      const pls = await getPlotsByBlock(blockId)
      setPlots(pls)
    } catch (e) {
      console.error('load block failed', e)
    }
    setLoading(false)
  }

  function handleDeletePlot(p: any) {
    Alert.alert('حذف القطعة', `هل تريد حذف القطعة "${p.plot_no}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deletePlot(p.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر الحذف')) },
    ])
  }

  function handleDeleteBlock() {
    Alert.alert('حذف البلوك', 'سيتم حذف البلوك وكل قطعه. هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => {
        deleteBlock(blockId).then(() => navigation.goBack()).catch(() => Alert.alert('خطأ', 'تعذر حذف البلوك'))
      } },
    ])
  }

  const slotWidth = (width - spacing.xl * 2 - spacing.md) / 2
  const fmtN = (n: number) => Number(n || 0).toLocaleString()

  const isFilled = (p: any) => (p.area_sqm > 0) || (p.value > 0) || p.buyer_name

  const statusColor = (s: string) => s === 'available' ? colors.success : s === 'sold' ? colors.error : colors.warning

  if (loading) {
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
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{blockName}</Text>
        <View style={styles.headerActions}>
          {projectId ? (
            <Pressable onPress={() => navigation.navigate('ProjectDetail', { projectId })} hitSlop={8} style={styles.headerBtn}>
              <Ionicons name="folder-open-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => navigation.navigate('ProjectsSearch')} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={handleDeleteBlock} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          اضغط على أي قطعة لإدخال بياناتها — تظهر {plots.length} خانات حسب عدد القطع
        </Text>

        <View style={styles.grid}>
          {plots.map((p) => {
            const filled = isFilled(p)
            const sc = statusColor(p.status)
            return (
              <Pressable
                key={p.id}
                onPress={() => navigation.navigate('PlotDetail', { plotId: p.id })}
                onLongPress={() => filled && handleDeletePlot(p)}
                style={({ pressed }) => [{ width: slotWidth, opacity: pressed ? 0.8 : 1 }]}
              >
                <Card style={[styles.slot, !filled && { borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.borderHover, backgroundColor: colors.bgSecondary }]}>
                  {filled ? (
                    <>
                      <View style={styles.slotHeader}>
                        <Text style={[styles.slotNo, { color: colors.textPrimary }]} numberOfLines={1}>{p.plot_no}</Text>
                        <View style={[styles.statusChip, { backgroundColor: sc + '18' }]}>
                          <Text style={[styles.statusText, { color: sc }]}>{PLOT_STATUS_LABELS[p.status as PlotStatus] || p.status}</Text>
                        </View>
                      </View>
                      <View style={styles.slotMeta}>
                        <Text style={[styles.slotMetaText, { color: colors.textSecondary }]}>المساحة: {fmtN(p.area_sqm)} م²</Text>
                        <Text style={[styles.slotMetaText, { color: colors.textSecondary }]}>القيمة: {fmtN(p.value)} ر.ي</Text>
                      </View>
                      {p.buyer_name ? (
                        <Text style={[styles.slotBuyer, { color: colors.accent }]} numberOfLines={1}>{p.buyer_name}</Text>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.slotEmpty}>
                      <Ionicons name="add" size={30} color={colors.textMuted} />
                      <Text style={[styles.slotEmptyText, { color: colors.textMuted }]}>قطعة فارغة</Text>
                    </View>
                  )}
                </Card>
              </Pressable>
            )
          })}
        </View>

        <Text style={[styles.footHint, { color: colors.textMuted }]}>اضغط مطولاً على قطعة ممتلئة لحذفها</Text>
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
  hint: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  slot: { padding: spacing.md, minHeight: 110, borderRadius: radius.lg },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  slotNo: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  statusText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  slotMeta: { gap: 2 },
  slotMetaText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  slotBuyer: { marginTop: spacing.sm, fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  slotEmpty: { alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1 },
  slotEmptyText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  footHint: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', textAlign: 'center' },
})