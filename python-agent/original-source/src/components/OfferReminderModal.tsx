import { useEffect, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { fontSize, radius, spacing } from '../theme/tokens'

interface OfferReminderModalProps {
  visible: boolean
  initialAt?: string | null
  title: string
  onClose: () => void
  onSave: (date: Date) => Promise<void>
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toInputs(value?: string | null): { date: string; time: string } {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000)
  const safe = Number.isNaN(date.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : date
  return {
    date: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
    time: `${pad(safe.getHours())}:${pad(safe.getMinutes())}`,
  }
}

function dateFromInputs(date: string, time: string): Date | null {
  const match = date.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const timeMatch = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match || !timeMatch) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const result = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return null
  return result
}

export function OfferReminderModal({ visible, initialAt, title, onClose, onSave }: OfferReminderModalProps) {
  const { colors } = useTheme()
  const [date, setDate] = useState(() => toInputs(initialAt).date)
  const [time, setTime] = useState(() => toInputs(initialAt).time)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    const inputs = toInputs(initialAt)
    setDate(inputs.date)
    setTime(inputs.time)
    setSaving(false)
  }, [visible, initialAt])

  const applyPreset = (milliseconds: number) => {
    const inputs = toInputs(new Date(Date.now() + milliseconds).toISOString())
    setDate(inputs.date)
    setTime(inputs.time)
  }

  const handleSave = async () => {
    const selected = dateFromInputs(date, time)
    if (!selected) {
      Alert.alert('موعد غير صالح', 'اكتب التاريخ بصيغة YYYY-MM-DD والوقت بصيغة HH:MM.')
      return
    }
    if (selected.getTime() <= Date.now()) {
      Alert.alert('الموعد منتهٍ', 'يجب اختيار وقت مستقبلي للتنبيه.')
      return
    }
    setSaving(true)
    try {
      await onSave(selected)
    } catch {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>مؤقت تنبيه العرض</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{title}</Text>
            </View>
            <Pressable onPress={onClose} disabled={saving} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.textSecondary }]}>اختصارات سريعة</Text>
            <View style={styles.presets}>
              <Pressable onPress={() => applyPreset(60 * 60 * 1000)} style={[styles.preset, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.presetText, { color: colors.textSecondary }]}>بعد ساعة</Text></Pressable>
              <Pressable onPress={() => applyPreset(24 * 60 * 60 * 1000)} style={[styles.preset, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.presetText, { color: colors.textSecondary }]}>غداً</Text></Pressable>
              <Pressable onPress={() => applyPreset(7 * 24 * 60 * 60 * 1000)} style={[styles.preset, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.presetText, { color: colors.textSecondary }]}>بعد أسبوع</Text></Pressable>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>التاريخ</Text>
              <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" autoCapitalize="none" style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>الوقت</Text>
              <TextInput value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" autoCapitalize="none" style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} />
            </View>

            <View style={[styles.note, { backgroundColor: colors.infoSurface, borderColor: colors.border }]}>
              <Ionicons name="notifications-outline" size={18} color={colors.info} />
              <Text style={[styles.noteText, { color: colors.textSecondary }]}>سيظهر إشعار محلي في جهازك حتى إذا كان التطبيق مغلقاً، بعد منح صلاحية الإشعارات.</Text>
            </View>

            <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [styles.save, { backgroundColor: colors.accent, opacity: pressed || saving ? 0.65 : 1 }]}>
              <Ionicons name="alarm-outline" size={18} color="#FFF" />
              <Text style={styles.saveText}>{saving ? 'جاري الحفظ...' : 'حفظ المؤقت'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  subtitle: { fontSize: fontSize.sm, marginTop: 3, fontFamily: 'Tajawal_400Regular' },
  close: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing.md, paddingBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  presets: { flexDirection: 'row', gap: spacing.sm },
  preset: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm },
  presetText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_500Medium' },
  field: { gap: spacing.xs },
  input: { height: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  noteText: { flex: 1, fontSize: fontSize.xs, lineHeight: 18, fontFamily: 'Tajawal_400Regular' },
  save: { height: 48, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  saveText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
})
