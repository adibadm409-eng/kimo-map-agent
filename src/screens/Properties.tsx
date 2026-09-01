import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, RefreshControl, ScrollView, Alert, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { getAllProperties, deleteProperty } from '../database/db'
import { formatPrice } from '../utils/helpers'
import { STATUS_LABELS, TYPE_LABELS } from '../types'
import { CallButton } from '../components/CallButton'
import { SectionFab } from '../components/SectionFab'
import { ShareSheet, parseMediaList, type PinItem } from './MapScreenV2/cards/shareMedia'

const STATUS_FILTERS = [
  { key: 'all', label: 'الجميع' },
  { key: 'for_sale', label: 'للبيع' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'sold', label: 'مباع' },
  { key: 'rented', label: 'مؤجر' },
]

const TYPE_ICONS: Record<string, string> = {
  villa: 'home-outline', apartment: 'business-outline', house: 'home-outline', hotel: 'bed-outline', building: 'business-outline',
  residential_tower: 'podium-outline', farm: 'leaf-outline', land: 'map-outline', warehouse: 'cube-outline', shop: 'storefront-outline',
  office: 'briefcase-outline', commercial: 'storefront-outline',
}

const TYPE_FILTERS = [{ key: 'all', label: 'كل الأنواع' }, ...Object.entries(TYPE_LABELS).map(([key, label]) => ({ key, label }))]
const PRICE_PRESETS = [
  { key: '', label: 'أي سعر' },
  { key: '500000', label: 'حتى 500 ألف' },
  { key: '1000000', label: 'حتى مليون' },
  { key: '5000000', label: 'حتى 5 مليون' },
  { key: '10000000', label: 'حتى 10 مليون' },
]

