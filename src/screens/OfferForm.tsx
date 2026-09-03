import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card } from '../components/ui'
import { ContactPickerButton } from '../components/ContactPickerButton'
import SuggestField from '../components/SuggestField'
import { getAllProperties, getAllClients, getOffer, createClient, createOffer, updateOffer } from '../database/db'
import { formatPrice } from '../utils/helpers'

const TYPES = [
  { key: 'buy_offer', label: 'عرض شراء' },
  { key: 'sell_offer', label: 'عرض بيع' },
]

const STATUSES = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'accepted', label: 'مقبول' },
  { key: 'rejected', label: 'مرفوض' },
  { key: 'countered', label: 'عرض مضاد' },
]

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

function FormInput({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric'
  multiline?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, minHeight: multiline ? 80 : 48, textAlignVertical: multiline ? 'top' : 'center' }]}
      />
    </View>
  )
}

export default function OfferForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const editingId = route.params?.id
  const [loading, setLoading] = useState(!!editingId)
  const [properties, setProperties] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [form, setForm] = useState({
    property_id: '', client_id: '', type: 'buy_offer', amount: '',
    status: 'pending', date: new Date().toISOString().split('T')[0], notes: '',
  })
  const [clientSearch, setClientSearch] = useState('')

  async function handleClientPick(c: { name: string; phone: string; source: string; refId: string }) {
    if (c.source === 'client' && c.refId) {
      setForm((current) => ({ ...current, client_id: c.refId }))
      setClientSearch(c.name)
      return
    }
    try {
      const id = await createClient({ name: c.name || 'عميل جديد', phone: c.phone, type: 'buyer', email: '', notes: c.refId ? `من ${c.refId}` : '', budget_min: 0, budget_max: 0 })
      const nextClients = await getAllClients()
      setClients(nextClients)
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
        const [props, cls, existing] = await Promise.all([getAllProperties(), getAllClients(), editingId ? getOffer(editingId) : Promise.resolve(null)])
        if (!cancelled) {
          setProperties(props)
          setClients(cls)
          if (existing) {
            setForm({
              property_id: existing.property_id || '',
              client_id: existing.client_id || '',
              type: existing.type || 'buy_offer',
              amount: String(existing.amount ?? ''),
              status: existing.status || 'pending',
              date: existing.date || new Date().toISOString().split('T')[0],
              notes: existing.notes || '',
            })
          }
        }
      } catch (e) {
        console.error('Failed to load form data:', e)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [editingId])

  function handleClientContact(contact: { name: string; phone: string }) {
    const normalized = contact.phone.replace(/\D/g, '')
    const existing = clients.find((client) => client.phone.replace(/\D/g, '') === normalized && normalized)
    if (existing) {
      setForm((current) => ({ ...current, client_id: existing.id }))
      Alert.alert('تم اختيار العميل', `تم ربط العرض بالعميل «${existing.name}».`)
      return
    }
    Alert.alert('إضافة طالب الشراء', `هل تريد إنشاء «${contact.name || 'عميل جديد'}» كعميل طالب للعرض؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إنشاء واختيار', onPress: async () => {
        try {
          const id = await createClient({ name: contact.name || 'عميل جديد', phone: contact.phone, type: 'buyer', email: '', notes: '', budget_min: 0, budget_max: 0 })
          const nextClients = await getAllClients()
          setClients(nextClients)
          setForm((current) => ({ ...current, client_id: id }))
        } catch {
          Alert.alert('خطأ', 'تعذر إنشاء العميل')
        }
      } },
    ])
  }

  async function handleSave() {
    if (form.type === 'sell_offer' && !form.property_id) { Alert.alert('تنبيه', 'عرض البيع يحتاج عقاراً مرتبطاً'); return }
    if (!form.client_id) { Alert.alert('تنبيه', 'الرجاء اختيار العميل طالب العرض'); return }
    if (!form.amount) { Alert.alert('تنبيه', 'الرجاء إدخال المبلغ'); return }
    try {
      const offerData = {
        property_id: form.property_id || null, client_id: form.client_id,
        type: form.type as 'buy_offer' | 'sell_offer',
        amount: Number(form.amount) || 0,
        status: form.status as 'accepted' | 'pending' | 'countered' | 'rejected',
        date: form.date, notes: form.notes,
      }
      if (editingId) await updateOffer(editingId, offerData)
      else await createOffer(offerData)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      navigation.goBack()
    } catch (e) {
      Alert.alert('خطأ', 'تعذر حفظ العرض')
    }
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.textMuted, fontFamily: 'Tajawal_400Regular' }}>جاري التحميل...</Text></View>
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
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{editingId ? 'تعديل العرض' : 'عرض جديد'}</Text>
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>النوع والحالة</Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>النوع</Text>
          <View style={[styles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {TYPES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => { Haptics.selectionAsync(); setForm({ ...form, type: t.key }) }}
                style={({ pressed }) => [
                  styles.segmentedBtn,
                  form.type === t.key ? { backgroundColor: colors.accent } : { backgroundColor: 'transparent' },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', color: form.type === t.key ? '#FFF' : colors.textSecondary }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: spacing.md }} />
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
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>العقار والعميل</Text>
          <ContactPickerButton label="اختيار طالب الشراء من جهات الاتصال" onSelect={handleClientContact} />
          <SuggestField label="بحث عن العميل بالاسم أو الرقم" value={clientSearch} onChange={setClientSearch} field="name" placeholder="اكتب اسماً أو رقماً للبحث في العملاء والملاك والدلالين" onPick={handleClientPick} />
          <Picker
            label={form.type === 'buy_offer' ? 'العقار (اختياري لطلب الشراء)' : 'العقار'}
            value={form.property_id}
            onChange={(v) => setForm({ ...form, property_id: v })}
            options={form.type === 'buy_offer' ? [{ id: '', label: 'بدون عقار', subtitle: 'يربط لاحقاً' }, ...properties.map((p) => ({ id: p.id, label: p.name, subtitle: formatPrice(p.price) + ' ريال يمني' }))] : properties.map((p) => ({ id: p.id, label: p.name, subtitle: formatPrice(p.price) + ' ريال يمني' }))}
            placeholder={form.type === 'buy_offer' ? 'يمكن ربط العقار لاحقاً' : 'لا توجد عقارات'}
          />
          <Picker
            label="العميل"
            value={form.client_id}
            onChange={(v) => setForm({ ...form, client_id: v })}
            options={clients.map((c) => ({ id: c.id, label: c.name, subtitle: c.phone }))}
            placeholder="لا يوجد عملاء"
          />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>التفاصيل</Text>
          <FormInput label="المبلغ (ريال يمني)" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0" keyboardType="numeric" />
          <FormInput label="التاريخ" value={form.date} onChange={(v) => setForm({ ...form, date: v })} placeholder="YYYY-MM-DD" />
          <FormInput label="ملاحظات" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="ملاحظات إضافية" multiline />
        </Card>

        <View style={styles.actions}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="checkmark" size={18} color="#FFF" />
            <Text style={[styles.actionBtnText, { color: '#FFF' }]}>{editingId ? 'حفظ التعديل' : 'حفظ'}</Text>
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
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  pickerScroll: { maxHeight: 60 },
  pickerContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  pickerEmpty: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', paddingVertical: spacing.md },
  pickerItem: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minWidth: 120 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 50, borderRadius: radius.full, borderWidth: 1 },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
})
