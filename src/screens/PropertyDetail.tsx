import React, { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, Alert, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card, StatusBadge } from '../components/ui'
import { getProperty, deleteProperty, getAllOffers } from '../database/db'
import { formatPrice, formatDate } from '../utils/helpers'
import { STATUS_LABELS, TYPE_LABELS } from '../types'
import { useReloadOnData } from '../database/dataSync'
import { parseMediaList, MediaStrip, MediaPreview, type PinItem } from './MapScreenV2/cards/shareMedia'

const TYPE_ICONS: Record<string, string> = {
  villa: 'home-outline', apartment: 'business-outline', house: 'home-outline', hotel: 'bed-outline', building: 'business-outline',
  residential_tower: 'podium-outline', farm: 'leaf-outline', land: 'map-outline', warehouse: 'cube-outline', shop: 'storefront-outline',
  office: 'briefcase-outline', commercial: 'storefront-outline',
}

export default function PropertyDetail() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const [property, setProperty] = useState<any>(null)
  const [offers, setOffers] = useState<any[]>([])
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)

  async function load() {
    const id = route.params?.id
    if (!id) return
    try {
      const [p, allOffers] = await Promise.all([getProperty(id), getAllOffers()])
      setProperty(p)
      setOffers(allOffers.filter((o: any) => o.property_id === id))
    } catch (e) {
      console.error('Failed to load property:', e)
    }
  }

  useReloadOnData(load, [route.params?.id])

  function handleDelete() {
    Alert.alert('حذف العقار', 'هل تريد حذف هذا العقار؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteProperty(property.id).then(() => navigation.goBack()).catch(() => Alert.alert('خطأ', 'تعذر حذف العقار')) },
    ])
  }

  if (!property) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontFamily: 'Tajawal_400Regular' }}>جاري التحميل...</Text>
      </View>
    )
  }

  const iconName = TYPE_ICONS[property.type] || 'business-outline'
  const media = parseMediaList(property)
  const mediaItem: PinItem = { kind: 'property', id: property.id, name: property.name, data: property }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
      </Pressable>

      <View style={[styles.propHero, { backgroundColor: colors.accentSurface }]}>
        {property.icon_uri ? <Image source={{ uri: property.icon_uri }} style={styles.heroImage} /> : <View style={[styles.propTypeIcon, { backgroundColor: colors.accent + '15' }]}>
          <Ionicons name={iconName as any} size={64} color={colors.accent} />
        </View>}

        <View style={styles.propHeroBadge}>
          <StatusBadge label={STATUS_LABELS[property.status] || property.status} value={property.status} />
        </View>
      </View>

      {media.length > 0 ? <Card style={styles.section}>
        <View style={styles.mediaHeader}>
          <View><Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>معرض العقار</Text><Text style={[styles.mediaHint, { color: colors.textMuted }]}>{media.length} وسائط · اضغط للتوسيع</Text></View>
          <Ionicons name="images-outline" size={20} color={colors.accent} />
        </View>
        <MediaStrip item={mediaItem} media={media} onMedia={setPreviewIdx} />
      </Card> : null}

      <Card style={styles.section}>
        <Text style={[styles.propName, { color: colors.textPrimary }]}>{property.name}</Text>
        {property.address ? (
          <View style={styles.addrWrap}>
            <Ionicons name="location-outline" size={14} color={colors.accent} />
            <Text style={[styles.propAddr, { color: colors.textSecondary }]}>{property.address}</Text>
          </View>
        ) : null}
        <Text style={[styles.propDesc, { color: colors.textSecondary }]}>
          {property.description || 'لا يوجد وصف'}
        </Text>
      </Card>

      {(property.latitude > 0 || property.longitude > 0) && (
        <Card style={styles.section}>
          <Pressable
             onPress={() => navigation.navigate('MapScreen', { focusPropertyId: property.id })}
            style={[styles.mapBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accent }]}
          >
            <Ionicons name="map-outline" size={20} color={colors.accent} />
            <Text style={[styles.mapBtnText, { color: colors.accent }]}>عرض على الخريطة</Text>
          </Pressable>
        </Card>
      )}

      <Card style={styles.section}>
        <View style={styles.priceRow}>
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>السعر</Text>
          <Text style={[styles.priceValue, { color: colors.accent }]}>
            {formatPrice(property.price)} <Text style={[styles.priceUnit, { color: colors.textMuted }]}>ريال يمني</Text>
          </Text>
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.specsGrid}>
          <View style={styles.specItem}>
            <View style={[styles.specIcon, { backgroundColor: colors.accentSurface }]}>
              <Ionicons name="resize-outline" size={20} color={colors.accent} />
            </View>
            <Text style={[styles.specLabel, { color: colors.textMuted }]}>المساحة</Text>
            <Text style={[styles.specValue, { color: colors.textPrimary }]}>{property.area} م²</Text>
          </View>
          <View style={[styles.specDivider, { backgroundColor: colors.border }]} />
          <View style={styles.specItem}>
            <View style={[styles.specIcon, { backgroundColor: colors.successSurface }]}>
              <Ionicons name="cube-outline" size={20} color={colors.success} />
            </View>
            <Text style={[styles.specLabel, { color: colors.textMuted }]}>النوع</Text>
            <Text style={[styles.specValue, { color: colors.textPrimary }]}>{TYPE_LABELS[property.type] || property.type}</Text>
          </View>
          <View style={[styles.specDivider, { backgroundColor: colors.border }]} />
          <View style={styles.specItem}>
            <View style={[styles.specIcon, { backgroundColor: colors.warningSurface }]}>
              <Ionicons name="time-outline" size={20} color={colors.warning} />
            </View>
            <Text style={[styles.specLabel, { color: colors.textMuted }]}>التاريخ</Text>
            <Text style={[styles.specValue, { color: colors.textPrimary }]}>{formatDate(property.created_at)}</Text>
          </View>
        </View>
      </Card>

      {(property.broker_name || property.broker_phone) ? (
        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الدلال / صاحب العرض الأصلي</Text>
          <View style={styles.brokerRow}>
            <View style={[styles.ownerAvatar, { backgroundColor: colors.warningSurface }]}><Ionicons name="megaphone-outline" size={22} color={colors.warning} /></View>
            <View style={styles.ownerDetails}>
              <Text style={[styles.ownerName, { color: colors.textPrimary }]}>{property.broker_name || '—'}</Text>
              {property.broker_phone ? <Pressable accessibilityRole="button" accessibilityLabel={`الاتصال بالدلال ${property.broker_name || ''}`} style={styles.contactRow} onPress={() => Linking.openURL(`tel:${property.broker_phone}`)}><Ionicons name="call-outline" size={14} color={colors.success} /><Text style={[styles.contactText, { color: colors.textSecondary }]}>{property.broker_phone}</Text></Pressable> : null}
            </View>
          </View>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>معلومات المالك</Text>
        <View style={styles.ownerInfo}>
          <View style={[styles.ownerAvatar, { backgroundColor: colors.accentSurface }]}>
            <Ionicons name="person" size={24} color={colors.accent} />
          </View>
          <View style={styles.ownerDetails}>
            <Text style={[styles.ownerName, { color: colors.textPrimary }]}>{property.owner_name || '—'}</Text>
            {property.owner_phone ? (
              <Pressable
                style={styles.contactRow}
                onPress={() => Linking.openURL(`tel:${property.owner_phone}`)}
              >
                <Ionicons name="call-outline" size={14} color={colors.success} />
                <Text style={[styles.contactText, { color: colors.textSecondary }]}>{property.owner_phone}</Text>
              </Pressable>
            ) : null}
            {property.owner_email ? (
              <Pressable
                style={styles.contactRow}
                onPress={() => Linking.openURL(`mailto:${property.owner_email}`)}
              >
                <Ionicons name="mail-outline" size={14} color={colors.info} />
                <Text style={[styles.contactText, { color: colors.textSecondary }]}>{property.owner_email}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.offersHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>العروض</Text>
          <Text style={[styles.offersCount, { color: colors.textMuted }]}>{offers.length} عرض</Text>
        </View>
        {offers.length === 0 ? (
          <View style={styles.offersEmpty}>
            <Ionicons name="pricetags-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد عروض بعد</Text>
          </View>
        ) : (
          offers.map((o) => (
            <View key={o.id} style={[styles.offerRow, { borderBottomColor: colors.border }]}>
              <View style={styles.offerLeft}>
                <Text style={[styles.offerAmount, { color: colors.accent }]}>{formatPrice(o.amount)} ريال يمني</Text>
                <Text style={[styles.offerClient, { color: colors.textSecondary }]}>{o.client_name}</Text>
              </View>
              <StatusBadge label={STATUS_LABELS[o.status] || o.status} value={o.status} />
            </View>
          ))
        )}
      </Card>

      {previewIdx !== null ? <MediaPreview media={media} index={previewIdx} onClose={() => setPreviewIdx(null)} /> : null}

      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => navigation.navigate('PropertyForm', { id: property.id })}
          style={({ pressed }) => [styles.actionBtn, styles.outlineBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
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
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  backBtn: {
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
    padding: spacing.sm,
  },
  propHero: {
    height: 180,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroImage: { width: '100%', height: '100%', borderRadius: radius.lg, resizeMode: 'cover' },
  brokerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  mediaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  mediaHint: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', marginTop: 2 },
  propTypeIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propHeroBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  section: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  propName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  addrWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  propAddr: {
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
  propDesc: {
    fontSize: fontSize.md,
    marginTop: spacing.md,
    lineHeight: 24,
    fontFamily: 'Tajawal_400Regular',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
  priceValue: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    fontFamily: 'Tajawal_800ExtraBold',
  },
  priceUnit: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    fontFamily: 'Tajawal_500Medium',
  },
  specsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  specItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  specIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specLabel: {
    fontSize: fontSize.xs,
    fontFamily: 'Tajawal_400Regular',
  },
  specValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
  },
  specDivider: {
    width: 1,
    height: 40,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  ownerInfo: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerDetails: {
    flex: 1,
    gap: spacing.xs,
  },
  ownerName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactText: {
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
  offersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  offersCount: {
    fontSize: fontSize.sm,
    fontFamily: 'Tajawal_400Regular',
  },
  offersEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
  offerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  offerLeft: {
    gap: 2,
  },
  offerAmount: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  offerClient: {
    fontSize: fontSize.sm,
    fontFamily: 'Tajawal_400Regular',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  mapBtnText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  outlineBtn: {
    backgroundColor: 'transparent',
  },
  actionBtnText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
  },
})
