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
import { getClient, createClient, updateClient } from '../database/db'

const TYPES = [
  { key: 'buyer', label: 'مشتري' },
  { key: 'seller', label: 'بائع' },
  { key: 'both', label: 'الاثنين' },
]

function FormInput({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address'
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

export default function ClientForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const editingId = route.params?.id
  const [loading, setLoading] = useState(!!editingId)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', type: 'buyer', notes: '', budget_min: '', budget_max: '',
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const c = await getClient(editingId)
        if (c && !cancelled) {
          setForm({
            name: c.name || '', phone: c.phone || '', email: c.email || '',
            type: c.type || 'buyer', notes: c.notes || '',
            budget_min: String(c.budget_min || ''), budget_max: String(c.budget_max || ''),
          })
        }
      } catch (e) {
        console.error('Failed to load client:', e)
      }
      if (!cancelled) setLoading(false)
    }
    if (editingId) load()
    return () => { cancelled = true }
  }, [editingId])

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('تنبيه', 'الرجاء إدخال اسم العميل'); return }
    const data = {
      name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
      type: form.type as 'buyer' | 'seller' | 'both', notes: form.notes.trim(),
      budget_min: Number(form.budget_min) || 0, budget_max: Number(form.budget_max) || 0,
    }
    if (editingId) await updateClient(editingId, data)
    else await createClient(data)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    navigation.goBack()
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.textMuted, fontFamily: 'Tajawal_400Regular' }}>جاري التحميل...</Text>
    </View>
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
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{editingId ? 'تعديل العميل' : 'عميل جديد'}</Text>
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>النوع</Text>
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
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>معلومات التواصل</Text>
          <ContactPickerButton onSelect={({ name, phone }) => setForm((current) => ({ ...current, name: name || current.name, phone: phone || current.phone }))} />
          <SuggestField label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} field="name" placeholder="الاسم الكامل" onPick={(c) => setForm((current) => ({ ...current, name: c.name || current.name, phone: c.phone || current.phone }))} />
          <SuggestField label="رقم الجوال" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} field="phone" placeholder="05XXXXXXXX" keyboardType="phone-pad" onPick={(c) => setForm((current) => ({ ...current, name: c.name || current.name, phone: c.phone || current.phone }))} />
          <FormInput label="البريد الإلكتروني" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="email@example.com" keyboardType="email-address" />
          <FormInput label="ملاحظات" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="ملاحظات إضافية" multiline />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الميزانية</Text>
          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <FormInput label="الحد الأدنى" value={form.budget_min} onChange={(v) => setForm({ ...form, budget_min: v })} placeholder="0" keyboardType="numeric" />
            </View>
            <View style={styles.halfField}>
              <FormInput label="الحد الأقصى" value={form.budget_max} onChange={(v) => setForm({ ...form, budget_max: v })} placeholder="0" keyboardType="numeric" />
            </View>
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
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 50, borderRadius: radius.full, borderWidth: 1 },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
})
