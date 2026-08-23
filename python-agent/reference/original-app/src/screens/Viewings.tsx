import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, RefreshControl, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { SectionFab } from '../components/SectionFab'
import { getAllViewings, deleteViewing } from '../database/db'
import { formatDateTime } from '../utils/helpers'

const FILTERS = [
  { key: 'all', label: 'الجميع' },
  { key: 'scheduled', label: 'مجدول' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'cancelled', label: 'ملغي' },
]

export default function Viewings() {
  const { colors } = useTheme()
  const navigation = useNavigation<any>()
  const [viewings, setViewings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    setLoading(true)
    try {
      const data = await getAllViewings()
      setViewings(data)
    } catch (e) {
      console.error('Failed to load viewings:', e)
    }
    setLoading(false)
  }

  function handleDelete(v: any) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert('حذف المشاهدة', 'هل تريد حذف هذه المشاهدة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteViewing(v.id).then(() => load()).catch(() => Alert.alert('خطأ', 'تعذر حذف المشاهدة')) },
    ])
  }

  const filtered = viewings.filter((v) => {
    const match = v.property_name.includes(search) || v.client_name.includes(search)
    const pass = filter === 'all' || v.status === filter
    return match && pass
  })

  function renderItem({ item: v }: { item: any }) {
    return (
      <Pressable
        onPress={() => navigation.navigate('ViewingForm', { id: v.id })}
        style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.8 }]}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.dateIcon, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name="calendar-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.propertyName, { color: colors.textPrimary }]} numberOfLines={1}>{v.property_name}</Text>
              <Text style={[styles.clientName, { color: colors.textSecondary }]} numberOfLines={1}>{v.client_name}</Text>
            </View>
            <StatusBadge label={v.status === 'scheduled' ? 'مجدول' : v.status === 'completed' ? 'مكتمل' : 'ملغي'} value={v.status} />
          </View>
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.dateTime, { color: colors.textSecondary }]}>{formatDateTime(v.date_time)}</Text>
            {v.notes ? <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={1}>{v.notes}</Text> : null}
            <Pressable
              onPress={() => handleDelete(v)}
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
            <Ionicons name="calendar-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{search || filter !== 'all' ? 'لا توجد نتائج' : 'لا توجد مشاهدات بعد'}</Text>
          </View>
        }
      />
      <SectionFab onPress={() => navigation.navigate('ViewingForm', {})} label="مشاهدة جديدة" />
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
  dateIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 2 },
  propertyName: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  clientName: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  dateTime: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  notes: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxl * 2, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})
