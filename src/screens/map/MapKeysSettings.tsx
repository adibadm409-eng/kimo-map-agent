import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Card } from '../../components/ui'
import {
  loadProviderSettings,
  saveProviderSettings,
} from '../MapScreenV2/mapProviders'

/** المزوّدات التي لا تعمل إلا بمفتاح من المستخدم (تُترك فارغة: معطّلة) */
const KEY_PROVIDERS: { id: string; name: string; note: string; placeholder: string; needsKey: boolean }[] = [
  {
    id: 'google-tiles',
    name: 'Google Maps — طبقات الصور الحية',
    note: 'مفتاح اختياري من Google Cloud Console (نوع "Tiles API"). يفعِّل طبقات صور Google عبر مفتاح حيّ مع كل طلب. بدون مفتاح: تبقى خريطة قوقل المدمجة في التطبيق تعمل كما هي تماماً.',
    placeholder: 'AIza…',
    needsKey: true,
  },
]

export default function MapKeysSettings({ navigation }: any) {
  const { colors, mode } = useTheme()
  const insets = useSafeAreaInsets()
  const nav = useNavigation<any>()
  const [keys, setKeys] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      const s = await loadProviderSettings()
      setKeys(s.keys ?? {})
    })()
  }, [])

  const save = useCallback(async (id: string, value: string) => {
    const next = { ...(keys ?? {}), [id]: value.trim() }
    setKeys(next)
    await saveProviderSettings({ keys: next })
  }, [keys])

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
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>المزوّدات التي تتطلب مفاتيح</Text>
      </View>

      <Card style={styles.hintCard}>
        <View style={[styles.hintIcon, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="key-outline" size={18} color="#B45309" />
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          هذه الخدمات لا تُفعَّل إلا بمفتاحك الشخصي. المفتاح يُحفظ محلياً على جهازك فقط ولا يُرسل لأي خادم. كل ما يتطلب مفتاحاً مدفوع الرسوم من خالقه — استخدامك واختيارك.
        </Text>
      </Card>

      {KEY_PROVIDERS.map((p) => {
        const enabled = !!keys[p.id]
        return (
          <Card key={p.id} style={styles.section}>
            <View style={styles.groupHeader}>
              <View style={styles.groupTitleWrap}>
                <Text style={[styles.groupName, { color: colors.textPrimary }]}>{p.name}</Text>
                <Text style={[styles.groupNote, { color: colors.textMuted }]}>{p.note}</Text>
              </View>
              <View style={[styles.stateBadge, enabled ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name={enabled ? 'checkmark-circle' : 'lock-closed-outline'} size={12} color={enabled ? '#16A34A' : '#94A3B8'} />
                <Text style={[styles.stateText, { color: enabled ? '#16A34A' : '#94A3B8' }]}>{enabled ? 'مفعل' : 'معطل'}</Text>
              </View>
            </View>
            <TextInput
              value={keys[p.id] ?? ''}
              onChangeText={(t) => save(p.id, t)}
              placeholder={p.placeholder}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { backgroundColor: mode === 'dark' ? colors.surface : '#F8FAFC', borderColor: colors.border, color: colors.textPrimary }]}
            />
            {enabled && (
              <Text style={[styles.enabledNote, { color: colors.accent }]}>
                مفعّل — ستظهر الطبقات المرتبطة بهذا المفتاح في قائمة الخريطة.
              </Text>
            )}
          </Card>
        )
      })}

      <Pressable
        onPress={() => {
          Alert.alert(
            'ملاحظة مهمة',
            'المفاتيح هنا خاصة بتطبيقك الشخصي ولا نتحمّل أي رسوم تترتب على استخدامها. احذف المفتاح من هذه الشاشة عند عدم الحاجة. النسخة المحمولة من التطبيق لا تعرض هذه الخدمات إذا لم تُدخل مفتاحاً.',
            [{ text: 'حسناً' }],
          )
        }}
        style={({ pressed }) => [styles.linkRow, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
        <Text style={[styles.linkText, { color: colors.textSecondary }]}>المزيد عن الأمان والحذف</Text>
      </Pressable>
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
  section: { padding: spacing.lg, gap: spacing.sm },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  groupTitleWrap: { flex: 1, gap: 2 },
  groupName: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  groupNote: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 17 },
  stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  stateText: { fontSize: 10, fontFamily: 'Tajawal_700Bold' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', marginTop: spacing.sm },
  hintNote: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium', marginTop: spacing.xs },
  enabledNote: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold', marginTop: spacing.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, justifyContent: 'center' },
  linkText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
})