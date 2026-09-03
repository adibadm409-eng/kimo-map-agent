import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card } from '../components/ui'
import SuggestField from '../components/SuggestField'
import { getAllProperties, getAllClients, createClient, createViewing } from '../database/db'

const STATUSES = [
  { key: 'scheduled', label: 'مجدول' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'cancelled', label: 'ملغي' },
]

export default function ViewingForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const [properties, setProperties] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [form, setForm] = useState({
    property_id: '', client_id: '',
    date_time: new Date().toISOString().slice(0, 16),
    status: 'scheduled', notes: '',
  })
  const [clientSearch, setClientSearch] = useState('')

  async function handleClientPick(c: { name: string; phone: string; source: string; refId: string }) {
    if (c.source === 'client' && c.refId) {
      setForm((current) => ({ ...current, client_id: c.refId }))
      setClientSearch(c.name)
      return
    }
    try {
      const id = await createClient({ name: c.name || 'عميل جديد', phone: c.phone, type: 'buyer', email: '', notes: '', budget_min: 0, budget_max: 0 })
      setClients(await getAllClients())
      setForm((current) => ({ ...current, client_id: id }))
      setClientSearch(c.name)
    } catch {
      Alert.alert('خطأ', 'تعذر ربط العميل')
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [props, cls] = await Promise.all([getAllProperties(), getAllClients()])
        if (!cancelled) {
          setProperties(props)
          setClients(cls)
        }
      } catch (e) {
        console.error('Failed to load form data:', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    if (!form.property_id) { Alert.alert('تنبيه', 'الرجاء اختيار عقار'); return }
    if (!form.client_id) { Alert.alert('تنبيه', 'الرجاء اختيار عميل'); return }
    try {
      await createViewing({
        property_id: form.property_id, client_id: form.client_id,
        date_time: form.date_time, status: form.status as 'scheduled' | 'completed' | 'cancelled',
        notes: form.notes,
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      navigation.goBack()
    } catch (e) {
      Alert.alert('خطأ', 'تعذر حفظ المشاهدة')
    }
  }

  function Picker({ label, value, options, onChange, placeholder }: {
    label: string
    value: string
    options: { id: string; label: string; subtitle?: string }[]
    onChange: (v: string) => void
    placeholder?: string
  }) {
    const { colors } = useTheme()
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll} contentContainerStyle={styles.pickerContent}>
          {options.length === 0 ? (
            <Text style={[styles.pickerEmpty, { color: colors.textMuted }]}>{placeholder || 'لا توجد عناصر'}</Text>
          ) : (
            options.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => { Haptics.selectionAsync(); onChange(o.id) }}
                style={({ pressed }) => [
                  styles.pickerItem,
                  value === o.id ? { backgroundColor: colors.accent, borderColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', color: value === o.id ? '#FFF' : colors.textSecondary }}>{o.label}</Text>
                {o.subtitle ? <Text style={{ fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', color: value === o.id ? '#FFF' : colors.textMuted, marginTop: 2 }}>{o.subtitle}</Text> : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>مشاهدة جديدة</Text>
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>العقار والعميل</Text>
          <Picker
            label="العقار"
            value={form.property_id}
            onChange={(v) => setForm({ ...form, property_id: v })}
            options={properties.map((p) => ({ id: p.id, label: p.name, subtitle: p.address }))}
            placeholder="لا توجد عقارات"
          />
          <SuggestField label="بحث عن العميل بالاسم أو الرقم" value={clientSearch} onChange={setClientSearch} field="name" placeholder="اكتب اسماً أو رقماً للبحث في العملاء والملاك والدلالين" onPick={handleClientPick} />
          <Picker
            label="العميل"
            value={form.client_id}
            onChange={(v) => {
              setForm({ ...form, client_id: v })
              const chosen = clients.find((c) => c.id === v)
              setClientSearch(chosen ? chosen.name || '' : '')
            }}
            options={clients.map((c) => ({ id: c.id, label: c.name, subtitle: c.phone }))}
            placeholder="لا يوجد عملاء"
          />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الموعد</Text>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>التاريخ والوقت</Text>
            <TextInput
              value={form.date_time}
              onChangeText={(v) => setForm({ ...form, date_time: v })}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, textAlign: 'center' }]}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>الحالة</Text>
            <View style={[styles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {STATUSES.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => { Haptics.selectionAsync(); setForm({ ...form, status: s.key }) }}
                  style={({ pressed }) => [
                    styles.segmentedBtn,
                    form.status === s.key ? { backgroundColor: colors.accent } : { backgroundColor: 'transparent' },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', color: form.status === s.key ? '#FFF' : colors.textSecondary }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>ملاحظات</Text>
            <TextInput
              value={form.notes}
              onChangeText={(v) => setForm({ ...form, notes: v })}
              placeholder="ملاحظات إضافية"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' }]}
            />
          </View>
        </Card>

        <View style={styles.actions}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="checkmark" size={18} color="#FFF" />
            <Text style={[styles.actionBtnText, { color: '#FFF' }]}>حفظ</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  section: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  segmented: { flexDirection: 'row', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, padding: 4 },
  segmentedBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.md, fontWeight: '500', fontFamily: 'Tajawal_500Medium' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', minHeight: 48, textAlignVertical: 'center' },
  pickerScroll: { maxHeight: 60 },
  pickerContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  pickerEmpty: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', paddingVertical: spacing.md },
  pickerItem: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minWidth: 120 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 50, borderRadius: radius.full, borderWidth: 1 },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
})
