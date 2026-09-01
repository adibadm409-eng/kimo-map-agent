import { useCallback, useState } from 'react'
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { Card } from '../components/ui'
import { cancelReminder, getAllReminders } from '../database/db'
import { fontSize, radius, spacing } from '../theme/tokens'

export default function Reminders() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [reminders, setReminders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReminders(await getAllReminders())
    } catch {
      Alert.alert('خطأ', 'تعذر تحميل التذكيرات')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const targetLabel = (item: any): string => {
    const labels: Record<string, string> = { general: 'عام', offer: 'عرض', property: 'عقار', client: 'عميل', viewing: 'معاينة', project: 'مشروع', payment: 'دفعة', campaign: 'حملة', area: 'منطقة', waypoint: 'نقطة' }
    const kind = labels[String(item.target_type || 'general')] ?? String(item.target_type || 'مرتبط')
    return item.target_id ? `مرتبط بـ${kind} (${item.target_id})` : kind
  }

  const handleCancel = (item: any) => {
    Alert.alert('إلغاء التذكير', `هل تريد إلغاء «${item.title}»؟`, [
      { text: 'تراجع', style: 'cancel' },
      { text: 'إلغاء التذكير', style: 'destructive', onPress: async () => {
        try {
          await cancelReminder(item.id)
          await load()
        } catch {
          Alert.alert('خطأ', 'تعذر إلغاء التذكير')
        }
      } },
    ])
  }

  const renderItem = ({ item }: { item: any }) => {
    const date = new Date(item.remind_at)
    const dateLabel = Number.isNaN(date.getTime()) ? item.remind_at : date.toLocaleString('ar-YE', { dateStyle: 'full', timeStyle: 'short' })
    return (
      <Card style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: colors.infoSurface }]}>
          <Ionicons name="notifications-outline" size={22} color={colors.info} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
          {item.body ? <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={3}>{item.body}</Text> : null}
          <Text style={[styles.target, { color: colors.textMuted }]} numberOfLines={1}>{targetLabel(item)}</Text>
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={15} color={colors.accent} />
            <Text style={[styles.date, { color: colors.accent }]}>{dateLabel}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`إلغاء التذكير ${item.title}`} onPress={() => handleCancel(item)} hitSlop={8} style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="close-outline" size={19} color={colors.error} />
        </Pressable>
      </Card>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-forward" size={25} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>التذكيرات</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>تنبيهات محلية قادمة من كيمو أو من التطبيق</Text>
        </View>
        <Ionicons name="alarm-outline" size={24} color={colors.accent} />
      </View>
      <FlashList
        data={reminders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={54} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>لا توجد تذكيرات قادمة</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>قل لكيمو: «ذكرني بعد ساعتين أن أتصل بالعميل».</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { flex: 1 },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  headerSubtitle: { fontSize: fontSize.xs, marginTop: 3, fontFamily: 'Tajawal_400Regular' },
  list: { padding: spacing.xl, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  body: { fontSize: fontSize.sm, lineHeight: 20, fontFamily: 'Tajawal_400Regular' },
  target: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  date: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  cancelBtn: { width: 34, height: 34, borderWidth: 1, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: spacing.xxxl * 2, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center', fontFamily: 'Tajawal_400Regular' },
})