export default function Properties() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ item: PinItem; media: any[] } | null>(null)

  useFocusEffect(useCallback(() => {
    load()
  }, []))

  async function load() {
    setLoading(true)
    try {
      const data = await getAllProperties()
      setProperties(data)
    } catch (e) {
      console.error('Failed to load properties:', e)
    }
    setLoading(false)
  }

  function handleDelete(p: any) {
    Alert.alert('حذف العقار', `هل تريد حذف "${p.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteProperty(p.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر حذف العقار')) },
    ])
  }

  const filtered = properties.filter((p) => {
    const match = p.name.includes(search) || p.address.includes(search) || p.owner_name.includes(search)
    const passStatus = filter === 'all' || p.status === filter
    const passType = typeFilter === 'all' || p.type === typeFilter
    const min = Number(priceMin) || 0
    const max = Number(priceMax) || 0
    const passPrice = (!min || Number(p.price) >= min) && (!max || Number(p.price) <= max)
    return match && passStatus && passType && passPrice
  })

  const activeFilterCount =
    (filter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (priceMin || priceMax ? 1 : 0)

  function mediaCount(property: any): number {
    try {
      const parsed = typeof property.media === 'string' ? JSON.parse(property.media || '[]') : property.media
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }

  function renderItem({ item: p }: { item: any }) {
    const iconName = TYPE_ICONS[p.type] || 'business-outline'
    const count = mediaCount(p)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`فتح تفاصيل العقار ${p.name || ''}`}
        onPress={() => navigation.navigate('PropertyDetail', { id: p.id })}
        style={({ pressed }) => [styles.propertyCardWrap, pressed && { opacity: 0.88, transform: [{ scale: 0.995 }] }]}
      >
        <Card style={[styles.propertyCard, { borderColor: colors.border }]}>
          <View style={styles.propertyCardTop}>
            <View style={[styles.propertyThumb, { backgroundColor: colors.accentSurface }]}>
              {p.icon_uri ? <Image source={{ uri: p.icon_uri }} style={styles.propertyIconImage} /> : <View style={[styles.propTypeIcon, { backgroundColor: colors.accent + '20' }]}><Ionicons name={iconName as any} size={38} color={colors.accent} /></View>}
              {count > 0 ? <View style={styles.mediaCountBadge}><Ionicons name="images-outline" size={12} color="#FFF" /><Text style={styles.mediaCountText}>{count}</Text></View> : null}
            </View>
            <View style={styles.propertyMain}>
              <View style={styles.propertyTitleRow}>
                <Text style={[styles.propName, { color: colors.textPrimary }]} numberOfLines={1}>{p.name || 'عقار بدون اسم'}</Text>
                <StatusBadge label={STATUS_LABELS[p.status] || p.status} value={p.status} />
              </View>
              <Text style={[styles.typeText, { color: colors.accent }]} numberOfLines={1}>{TYPE_LABELS[p.type] || p.type}</Text>
              <Text style={[styles.propertyPrice, { color: colors.textPrimary }]} numberOfLines={1}>{formatPrice(p.price)} <Text style={[styles.propPriceUnit, { color: colors.textMuted }]}>ريال يمني</Text></Text>
              <View style={styles.propMeta}>
                <View style={styles.metaItem}><Ionicons name="resize-outline" size={14} color={colors.textMuted} /><Text style={[styles.metaText, { color: colors.textSecondary }]}>{p.area || 0} م²</Text></View>
                {p.broker_name ? <View style={styles.metaItem}><Ionicons name="person-outline" size={14} color={colors.textMuted} /><Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{p.broker_name}</Text></View> : null}
                {p.broker_phone ? <View style={styles.metaItem}><Ionicons name="call-outline" size={14} color={colors.success} /><Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{p.broker_phone}</Text><CallButton phone={p.broker_phone} compact iconColor={colors.success} /></View> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`حذف العقار ${p.name || ''}`} onPress={(event) => { event.stopPropagation(); handleDelete(p) }} style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.45 }]} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="trash-outline" size={17} color={colors.error} /></Pressable>
          </View>
          {p.address ? <View style={[styles.propAddr, { backgroundColor: colors.surface }]}><Ionicons name="location-outline" size={14} color={colors.accent} /><Text style={[styles.propAddrText, { color: colors.textSecondary }]} numberOfLines={1}>{p.address}</Text></View> : null}
          <View style={[styles.propertyFooter, { borderTopColor: colors.border }]}>
            <Text style={[styles.footerHint, { color: colors.textMuted }]}>{count ? `${count} وسائط في المعرض` : 'لا توجد وسائط'}</Text>
            <View style={styles.footerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`مشاركة ${p.name || ''}`}
                onPress={(event) => {
                  event.stopPropagation()
                  const media = parseMediaList(p)
                  const pinItem: PinItem = { kind: 'property', id: p.id, name: p.name || 'عقار', data: p }
                  setShareTarget({ item: pinItem, media })
                }}
                style={({ pressed }) => [styles.whatsappBtn, pressed && { opacity: 0.7 }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-social-outline" size={18} color="#25D366" />
              </Pressable>
              <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
            </View>
          </View>
        </Card>
      </Pressable>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchRow}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث عن عقار..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="عرض الفلاتر"
          onPress={() => setFiltersOpen((o) => !o)}
          style={({ pressed }) => [styles.filterCardBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="options-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.filterCardText, { color: colors.textPrimary }]}>فلتر</Text>
          {activeFilterCount > 0 ? (
            <View style={[styles.filterBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {filtersOpen ? (
        <View style={[styles.filterSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionLabel, { color: colors.textSecondary }]}>الحالة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {STATUS_FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[
                    styles.filterTab,
                    { borderColor: colors.border },
                    filter === f.key ? { backgroundColor: colors.accent, borderColor: colors.accent } : {},
                  ]}
                >
                  <Text style={[
                    styles.filterTabText,
                    { color: filter === f.key ? '#FFF' : colors.textSecondary, fontFamily: 'Tajawal_500Medium' },
                  ]}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionLabel, { color: colors.textSecondary }]}>النوع</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {TYPE_FILTERS.map((f) => (
                <Pressable key={f.key} accessibilityRole="button" accessibilityState={{ selected: typeFilter === f.key }} onPress={() => setTypeFilter(f.key)} style={[styles.filterTab, { borderColor: colors.border }, typeFilter === f.key ? { backgroundColor: colors.accent, borderColor: colors.accent } : {}]}>
                  <Text style={[styles.filterTabText, { color: typeFilter === f.key ? '#FFF' : colors.textSecondary }]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionLabel, { color: colors.textSecondary }]}>السعر</Text>
            <View style={styles.priceInputsRow}>
              <TextInput accessibilityLabel="الحد الأدنى للسعر" value={priceMin} onChangeText={setPriceMin} keyboardType="numeric" placeholder="من" placeholderTextColor={colors.textMuted} style={[styles.priceInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.textPrimary }]} />
              <TextInput accessibilityLabel="الحد الأعلى للسعر" value={priceMax} onChangeText={setPriceMax} keyboardType="numeric" placeholder="إلى" placeholderTextColor={colors.textMuted} style={[styles.priceInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.textPrimary }]} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pricePresetScroll}>
              {PRICE_PRESETS.map((preset) => <Pressable key={preset.key || 'any'} onPress={() => setPriceMax(preset.key)} style={[styles.pricePreset, { borderColor: colors.border }, priceMax === preset.key ? { backgroundColor: colors.accent, borderColor: colors.accent } : {}]}><Text style={[styles.pricePresetText, { color: priceMax === preset.key ? '#FFF' : colors.textSecondary }]}>{preset.label}</Text></Pressable>)}
            </ScrollView>
          </View>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.propGrid, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="business-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {search || filter !== 'all' || typeFilter !== 'all' || priceMin || priceMax ? 'لا توجد نتائج بهذه الفلاتر' : 'لا توجد عقارات بعد'}
            </Text>
          </View>
        }
      />
      <SectionFab onPress={() => navigation.navigate('PropertyForm', {})} label="إضافة عقار" />
      {shareTarget ? <ShareSheet item={shareTarget.item} media={shareTarget.media} onClose={() => setShareTarget(null)} /> : null}
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
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  pageSubtitle: {
    fontSize: fontSize.md,
    marginTop: 2,
    fontFamily: 'Tajawal_400Regular',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  addBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
    color: '#FFF',
  },
  searchBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
    textAlign: 'right',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  filterCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterCardText: {
    fontSize: fontSize.sm,
    fontFamily: 'Tajawal_700Bold',
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: 'Tajawal_700Bold',
    color: '#FFF',
  },
  filterSheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  filterBar: {
    height: 50,
    flexGrow: 0,
  },
  filterScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    alignItems: "center",
  },
  filterTab: {
    paddingHorizontal: spacing.lg,
    height: 36,
    minWidth: 64,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  filterTabText: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  propGrid: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  propertyCardWrap: { width: '100%' },
  propertyCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: spacing.md, gap: spacing.md },
  propertyCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, direction: 'rtl' },
  propertyThumb: { width: 104, height: 104, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  propertyMain: { flex: 1, minWidth: 0, gap: spacing.xs },
  propertyTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  deleteBtn: { padding: spacing.xs },
  propImage: { height: 100, alignItems: 'center', justifyContent: 'center' },
  propTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propBadges: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  propertyIconImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  typeText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium', marginTop: 2 },
  filterSection: { gap: spacing.xs, paddingHorizontal: spacing.xl },
  filterSectionLabel: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold', marginTop: spacing.sm },
  priceInputsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: { flex: 1, height: 38, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  pricePresetScroll: { flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.xs },
  pricePreset: { paddingHorizontal: spacing.sm, paddingVertical: 7, borderWidth: 1, borderRadius: radius.full },
  pricePresetText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  propBody: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  propName: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  propMeta: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.sm,
    fontFamily: 'Tajawal_400Regular',
  },
  propAddr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  propAddrText: {
    fontSize: fontSize.xs,
    fontFamily: 'Tajawal_400Regular',
  },
  propertyPrice: { fontSize: fontSize.xl, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' },
  propertyFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  mediaCountBadge: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.full, backgroundColor: 'rgba(15,23,42,0.78)' },
  mediaCountText: { color: '#FFF', fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  footerHint: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  whatsappBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D36618' },
  propFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth,
  },
  propPrice: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    fontFamily: 'Tajawal_800ExtraBold',
  },
  propPriceUnit: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    fontFamily: 'Tajawal_500Medium',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
})
