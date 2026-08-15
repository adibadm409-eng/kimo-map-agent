import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, RefreshControl, ScrollView, useWindowDimensions, Alert, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { getAllProperties, deleteProperty } from '../database/db'
import { formatPrice } from '../utils/helpers'
import { STATUS_LABELS, TYPE_LABELS } from '../types'

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
  const { width } = useWindowDimensions()
  const navigation = useNavigation<any>()
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')

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

  const cardWidth = (width - spacing.xl * 2 - spacing.md) / 2

  function renderItem({ item: p }: { item: any }) {
    const iconName = TYPE_ICONS[p.type] || 'business-outline'
    return (
      <Pressable
        onPress={() => navigation.navigate('PropertyDetail', { id: p.id })}
        style={({ pressed }) => [styles.propCard, { width: cardWidth, opacity: pressed ? 0.8 : 1 }]}
      >
        <Card>
                    <View style={[styles.propImage, { backgroundColor: colors.accentSurface }]}>
            {p.icon_uri ? <Image source={{ uri: p.icon_uri }} style={styles.propertyIconImage} /> : <View style={[styles.propTypeIcon, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name={iconName as any} size={36} color={colors.accent} />
            </View>}

            <View style={styles.propBadges}>
              <StatusBadge label={STATUS_LABELS[p.status] || p.status} value={p.status} />
            </View>
          </View>

          <View style={styles.propBody}>
            <Text style={[styles.propName, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
            <Text style={[styles.typeText, { color: colors.accent }]} numberOfLines={1}>{TYPE_LABELS[p.type] || p.type}</Text>
            <View style={styles.propMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="resize-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{p.area} م²</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{p.owner_name || '—'}</Text>
              </View>
            </View>
            {p.address ? (
              <View style={[styles.propAddr, { backgroundColor: colors.surface }]}>
                <Ionicons name="location-outline" size={11} color={colors.accent} />
                <Text style={[styles.propAddrText, { color: colors.textSecondary }]} numberOfLines={1}>{p.address}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.propFooter, { borderTopColor: colors.border }]}>
            <Text style={[styles.propPrice, { color: colors.accent }]}>
              {formatPrice(p.price)} <Text style={[styles.propPriceUnit, { color: colors.textMuted }]}>ريال يمني</Text>
            </Text>
            <Pressable
              onPress={() => handleDelete(p)}
              style={({ pressed }) => [{ padding: spacing.sm }, pressed && { opacity: 0.5 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
            </Pressable>
          </View>
        </Card>
      </Pressable>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>العقارات</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
            {properties.length} عقار مسجل
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('PropertyForm', {})}
          style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>عقار جديد</Text>
        </Pressable>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.bg }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterBar}
      >
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={styles.filterBar}>
        {TYPE_FILTERS.map((f) => (
          <Pressable key={f.key} accessibilityRole="button" accessibilityState={{ selected: typeFilter === f.key }} onPress={() => setTypeFilter(f.key)} style={[styles.filterTab, { borderColor: colors.border }, typeFilter === f.key ? { backgroundColor: colors.accent, borderColor: colors.accent } : {}]}>
            <Text style={[styles.filterTabText, { color: typeFilter === f.key ? '#FFF' : colors.textSecondary }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.priceFilterRow}>
        <Text style={[styles.priceFilterLabel, { color: colors.textSecondary }]}>السعر</Text>
        <TextInput accessibilityLabel="الحد الأدنى للسعر" value={priceMin} onChangeText={setPriceMin} keyboardType="numeric" placeholder="من" placeholderTextColor={colors.textMuted} style={[styles.priceInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]} />
        <TextInput accessibilityLabel="الحد الأعلى للسعر" value={priceMax} onChangeText={setPriceMax} keyboardType="numeric" placeholder="إلى" placeholderTextColor={colors.textMuted} style={[styles.priceInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pricePresetScroll}>
          {PRICE_PRESETS.map((preset) => <Pressable key={preset.key || 'any'} onPress={() => setPriceMax(preset.key)} style={[styles.pricePreset, { borderColor: colors.border }, priceMax === preset.key ? { backgroundColor: colors.accent, borderColor: colors.accent } : {}]}><Text style={[styles.pricePresetText, { color: priceMax === preset.key ? '#FFF' : colors.textSecondary }]}>{preset.label}</Text></Pressable>)}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.propGrid}
        columnWrapperStyle={styles.propGridRow}
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
    padding: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  propGridRow: {
    gap: spacing.md,
  },
  propCard: {
    maxWidth: '50%',
  },
  propImage: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  priceFilterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  priceFilterLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  priceInput: { width: 78, height: 34, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  pricePresetScroll: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  pricePreset: { paddingHorizontal: spacing.sm, paddingVertical: 7, borderWidth: 1, borderRadius: radius.full },
  pricePresetText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  propBody: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  propName: {
    fontSize: fontSize.md,
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
  propFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
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
