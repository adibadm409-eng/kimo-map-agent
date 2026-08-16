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
import { getAllClients, deleteClient } from '../database/db'
import { formatPrice } from '../utils/helpers'
import { CallButton } from '../components/CallButton'

const FILTERS = [
  { key: 'all', label: 'الجميع' },
  { key: 'buyer', label: 'مشتري' },
  { key: 'seller', label: 'بائع' },
  { key: 'both', label: 'الاثنين' },
]

const TYPE_COLORS: Record<string, string> = {
  buyer: '#16A34A',
  seller: '#D97706',
  both: '#7C3AED',
}

export default function Clients() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useFocusEffect(useCallback(() => {
    load()
  }, []))

  async function load() {
    setLoading(true)
    try {
      const data = await getAllClients()
      setClients(data)
    } catch (e) {
      console.error('Failed to load clients:', e)
    }
    setLoading(false)
  }

  function handleDelete(c: any) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert('حذف العميل', `هل تريد حذف "${c.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteClient(c.id).then(() => load()) },
    ])
  }

  const filtered = clients.filter((c) => {
    const match = c.name.includes(search) || c.phone.includes(search) || c.email.includes(search)
    const pass = filter === 'all' || c.type === filter
    return match && pass
  })

  function renderItem({ item: c }: { item: any }) {
    const color = TYPE_COLORS[c.type] || '#64748B'
    const initials = (c.name || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] || '').join('').toUpperCase() || '?'
    const typeLabel = c.type === 'buyer' ? 'مشتري' : c.type === 'seller' ? 'بائع' : 'مشتري وبائع'
    const hasBudget = (c.budget_min > 0 || c.budget_max > 0)

    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`فتح ملف العميل ${c.name || ''}`} onPress={() => navigation.navigate('ClientDetail', { id: c.id })} style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.88, transform: [{ scale: 0.995 }] }]}>
        <Card style={[styles.card, { borderColor: colors.border }]}>
          <View style={styles.clientTop}>
            <View style={[styles.avatar, { backgroundColor: color + '18', borderColor: color + '44' }]}><Text style={[styles.avatarText, { color }]}>{initials}</Text></View>
            <View style={styles.clientMain}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.name || 'بدون اسم'}</Text>
              <View style={styles.typeRow}><View style={[styles.typeDot, { backgroundColor: color }]} /><Text style={[styles.typeText, { color: colors.textSecondary }]}>{typeLabel}</Text></View>
              <View style={styles.clientContacts}>
                {c.phone ? <View style={styles.contactRow}><Ionicons name="call-outline" size={14} color={colors.accent} /><Text style={[styles.contactText, { color: colors.textSecondary }]} numberOfLines={1}>{c.phone}</Text><CallButton phone={c.phone} compact iconColor={colors.success} /></View> : null}
                {c.email ? <View style={styles.contactRow}><Ionicons name="mail-outline" size={14} color={colors.accent} /><Text style={[styles.contactText, { color: colors.textSecondary }]} numberOfLines={1}>{c.email}</Text></View> : null}
                {!c.phone && !c.email ? <Text style={[styles.noContact, { color: colors.textMuted }]}>لا توجد بيانات اتصال</Text> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`حذف العميل ${c.name || ''}`} onPress={(event) => { event.stopPropagation(); handleDelete(c) }} style={({ pressed }) => [styles.delBtn, pressed && { opacity: 0.4 }]} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="trash-outline" size={17} color={colors.error} /></Pressable>
          </View>
          <View style={[styles.foot, { borderTopColor: colors.border }]}>
            <View><Text style={[styles.footLabel, { color: colors.textMuted }]}>نطاق الميزانية</Text><Text style={[styles.footValue, { color: hasBudget ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>{hasBudget ? `${formatPrice(c.budget_min || 0)} – ${formatPrice(c.budget_max || 0)}` : 'غير محددة'}</Text></View>
            <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>العملاء</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
            {clients.length} عميل مسجل
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('ClientForm', {})}
          style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>عميل جديد</Text>
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث عن عميل..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterBar}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => { Haptics.selectionAsync(); setFilter(f.key) }}
            style={[
              styles.filterTab,
              filter === f.key
                ? { backgroundColor: colors.accent }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.filterTabText, { color: filter === f.key ? '#FFF' : colors.textSecondary, fontFamily: 'Tajawal_500Medium' }]}>
              {f.label}
            </Text>
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
            <Ionicons name="people-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {search || filter !== 'all' ? 'لا توجد نتائج' : 'لا يوجد عملاء بعد'}
            </Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  pageSubtitle: { fontSize: fontSize.md, marginTop: 2, fontFamily: 'Tajawal_400Regular' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', color: '#FFF' },
  searchBar: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.md, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  filterBar: { height: 48, flexGrow: 0 },
  filterScroll: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  filterTab: {
    height: 34, minWidth: 64, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.lg, borderWidth: 1, borderRadius: radius.full,
  },
  filterTabText: { fontSize: fontSize.md, fontWeight: '500' },
  list: { padding: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  cardWrap: { width: '100%', paddingBottom: spacing.md },
  card: { padding: spacing.md, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md, borderCurve: 'continuous' },
  clientTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, direction: 'rtl' },
  clientMain: { flex: 1, minWidth: 0, gap: spacing.xs },
  clientContacts: { gap: spacing.xs, marginTop: spacing.xs },
  avatar: { width: 62, height: 62, borderRadius: radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  delBtn: { padding: spacing.xs },
  name: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold', textAlign: 'right' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  typeDot: { width: 7, height: 7, borderRadius: 4 },
  typeText: { fontSize: 11, fontWeight: '500', fontFamily: 'Tajawal_500Medium' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  contactText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', flex: 1 },
  noContact: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  footLabel: { fontSize: 10, fontFamily: 'Tajawal_400Regular' },
  footValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Tajawal_700Bold', letterSpacing: 0.2 },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxl * 2, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})
