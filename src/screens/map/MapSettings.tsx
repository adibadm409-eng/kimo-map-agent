import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, LayoutAnimation } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useIsFocused } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card } from '../../components/ui'
import {
  PROVIDER_GROUPS,
  loadProviderSettings,
  toggleStyleHidden,
  type MapItem,
  type MapItemStatus,
  type MapProviderGroup,
} from '../MapScreenV2/mapProviders'

const STATUS_META: Record<MapItemStatus, { label: string; color: string; bg: string; icon: string }> = {
  available: { label: 'مفعّلة', color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-circle' },
  soon: { label: 'غير مدمجة بعد', color: '#B45309', bg: '#FEF3C7', icon: 'time-outline' },
  vector: { label: 'متجهية', color: '#7C3AED', bg: '#EDE9FE', icon: 'git-merge-outline' },
}

export default function MapSettings({ navigation }: any) {
  const { colors, mode } = useTheme()
  const insets = useSafeAreaInsets()
  const isFocused = useIsFocused()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [infoItem, setInfoItem] = useState<{ group: MapProviderGroup; item: MapItem } | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [, reloadTick] = useState(0)

  useEffect(() => {
    if (!isFocused) return
    loadProviderSettings().then((s) => setHidden(s.hidden))
  }, [isFocused, reloadTick])

  const toggleGroup = (id: string) => {
    Haptics.selectionAsync()
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((e) => ({ ...e, [id]: !e[id] }))
  }

  const toggleItem = useCallback(async (styleKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await toggleStyleHidden(styleKey)
    const s = await loadProviderSettings()
    setHidden(s.hidden)
  }, [])

  const openInfo = (group: MapProviderGroup, item: MapItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setInfoItem({ group, item })
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>مزوّدو الخرائط</Text>
      </View>

      <Card style={styles.hintCard}>
        <View style={[styles.hintIcon, { backgroundColor: colors.accent + '1A' }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          اضغط على أي مزوّد لفتح قائمته. كل خريطة لها زر معلومات يشرح كيف تبدو. الأنماط الموسومة «مفعّلة» يمكن إخفاؤها/إظهارها من زر العين.
        </Text>
      </Card>

      {PROVIDER_GROUPS.map((group) => {
        const isOpen = !!expanded[group.id]
        const availableCount = group.maps.filter((m) => m.status === 'available').length
        return (
          <Card key={group.id} style={styles.section}>
            <Pressable onPress={() => toggleGroup(group.id)} style={({ pressed }) => [styles.groupHeader, pressed && { opacity: 0.7 }]}>
              <View style={[styles.groupIcon, { backgroundColor: colors.accent + '12' }]}>
                <Ionicons name={group.id === 'google' ? 'logo-google' : group.id === 'osm' ? 'map-outline' : group.id === 'openfreemap' ? 'globe-outline' : 'layers-outline'} size={18} color={colors.accent} />
              </View>
              <View style={styles.groupTitleWrap}>
                <Text style={[styles.groupName, { color: colors.textPrimary }]}>{group.name}</Text>
                <Text style={[styles.groupNote, { color: colors.textMuted }]} numberOfLines={2}>{group.note}</Text>
              </View>
              <View style={styles.groupMeta}>
                {availableCount > 0 && (
                  <View style={styles.availBadge}>
                    <Text style={[styles.availBadgeText, { color: STATUS_META.available.color }]}>{availableCount} مفعّلة</Text>
                  </View>
                )}
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </View>
            </Pressable>

            {isOpen && (
              <View style={styles.mapList}>
                {group.maps.map((item, i) => {
                  const meta = STATUS_META[item.status]
                  const hiddenNow = item.styleKey ? hidden.includes(item.styleKey) : false
                  const isLast = i === group.maps.length - 1
                  return (
                    <View
                      key={`${group.id}-${item.label}`}
                      style={[styles.mapRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }]}
                    >
                      <View style={styles.mapMain}>
                        <View style={[styles.mapIcon, { backgroundColor: colors.bgSecondary + '80' }]}>
                          <Ionicons name={item.icon as any} size={16} color={colors.textSecondary} />
                        </View>
                        <View style={styles.mapTextWrap}>
                          <Text style={[styles.mapLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                          <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
                            <Ionicons name={meta.icon as any} size={10} color={meta.color} />
                            <Text style={[styles.statusText, { color: meta.color }]}>{item.styleKey && item.status === 'available' && hiddenNow ? 'مخفية' : meta.label}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.mapActions}>
                        {item.styleKey && item.status === 'available' && (
                          <Pressable
                            onPress={() => toggleItem(item.styleKey!)}
                            hitSlop={8}
                            style={[styles.actionBtn, { borderColor: hiddenNow ? colors.border : colors.accent + '40', backgroundColor: hiddenNow ? 'transparent' : colors.accent + '0D' }]}
                          >
                            <Ionicons name={hiddenNow ? 'eye-off-outline' : 'eye-outline'} size={15} color={hiddenNow ? colors.textMuted : colors.accent} />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => openInfo(group, item)}
                          hitSlop={8}
                          style={({ pressed }) => [styles.infoBtn, { borderColor: colors.border }, pressed && { backgroundColor: colors.bgSecondary }]}
                        >
                          <Ionicons name="information-circle-outline" size={17} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </Card>
        )
      })}

      <Text style={[styles.footnote, { color: colors.textMuted }]}>
        القائمة تعرض الكتالوج الكامل لكل مزوّد — بما فيه ما لم يُدمج بعد. التفعيل والإخفاء محلي 100%.
      </Text>

      <Modal
        visible={!!infoItem}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoItem(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setInfoItem(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={(e) => e.stopPropagation()}>
            {infoItem && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalIcon, { backgroundColor: colors.accent + '14' }]}>
                    <Ionicons name={infoItem.item.icon as any} size={22} color={colors.accent} />
                  </View>
                  <View style={styles.modalTitleWrap}>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{infoItem.item.label}</Text>
                    <Text style={[styles.modalGroup, { color: colors.textMuted }]}>{infoItem.group.name}</Text>
                  </View>
                  <Pressable onPress={() => setInfoItem(null)} hitSlop={10} style={styles.modalClose}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={[styles.statusChipBig, { backgroundColor: STATUS_META[infoItem.item.status].bg, alignSelf: 'flex-start' }]}>
                  <Ionicons name={STATUS_META[infoItem.item.status].icon as any} size={12} color={STATUS_META[infoItem.item.status].color} />
                  <Text style={[styles.statusTextBig, { color: STATUS_META[infoItem.item.status].color }]}>
                    {STATUS_META[infoItem.item.status].label}
                  </Text>
                </View>
                <Text style={[styles.modalInfo, { color: colors.textSecondary }]}>{infoItem.item.info}</Text>
                {infoItem.item.status === 'vector' && (
                  <Text style={[styles.modalWarn, { color: '#B45309' }]}>
                    ملاحظة: هذه الخريطة تُرسل بمعمارية المتجهات (MVT) ولا يمكن عرضها بمحرك الصور الحالي في التطبيق — تُعرض هنا للمعرفة الكاملة بالكتالوج.
                  </Text>
                )}
                {infoItem.item.status === 'soon' && (
                  <Text style={[styles.modalWarn, { color: '#B45309' }]}>
                    غير مدمجة في التطبيق بعد — تُعرض هنا لأن المزوّد يقدمها رسمياً، ويمكن دمجها لاحقاً إن أردت.
                  </Text>
                )}
                <Pressable
                  onPress={() => setInfoItem(null)}
                  style={({ pressed }) => [styles.modalBtn, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.modalBtnText}>فهمت</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  hintCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  hintIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  hintText: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 18 },
  section: { padding: spacing.lg, gap: spacing.xs },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  groupTitleWrap: { flex: 1, gap: 2 },
  groupName: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  groupNote: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 16 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  availBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#ECFDF5' },
  availBadgeText: { fontSize: 10, fontFamily: 'Tajawal_700Bold' },
  mapList: { marginTop: spacing.sm, gap: 0 },
  mapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs + 3 },
  mapMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  mapIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mapTextWrap: { flex: 1, gap: 3 },
  mapLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 9, fontFamily: 'Tajawal_700Bold' },
  mapActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  infoBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  footnote: { fontSize: 10, fontFamily: 'Tajawal_400Regular', textAlign: 'center', marginTop: spacing.xs, lineHeight: 15 },
  backdrop: { flex: 1, backgroundColor: '#0F172ACC', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modalIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalTitleWrap: { flex: 1, gap: 1 },
  modalTitle: { fontSize: fontSize.lg, fontFamily: 'Tajawal_800ExtraBold' },
  modalGroup: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  modalClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  statusChipBig: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusTextBig: { fontSize: 11, fontFamily: 'Tajawal_700Bold' },
  modalInfo: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', lineHeight: 22 },
  modalWarn: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium', lineHeight: 19, borderRadius: radius.md, backgroundColor: '#FEF3C740', padding: spacing.sm },
  modalBtn: { borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  modalBtnText: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold', color: '#FFFFFF' },
})