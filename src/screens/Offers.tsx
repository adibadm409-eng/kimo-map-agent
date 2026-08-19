import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, RefreshControl, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { getAllOffers, deleteOffer, createOfferReminder, cancelOfferReminderById } from '../database/db'
import { OfferReminderModal } from '../components/OfferReminderModal'
import { formatPrice, formatDate } from '../utils/helpers'
import { STATUS_LABELS } from '../types'

const FILTERS = [
  { key: 'all', label: 'الجميع' },
  { key: 'buy_offer', label: 'عرض شراء' },
  { key: 'sell_offer', label: 'عرض بيع' },
]

const TYPE_ICONS: Record<string, string> = {
  buy_offer: 'arrow-down-circle-outline',
  sell_offer: 'arrow-up-circle-outline',
}

export default function Offers() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [offers, setOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [reminderOffer, setReminderOffer] = useState<any | null>(null)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    setLoading(true)
    try {
      const data = await getAllOffers()
      setOffers(data)
    } catch (e) {
      console.error('Failed to load offers:', e)
    }
    setLoading(false)
  }

  function formatReminder(value?: string): string {
    if (!value) return ''
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' })
  }

  async function saveReminder(date: Date) {
    if (!reminderOffer) return
    try {
      await createOfferReminder({
        offerId: reminderOffer.id,
        remindAt: date.toISOString(),
        title: 'متابعة العرض',
        propertyName: reminderOffer.property_name,
        clientName: reminderOffer.client_name,
        amount: Number(reminderOffer.amount) || 0,
      })
      setReminderOffer(null)
      await load()
      Alert.alert('تمت إضافة التنبيه', 'يمكنك إضافة مواعيد أخرى للعرض نفسه، وستظهر كلها في قائمة التنبيهات المحلية.')
    } catch (error) {
      Alert.alert('تعذر ضبط التنبيه', error instanceof Error ? error.message : 'تحقق من صلاحية الإشعارات والموعد.')
      throw error
    }
  }

  async function clearReminder(o: any, reminder: any) {
    try {
      await cancelOfferReminderById(String(reminder.id))
      await load()
    } catch {
      Alert.alert('خطأ', 'تعذر إلغاء تنبيه العرض')
    }
  }

  function handleDelete(o: any) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert('حذف العرض', 'هل تريد حذف هذا العرض؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteOffer(o.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر حذف العرض')) },
    ])
  }

  const filtered = offers.filter((o) => {
    const match = String(o.property_name || '').includes(search) || String(o.client_name || '').includes(search) || String(o.notes || '').includes(search)
    const pass = filter === 'all' || o.type === filter
    return match && pass
  })

  function renderItem({ item: o }: { item: any }) {
    const icon = TYPE_ICONS[o.type] || 'pricetag-outline'
    return (
      <Pressable
        onPress={() => navigation.navigate('OfferForm', { id: o.id })}
        style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.8 }]}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeIcon, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name={icon as any} size={20} color={colors.accent} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.propertyName, { color: colors.textPrimary }]} numberOfLines={1}>{o.property_name || 'طلب شراء غير مرتبط بعقار'}</Text>
              <Text style={[styles.clientName, { color: colors.textSecondary }]} numberOfLines={1}>{o.client_name || 'بدون عميل — العميل محذوف'}</Text>
            </View>
            <StatusBadge label={STATUS_LABELS[o.status] || o.status} value={o.status} />
          </View>
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <Text style={[styles.amount, { color: colors.accent }]}>
              {formatPrice(o.amount)} <Text style={[styles.amountUnit, { color: colors.textMuted }]}>ريال يمني</Text>
            </Text>
            <Text style={[styles.date, { color: colors.textMuted }]}>{formatDate(o.date)}</Text>
            <Pressable
              onPress={() => handleDelete(o)}
              style={({ pressed }) => [{ padding: spacing.xs }, pressed && { opacity: 0.5 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
            </Pressable>
          </View>
          {(() => {
            const reminders = Array.isArray(o.reminders) && o.reminders.length
              ? o.reminders
              : o.reminder_at ? [{ id: `legacy-${o.id}`, remind_at: o.reminder_at }] : []
            return reminders.length ? (
              <View style={[styles.remindersWrap, { borderTopColor: colors.border, backgroundColor: colors.infoSurface }]}>
                {reminders.map((reminder: any) => (
                  <View key={String(reminder.id)} style={styles.reminderRow}>
                    <Ionicons name="notifications-outline" size={15} color={colors.info} />
                    <Text style={[styles.reminderText, { color: colors.textSecondary }]} numberOfLines={1}>التنبيه: {formatReminder(reminder.remind_at)}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="إضافة تنبيه آخر للعرض" onPress={(event) => { event.stopPropagation(); setReminderOffer(o) }} hitSlop={8} style={styles.reminderAction}><Ionicons name="add-circle-outline" size={17} color={colors.info} /></Pressable>
                    {String(reminder.id).startsWith('legacy-') ? null : <Pressable accessibilityRole="button" accessibilityLabel="إلغاء هذا التنبيه" onPress={(event) => { event.stopPropagation(); void clearReminder(o, reminder) }} hitSlop={8} style={styles.reminderAction}><Ionicons name="close-circle-outline" size={17} color={colors.error} /></Pressable>}
                  </View>
                ))}
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="ضبط تنبيه للعرض" onPress={(event) => { event.stopPropagation(); setReminderOffer(o) }} style={({ pressed }) => [styles.setReminderRow, { borderTopColor: colors.border, opacity: pressed ? 0.65 : 1 }]}>
                <Ionicons name="alarm-outline" size={15} color={colors.accent} />
                <Text style={[styles.setReminderText, { color: colors.accent }]}>ضبط تنبيه متابعة</Text>
              </Pressable>
            )
          })()}
        </Card>
      </Pressable>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchBar}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="بحث..." placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.textPrimary }]} />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={styles.filterBar}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => { Haptics.selectionAsync(); setFilter(f.key) }}
            style={[styles.filterTab, filter === f.key ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
          >
            <Text style={[styles.filterTabText, { color: filter === f.key ? '#FFF' : colors.textSecondary, fontFamily: 'Tajawal_500Medium' }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlashList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="pricetags-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{search || filter !== 'all' ? 'لا توجد نتائج' : 'لا توجد عروض بعد'}</Text>
          </View>
        }
      />
      <OfferReminderModal
        visible={Boolean(reminderOffer)}
        initialAt={reminderOffer?.reminder_at}
        title={reminderOffer ? `${reminderOffer.property_name || 'طلب شراء غير مرتبط بعقار'} — ${reminderOffer.client_name || 'بدون عميل — العميل محذوف'}` : 'العرض'}
        onClose={() => setReminderOffer(null)}
        onSave={saveReminder}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  pageSubtitle: { fontSize: fontSize.md, marginTop: 2, fontFamily: 'Tajawal_400Regular' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', color: '#FFF' },
  searchBar: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.md, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  filterBar: { maxHeight: 50 },
  filterScroll: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  filterTab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
  filterTabText: { fontSize: fontSize.md, fontWeight: '500' },
  list: { padding: spacing.xl, paddingTop: spacing.md },
  cardWrap: { paddingBottom: spacing.md },
  card: { padding: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  typeIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 2 },
  propertyName: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  clientName: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  remindersWrap: { borderTopWidth: StyleSheet.hairlineWidth },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  reminderText: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  reminderAction: { padding: spacing.xs },
  setReminderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  setReminderText: { fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  amount: { fontSize: fontSize.lg, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' },
  amountUnit: { fontSize: fontSize.sm, fontWeight: '500', fontFamily: 'Tajawal_500Medium' },
  date: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxl * 2, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})
