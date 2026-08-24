import React, { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card } from '../components/ui'
import { getStats, getPropertyTypeDistribution, getPropertyStatusDistribution, getOfferStatusDistribution, getAllCampaigns } from '../database/db'
import { formatPrice } from '../utils/helpers'
import { TYPE_LABELS, STATUS_LABELS } from '../types'
import { useReloadOnData } from '../database/dataSync'

export default function Reports() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const navigation = useNavigation<any>()
  const [stats, setStats] = useState({ properties: 0, clients: 0, offers: 0, totalValue: 0 })
  const [typeDist, setTypeDist] = useState<any[]>([])
  const [statusDist, setStatusDist] = useState<any[]>([])
  const [offerDist, setOfferDist] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])

  useReloadOnData(load)

  async function load() {
    try {
      const [s, td, sd, od, cams] = await Promise.all([
        getStats(),
        getPropertyTypeDistribution(),
        getPropertyStatusDistribution(),
        getOfferStatusDistribution(),
        getAllCampaigns(),
      ])
      setStats(s)
      setTypeDist(td)
      setStatusDist(sd)
      setOfferDist(od)
      setCampaigns(cams.filter((c: any) => c.status === 'active'))
    } catch (e) {
      console.error('Failed to load reports:', e)
    }
  }

  const statCards = [
    { label: 'العقارات', value: stats.properties.toString(), icon: 'business-outline' as const, color: '#3B82F6', bg: '#EFF6FF' },
    { label: 'العملاء', value: stats.clients.toString(), icon: 'people-outline' as const, color: '#16A34A', bg: '#F0FDF4' },
    { label: 'العروض', value: stats.offers.toString(), icon: 'pricetags-outline' as const, color: '#D97706', bg: '#FFFBEB' },
    { label: 'قيمة العروض', value: formatPrice(stats.totalValue), icon: 'trending-up-outline' as const, color: '#7C3AED', bg: '#F5F3FF' },
  ]

  const cardWidth = (width - spacing.xl * 2 - spacing.md) / 2
  const maxCount = Math.max(...typeDist.map((d: any) => d.count), 1)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>التقارير</Text>
      </View>

      <View style={styles.statsGrid}>
        {statCards.map((s, i) => (
          <Card key={i} style={{ ...styles.statCard, width: cardWidth } as any}>
            <View style={styles.statHeader}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon} size={20} color={s.color} />
              </View>
            </View>
            <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>{s.value}</Text>
          </Card>
        ))}
      </View>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>توزيع العقارات حسب النوع</Text>
        {typeDist.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد بيانات</Text>
        ) : (
          typeDist.map((d: any, i: number) => (
            <View key={i} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{TYPE_LABELS[d.type] || d.type}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { backgroundColor: colors.accent, width: `${(d.count / maxCount) * 100}%` }]} />
              </View>
              <Text style={[styles.barValue, { color: colors.textPrimary }]}>{d.count}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>توزيع العقارات حسب الحالة</Text>
        {statusDist.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد بيانات</Text>
        ) : (
          statusDist.map((d: any, i: number) => (
            <View key={i} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{STATUS_LABELS[d.status] || d.status}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { backgroundColor: colors.success, width: `${(d.count / maxCount) * 100}%` }]} />
              </View>
              <Text style={[styles.barValue, { color: colors.textPrimary }]}>{d.count}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>قيمة العروض الإجمالية</Text>
        <Text style={[styles.valueLabel, { color: colors.textMuted }]}>القيمة الإجمالية لجميع العروض</Text>
        <Text style={[styles.valueAmount, { color: colors.accent }]}>
          {formatPrice(stats.totalValue)} <Text style={[styles.valueUnit, { color: colors.textMuted }]}>ريال يمني</Text>
        </Text>
      </Card>

      {campaigns.length > 0 ? (
        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الحملات النشطة ({campaigns.length})</Text>
          {campaigns.map((c: any, i: number) => (
            <View key={i} style={[styles.campaignRow, { borderBottomColor: colors.border }, i === campaigns.length - 1 ? { borderBottomWidth: 0 } : null]}>
              <Text style={[styles.campaignName, { color: colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
              <Text style={[styles.campaignBudget, { color: colors.accent }]}>{formatPrice(c.budget)} ريال يمني</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={{ paddingBottom: spacing.xl }}>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          style={({ pressed }) => [styles.settingsBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.settingsBtnText, { color: colors.textPrimary }]}>الإعدادات</Text>
          <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg },
  header: { marginBottom: spacing.xs },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold', marginBottom: spacing.xs },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { padding: spacing.lg, gap: spacing.xs },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  statIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: fontSize.xxl, fontWeight: '800', fontFamily: 'Tajawal_800ExtraBold' },
  section: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'center', paddingVertical: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  barLabel: { width: 80, fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { width: 30, fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', textAlign: 'left' },
  valueLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  valueAmount: { fontSize: fontSize.xl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  valueUnit: { fontSize: fontSize.sm, fontWeight: '500', fontFamily: 'Tajawal_500Medium' },
  campaignRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  campaignName: { flex: 1, fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  campaignBudget: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  settingsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderRadius: radius.md },
  settingsBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
})