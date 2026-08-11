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
import { getAllCampaigns, deleteCampaign } from '../database/db'
import { formatPrice, formatDate } from '../utils/helpers'

const FILTERS = [
  { key: 'all', label: 'الجميع' },
  { key: 'active', label: 'نشط' },
  { key: 'draft', label: 'مسودة' },
  { key: 'completed', label: 'منتهي' },
]

const TYPE_ICONS: Record<string, string> = {
  social_media: 'logo-instagram',
  email: 'mail-outline',
  sms: 'chatbubble-outline',
  brochure: 'document-text-outline',
}

export default function Campaigns() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    setLoading(true)
    try {
      const data = await getAllCampaigns()
      setCampaigns(data)
    } catch (e) {
      console.error('Failed to load campaigns:', e)
    }
    setLoading(false)
  }

  function handleDelete(c: any) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert('حذف الحملة', `هل تريد حذف "${c.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteCampaign(c.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر حذف الحملة')) },
    ])
  }

  const filtered = campaigns.filter((c) => {
    const match = c.name.includes(search)
    const pass = filter === 'all' || c.status === filter
    return match && pass
  })

  function renderItem({ item: c }: { item: any }) {
    const icon = TYPE_ICONS[c.type] || 'megaphone-outline'
    return (
      <Pressable
        onPress={() => navigation.navigate('CampaignForm', { id: c.id })}
        style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.8 }]}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeIcon, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name={icon as any} size={20} color={colors.accent} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
              {c.description ? <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>{c.description}</Text> : null}
            </View>
            <StatusBadge label={c.status === 'active' ? 'نشط' : c.status === 'draft' ? 'مسودة' : 'منتهي'} value={c.status} />
          </View>
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <View style={styles.metaItem}>
              <Ionicons name="wallet-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{formatPrice(c.budget)} ريال يمني</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{formatDate(c.start_date)}</Text>
            </View>
            <Pressable
              onPress={() => handleDelete(c)}
              style={({ pressed }) => [{ padding: spacing.xs }, pressed && { opacity: 0.5 }]}
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
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>الحملات</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>{campaigns.length} حملة</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('CampaignForm', {})}
          style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>حملة جديدة</Text>
        </Pressable>
      </View>

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
            <Ionicons name="megaphone-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{search || filter !== 'all' ? 'لا توجد نتائج' : 'لا توجد حملات بعد'}</Text>
          </View>
        }
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
  name: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  description: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxl * 2, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})
