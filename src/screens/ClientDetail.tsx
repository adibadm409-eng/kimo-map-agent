import React, { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { getClient, deleteClient, getAllOffers } from '../database/db'
import { formatPrice, formatDate } from '../utils/helpers'
import { STATUS_LABELS } from '../types'
import { useReloadOnData } from '../database/dataSync'
import { CallButton } from '../components/CallButton'

export default function ClientDetail() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const [client, setClient] = useState<any>(null)
  const [offers, setOffers] = useState<any[]>([])

  async function load() {
    const id = route.params?.id
    if (!id) return
    try {
      const [c, allOffers] = await Promise.all([getClient(id), getAllOffers()])
      setClient(c)
      setOffers(allOffers.filter((o: any) => o.client_id === id))
    } catch (e) {
      console.error('Failed to load client:', e)
    }
  }

  useReloadOnData(load, [route.params?.id])

  function handleDelete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert('حذف العميل', 'هل تريد حذف هذا العميل؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteClient(client.id).then(() => navigation.goBack()).catch(() => Alert.alert('خطأ', 'تعذر حذف العميل')) },
    ])
  }

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontFamily: 'Tajawal_400Regular' }}>جاري التحميل...</Text>
      </View>
    )
  }

  const initials = client.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSurface }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
        </View>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{client.name}</Text>
        <View style={[styles.typeBadge, { backgroundColor: colors.accent + '15' }]}>
          <Text style={[styles.typeText, { color: colors.accent }]}>
            {client.type === 'buyer' ? 'مشتري' : client.type === 'seller' ? 'بائع' : 'الاثنين'}
          </Text>
        </View>
      </View>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>معلومات التواصل</Text>
        {client.phone ? (
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.successSurface }]}>
              <Ionicons name="call-outline" size={16} color={colors.success} />
            </View>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>الجوال</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>{client.phone}</Text>
            <CallButton phone={client.phone} compact iconColor={colors.success} />
          </View>
        ) : null}
        {client.email ? (
          <Pressable
            style={styles.infoRow}
            onPress={() => Linking.openURL(`mailto:${client.email}`)}
          >
            <View style={[styles.infoIcon, { backgroundColor: colors.infoSurface }]}>
              <Ionicons name="mail-outline" size={16} color={colors.info} />
            </View>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>البريد</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>{client.email}</Text>
          </Pressable>
        ) : null}
        <View style={styles.infoRow}>
          <View style={[styles.infoIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          </View>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>العضوية منذ</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatDate(client.created_at)}</Text>
        </View>
      </Card>

      {client.budget_max > 0 ? (
        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الميزانية</Text>
          <View style={styles.budgetBox}>
            <View style={styles.budgetItem}>
              <Text style={[styles.budgetLabel, { color: colors.textMuted }]}>الحد الأدنى</Text>
              <Text style={[styles.budgetValue, { color: colors.textPrimary }]}>
                {formatPrice(client.budget_min)} ريال يمني
              </Text>
            </View>
            <View style={[styles.budgetDivider, { backgroundColor: colors.border }]} />
            <View style={styles.budgetItem}>
              <Text style={[styles.budgetLabel, { color: colors.textMuted }]}>الحد الأقصى</Text>
              <Text style={[styles.budgetValue, { color: colors.accent }]}>
                {formatPrice(client.budget_max)} ريال يمني
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {client.notes ? (
        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>ملاحظات</Text>
          <Text style={[styles.notesText, { color: colors.textSecondary }]}>{client.notes}</Text>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <View style={styles.offersHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>العروض</Text>
          <Text style={[styles.offersCount, { color: colors.textMuted }]}>{offers.length} عرض</Text>
        </View>
        {offers.length === 0 ? (
          <View style={styles.offersEmpty}>
            <Ionicons name="pricetags-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد عروض</Text>
          </View>
        ) : (
          offers.map((o) => (
            <View key={o.id} style={[styles.offerRow, { borderBottomColor: colors.border }]}>
              <View style={styles.offerInfo}>
                <Text style={[styles.offerProperty, { color: colors.textPrimary }]} numberOfLines={1}>
                  {o.property_name}
                </Text>
                <Text style={[styles.offerAmount, { color: colors.accent }]}>
                  {formatPrice(o.amount)} ريال يمني
                </Text>
              </View>
              <StatusBadge label={STATUS_LABELS[o.status] || o.status} value={o.status} />
            </View>
          ))
        )}
      </Card>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => navigation.navigate('ClientForm', { id: client.id })}
          style={({ pressed }) => [styles.actionBtn, { backgroundColor: 'transparent', borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
          <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>تعديل</Text>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.error + '15', borderColor: colors.error + '30', opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={[styles.actionBtnText, { color: colors.error }]}>حذف</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md },
  backBtn: { marginBottom: spacing.md, alignSelf: 'flex-start', padding: spacing.sm },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: fontSize.xxxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  name: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  typeBadge: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.full },
  typeText: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  section: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', width: 70 },
  infoValue: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  budgetBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  budgetLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  budgetValue: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  budgetDivider: { width: 1, height: 40 },
  notesText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', lineHeight: 24 },
  offersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offersCount: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  offersEmpty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  offerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  offerInfo: { flex: 1, gap: 2 },
  offerProperty: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  offerAmount: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 50, borderRadius: radius.full, borderWidth: 1 },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
})
