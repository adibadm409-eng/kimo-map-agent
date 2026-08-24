import React, { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card } from '../components/ui'
import { createCampaign } from '../database/db'

const TYPES = [
  { key: 'social_media', label: 'وسائل التواصل' },
  { key: 'email', label: 'بريد إلكتروني' },
  { key: 'sms', label: 'رسائل نصية' },
  { key: 'brochure', label: 'بروشور' },
]

const STATUSES = [
  { key: 'draft', label: 'مسودة' },
  { key: 'active', label: 'نشط' },
  { key: 'completed', label: 'منتهي' },
]

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

export default function CampaignForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [form, setForm] = useState({
    name: '', description: '',
    type: 'social_media', status: 'draft',
    budget: '', start_date: new Date().toISOString().split('T')[0], end_date: '',
    notes: '',
  })

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('تنبيه', 'أدخل اسم الحملة'); return }
    try {
      await createCampaign({
        name: form.name.trim(),
        description: form.description.trim(),
        type: form.type as 'social_media' | 'email' | 'sms' | 'brochure',
        status: form.status as 'active' | 'completed' | 'draft',
        budget: Number(form.budget) || 0,
        start_date: form.start_date, end_date: form.end_date,
        notes: form.notes,
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      navigation.goBack()
    } catch (e) {
      Alert.alert('خطأ', 'تعذر حفظ الحملة')
    }
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
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>حملة جديدة</Text>
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>المعلومات الأساسية</Text>
          <FormInput label="اسم الحملة" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="مثال: حملة إنستغرام" />
          <FormInput label="الوصف" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="وصف الحملة" multiline />
        </Card>

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
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الميزانية والتواريخ</Text>
          <FormInput label="الميزانية (ريال يمني)" value={form.budget} onChange={(v) => setForm({ ...form, budget: v })} placeholder="0" keyboardType="numeric" />
          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <FormInput label="تاريخ البداية" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} placeholder="YYYY-MM-DD" />
            </View>
            <View style={styles.halfField}>
              <FormInput label="تاريخ النهاية" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <FormInput label="ملاحظات" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="ملاحظات إضافية" multiline />
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
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, padding: 4 },
  segmentedBtn: { flex: 1, minWidth: '30%', alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.md, fontWeight: '500', fontFamily: 'Tajawal_500Medium' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 50, borderRadius: radius.full, borderWidth: 1 },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
})