import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card } from '../../components/ui'
import { listWorkspaces, deleteWorkspace } from '../../database/workspace'
import { useReloadOnData } from '../../database/dataSync'

const ORIGIN_LABELS: Record<string, string> = { manual: 'يدوي', template: 'قالب', import: 'مستورد من ملف' }

export default function WorkspacesScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useReloadOnData(load, [])

  async function load() {
    setLoading(true)
    try {
      setItems(await listWorkspaces())
    } catch (e) {
      console.error('list workspaces failed', e)
    }
    setLoading(false)
  }

  function confirmDelete(item: any) {
    Alert.alert('حذف مساحة العمل', `سيتم حذف «${item.name}» بكل جداولها وسجلاتها نهائياً. هل أنت متأكد؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWorkspace(item.id)
            load()
          } catch {
            Alert.alert('خطأ', 'تعذر حذف مساحة العمل')
          }
        },
      },
    ])
  }

  function renderItem({ item }: { item: any }) {
    const origin = ORIGIN_LABELS[item.origin] || item.origin || ''
    const source = item.sourceFile ? ` — من "${item.sourceFile}"` : ''
    const desc = item.description || `${origin}${source}`
    return (
      <Pressable
        onPress={() => navigation.navigate('WorkspaceDetail', { workspaceId: item.id })}
        onLongPress={() => confirmDelete(item)}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      >
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accentSurface }]}>
              <Ionicons name="grid-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.desc, { color: colors.textMuted }]} numberOfLines={1}>{desc}</Text>
              <View style={styles.statsRow}>
                <Text style={[styles.stat, { color: colors.textSecondary }]}>{item.tablesCount} جدول</Text>
                <Text style={[styles.statDot, { color: colors.textMuted }]}>·</Text>
                <Text style={[styles.stat, { color: colors.textSecondary }]}>{item.rowsCount} سجل</Text>
              </View>
            </View>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={10} style={[styles.deleteBtn, { backgroundColor: colors.surface }]}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
            </Pressable>
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
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>مساحات العمل</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>المشاريع الحرة التي أُنشئت أو استُوردت بواسطة المساعد</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            لا توجد مساحات عمل بعد. اطلب من المساعد تنظيم مشروعك (أو استيراد ملف Excel/CSV) وستظهر بياناته هنا.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' },
  subtitle: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', marginTop: 2 },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  desc: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  stat: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  statDot: { fontSize: fontSize.xs },
  deleteBtn: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: spacing.xxl, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'center' },
})