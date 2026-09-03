import React, { useState, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, RefreshControl, Alert, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { getAllClients, deleteClient, getAllProperties } from '../database/db'
import { SectionFab } from '../components/SectionFab'
import { formatPrice } from '../utils/helpers'
import { CallButton } from '../components/CallButton'
import { identityKey } from '../utils/contactDirectory'

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

interface RoleEntry {
  key: string
  name: string
  phone: string
  properties: { id: string; name: string }[]
}

function groupRole(properties: any[], nameField: string, phoneField: string): RoleEntry[] {
  const map = new Map<string, RoleEntry>()
  for (const p of properties) {
    const name = String(p[nameField] ?? '').trim()
    const phone = String(p[phoneField] ?? '').trim()
    if (!name && !phone) continue
    const key = identityKey(name, phone)
    let e = map.get(key)
    if (!e) {
      e = { key, name, phone, properties: [] }
      map.set(key, e)
    }
    if (name && (!e.name || e.name.length < name.length)) e.name = name
    if (phone && !e.phone) e.phone = phone
    if (!e.properties.some((x) => x.id === p.id)) e.properties.push({ id: String(p.id), name: String(p.name ?? 'عقار') })
  }
  return [...map.values()].sort((a, b) => b.properties.length - a.properties.length)
}

export default function Clients() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [clients, setClients] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [section, setSection] = useState<'clients' | 'owners' | 'brokers'>('clients')
  const [multiOnly, setMultiOnly] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useFocusEffect(useCallback(() => {
    load()
  }, []))

  async function load() {
    setLoading(true)
    try {
      const [cls, props] = await Promise.all([getAllClients(), getAllProperties()])
      setClients(cls)
      setProperties(props)
    } catch (e) {
      console.error('Failed to load clients:', e)
    }
    setLoading(false)
  }

  const owners = useMemo(() => groupRole(properties, 'owner_name', 'owner_phone'), [properties])
  const brokers = useMemo(() => groupRole(properties, 'broker_name', 'broker_phone'), [properties])

  const crossSectionKeys = useMemo(() => {
    const seen = new Map<string, Set<string>>()
    const add = (key: string, sectionName: string) => {
      let s = seen.get(key)
      if (!s) { s = new Set(); seen.set(key, s) }
      s.add(sectionName)
    }
    for (const c of clients) {
      const n = String(c.name ?? '').trim()
      const p = String(c.phone ?? '').trim()
      if (n || p) add(identityKey(n, p), 'clients')
    }
    for (const o of owners) add(o.key, 'owners')
    for (const b of brokers) add(b.key, 'brokers')
    return new Set([...seen.entries()].filter(([, s]) => s.size > 1).map(([k]) => k))
  }, [clients, owners, brokers])

  function matchSearch(name: string, phone: string, extra = ''): boolean {
    if (!search.trim()) return true
    const q = search.trim()
    return name.includes(q) || phone.includes(q) || extra.includes(q)
  }

  const filteredClients = clients.filter((c) => {
    const match = c.name.includes(search) || c.phone.includes(search) || c.email.includes(search)
    const pass = filter === 'all' || c.type === filter
    const passMulti = !multiOnly || crossSectionKeys.has(identityKey(String(c.name ?? ''), String(c.phone ?? '')))
    return match && pass && passMulti
  })

  function roleList(entries: RoleEntry[]) {
    return entries.filter((e) => {
      if (!matchSearch(e.name, e.phone)) return false
      if (multiOnly && !(e.properties.length > 1 || crossSectionKeys.has(e.key))) return false
      return true
    })
  }

  const multiClientsCount = clients.filter((c) => crossSectionKeys.has(identityKey(String(c.name ?? ''), String(c.phone ?? '')))).length

  function handleDelete(c: any) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      if (!globalThis.confirm(`هل تريد حذف "${c.name}"؟`)) return
      deleteClient(c.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر حذف العميل'))
      return
    }
    Alert.alert('حذف العميل', `هل تريد حذف "${c.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteClient(c.id).then(() => load()) },
    ])
  }

  function renderClient({ item: c }: { item: any }) {
    const color = TYPE_COLORS[c.type] || '#64748B'
    const initials = (c.name || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] || '').join('').toUpperCase() || '?'
    const typeLabel = c.type === 'buyer' ? 'مشتري' : c.type === 'seller' ? 'بائع' : 'مشتري وبائع'
    const hasBudget = (c.budget_min > 0 || c.budget_max > 0)
    const multiSection = crossSectionKeys.has(identityKey(String(c.name ?? ''), String(c.phone ?? '')))

    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`فتح ملف العميل ${c.name || ''}`} onPress={() => navigation.navigate('ClientDetail', { id: c.id })} style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.88, transform: [{ scale: 0.995 }] }]}>
        <Card style={[styles.card, { borderColor: colors.border }]}>
          <View style={styles.clientTop}>
            <View style={[styles.avatar, { backgroundColor: color + '18', borderColor: color + '44' }]}><Text style={[styles.avatarText, { color }]}>{initials}</Text></View>
            <View style={styles.clientMain}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.name || 'بدون اسم'}</Text>
              <View style={styles.typeRow}>
                <View style={[styles.typeDot, { backgroundColor: color }]} /><Text style={[styles.typeText, { color: colors.textSecondary }]}>{typeLabel}</Text>
                {multiSection ? (
                  <View style={[styles.multiBadge, { backgroundColor: colors.accentSurface }]}>
                    <Ionicons name="layers-outline" size={11} color={colors.accent} />
                    <Text style={[styles.multiBadgeText, { color: colors.accent }]}>في أكثر من قسم</Text>
                  </View>
                ) : null}
              </View>
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

  function renderRole({ item: e, roleLabel, roleIcon, roleColor }: { item: RoleEntry; roleLabel: string; roleIcon: string; roleColor: string }) {
    const initials = (e.name || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] || '').join('').toUpperCase() || '?'
    const multi = e.properties.length > 1
    const crossSection = crossSectionKeys.has(e.key)
    const expanded = expandedKey === e.key

    function openEntry() {
      if (e.properties.length === 1) {
        navigation.navigate('PropertyDetail', { id: e.properties[0].id })
      } else {
        Haptics.selectionAsync()
        setExpandedKey(expanded ? null : e.key)
      }
    }

    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`فتح ${roleLabel} ${e.name || ''}`} onPress={openEntry} style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.88 }]}>
        <Card style={[styles.card, { borderColor: colors.border }]}>
          <View style={styles.clientTop}>
            <View style={[styles.avatar, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}>
              <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
            </View>
            <View style={styles.clientMain}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{e.name || 'بدون اسم'}</Text>
              <View style={styles.typeRow}>
                <Ionicons name={roleIcon as any} size={12} color={roleColor} />
                <Text style={[styles.typeText, { color: colors.textSecondary }]}>{roleLabel}</Text>
                <View style={[styles.countBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>{e.properties.length} {e.properties.length === 1 ? 'عقار' : 'عقارات'}</Text>
                </View>
                {crossSection ? (
                  <View style={[styles.multiBadge, { backgroundColor: colors.accentSurface }]}>
                    <Ionicons name="layers-outline" size={11} color={colors.accent} />
                    <Text style={[styles.multiBadgeText, { color: colors.accent }]}>في أكثر من قسم</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.clientContacts}>
                {e.phone ? <View style={styles.contactRow}><Ionicons name="call-outline" size={14} color={colors.accent} /><Text style={[styles.contactText, { color: colors.textSecondary }]} numberOfLines={1}>{e.phone}</Text><CallButton phone={e.phone} compact iconColor={colors.success} /></View> : <Text style={[styles.noContact, { color: colors.textMuted }]}>بلا رقم مسجل</Text>}
              </View>
            </View>
            <Ionicons name={multi && !expanded ? 'chevron-down' : 'chevron-back'} size={17} color={colors.textMuted} />
          </View>
          {multi && expanded ? (
            <View style={[styles.subList, { borderTopColor: colors.border }]}>
              <Text style={[styles.subTitle, { color: colors.textMuted }]}>تسجيلات {e.name || 'هذا الشخص'} في كل مكان ({e.properties.length})</Text>
              {e.properties.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => navigation.navigate('PropertyDetail', { id: p.id })}
                  style={({ pressed }) => [styles.subItem, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="home-outline" size={15} color={colors.accent} />
                  <Text style={[styles.subItemText, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
                  <Ionicons name="chevron-back" size={15} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </Card>
      </Pressable>
    )
  }

  const SECTIONS = [
    { key: 'clients', label: `العملاء (${clients.length})` },
    { key: 'owners', label: `الملاك (${owners.length})` },
    { key: 'brokers', label: `الدلالون (${brokers.length})` },
  ] as const

  const ownersList = roleList(owners)
  const brokersList = roleList(brokers)
  const multiCount = section === 'clients' ? multiClientsCount : section === 'owners' ? ownersList.filter((e) => e.properties.length > 1 || crossSectionKeys.has(e.key)).length : brokersList.filter((e) => e.properties.length > 1 || crossSectionKeys.has(e.key)).length

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchBar}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث بالاسم أو الرقم..."
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
        {SECTIONS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => { Haptics.selectionAsync(); setSection(s.key); setMultiOnly(false); setExpandedKey(null) }}
            style={[
              styles.filterTab,
              section === s.key
                ? { backgroundColor: colors.accent }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.filterTabText, { color: section === s.key ? '#FFF' : colors.textSecondary, fontFamily: 'Tajawal_500Medium' }]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setMultiOnly((v) => !v) }}
          style={[
            styles.filterTab,
            multiOnly
              ? { backgroundColor: colors.warning }
              : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
          ]}
        >
          <Ionicons name="layers-outline" size={14} color={multiOnly ? '#FFF' : colors.textSecondary} />
          <Text style={[styles.filterTabText, { color: multiOnly ? '#FFF' : colors.textSecondary, fontFamily: 'Tajawal_500Medium' }]}>
            متعدد التسجيلات ({multiCount})
          </Text>
        </Pressable>
      </ScrollView>

      {section === 'clients' ? (
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
      ) : null}

      {section === 'clients' ? (
        <FlashList
          data={filteredClients}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {search || filter !== 'all' || multiOnly ? 'لا توجد نتائج' : 'لا يوجد عملاء بعد'}
              </Text>
            </View>
          }
        />
      ) : section === 'owners' ? (
        <FlashList
          data={ownersList}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => renderRole({ item, roleLabel: 'مالك عقار', roleIcon: 'home-outline', roleColor: '#0EA5E9' })}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="home-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا يوجد ملاك مسجلون في العقارات بعد</Text>
            </View>
          }
        />
      ) : (
        <FlashList
          data={brokersList}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => renderRole({ item, roleLabel: 'دلال', roleIcon: 'briefcase-outline', roleColor: '#7C3AED' })}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="briefcase-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا يوجد دلالون مسجلون في العقارات بعد</Text>
            </View>
          }
        />
      )}
      {section === 'clients' ? <SectionFab onPress={() => navigation.navigate('ClientForm', {})} label="إضافة عميل" /> : null}
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
    height: 34, minWidth: 64, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4,
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
  multiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  multiBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  countBadge: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { fontSize: 10, fontFamily: 'Tajawal_500Medium' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  contactText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', flex: 1 },
  noContact: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  footLabel: { fontSize: 10, fontFamily: 'Tajawal_400Regular' },
  footValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Tajawal_700Bold', letterSpacing: 0.2 },
  subList: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xs },
  subTitle: { fontSize: 11, fontFamily: 'Tajawal_500Medium', marginBottom: 2 },
  subItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  subItemText: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Tajawal_500Medium', textAlign: 'right' },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxl * 2, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})
