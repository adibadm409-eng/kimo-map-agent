import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card } from '../../components/ui'
import { getAllProjects, getBlocksByProject, deleteProject } from '../../database/projects'
import { listWorkspaces } from '../../database/workspace'
import { useReloadOnData } from '../../database/dataSync'

type ProjectRow = {
  id: string
  name: string
  description: string
  blocks: number
  plots: number
}

export default function ProjectsScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const navigation = useNavigation<any>()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [agentWsCount, setAgentWsCount] = useState(0)
  const [agentWsRows, setAgentWsRows] = useState(0)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    setLoading(true)
    try {
      const all = await getAllProjects()
      const rows: ProjectRow[] = await Promise.all(
        all.map(async (p) => {
          const blocks = await getBlocksByProject(p.id)
          return {
            id: p.id,
            name: p.name,
            description: p.description || '',
            blocks: blocks.length,
            plots: blocks.reduce((s, b) => s + (b.plot_count || 0), 0),
          }
        })
      )
      setProjects(rows)
      const ws = await listWorkspaces().catch(() => [] as any[])
      setAgentWsCount(ws.length)
      setAgentWsRows(ws.reduce((s, w) => s + (w.rowsCount || 0), 0))
    } catch (e) {
      console.error('load projects failed', e)
    }
    setLoading(false)
  }

  useReloadOnData(load, [])

  function handleDelete(p: ProjectRow) {
    Alert.alert('حذف المشروع', `هل تريد حذف مشروع "${p.name}" وكل بلوكاته وقطعه؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteProject(p.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر حذف المشروع')) },
    ])
  }

  const cardWidth = (width - spacing.xl * 2 - spacing.md) / 2

  function renderItem({ item }: { item: ProjectRow }) {
    return (
      <Pressable
        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
        onLongPress={() => handleDelete(item)}
        style={({ pressed }) => [{ width: cardWidth, opacity: pressed ? 0.8 : 1 }]}
      >
        <Card style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSurface }]}>
            <Ionicons name="grid-outline" size={28} color={colors.accent} />
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.desc, { color: colors.textMuted }]} numberOfLines={2}>
            {item.description || 'لا يوجد وصف'}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="layers-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.blocks} بلوك</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="square-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.plots} قطعة</Text>
            </View>
          </View>
        </Card>
      </Pressable>
    )
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerBtns}>
        <Pressable
          onPress={() => navigation.navigate('WorkspacesList')}
          style={[styles.headerBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="grid-outline" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('ProjectsSearch')}
          style={[styles.headerBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => navigation.navigate('WorkspacesList')}
        style={({ pressed }) => [
          styles.agentWsCard,
          { backgroundColor: colors.warningSurface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View style={[styles.agentWsIcon, { backgroundColor: colors.warning + '1A' }]}>
          <Ionicons name="sparkles-outline" size={20} color={colors.warning} />
        </View>
        <View style={styles.agentWsInfo}>
          <Text style={[styles.agentWsTitle, { color: colors.textPrimary }]}>مشاريع الوكيل الحرة (مساحات العمل)</Text>
          <Text style={[styles.agentWsDesc, { color: colors.textMuted }]}>
            {agentWsCount > 0
              ? `${agentWsCount} مساحة عمل — ${agentWsRows} سجل أنشأها المساعد أو استوردها من ملفات`
              : 'ما ينشئه المساعد بجداول حرة أو يستورده من ملفات Excel/CSV يظهر هنا — اضغط للاستعراض'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={colors.warning} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>المشاريع الرسمية</Text>

      {projects.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مشاريع بعد</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      <SectionFab onPress={() => navigation.navigate('ProjectForm', {})} label="إضافة مشروع" />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontFamily: 'Tajawal_800ExtraBold' },
  headerBtns: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  addWrap: { marginBottom: spacing.md },
  card: { padding: spacing.md, minHeight: 150 },
  iconWrap: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  name: { fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold', marginBottom: 2 },
  desc: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', marginBottom: spacing.sm, flex: 1 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  columnWrap: { gap: spacing.md },
  listContent: { paddingBottom: spacing.xxl, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_500Medium' },
  agentWsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  agentWsIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  agentWsInfo: { flex: 1, gap: 2 },
  agentWsTitle: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  agentWsDesc: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 18 },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'Tajawal_700Bold', marginBottom: spacing.sm },
})