import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, Pressable, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Button, Input } from '../../components/ui'
import { getBlock, createBlock, updateBlock } from '../../database/projects'

export default function BlockForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const projectId: string = route.params?.projectId
  const blockId: string | undefined = route.params?.blockId
  const [name, setName] = useState('')
  const [plotCount, setPlotCount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (blockId) {
      getBlock(blockId).then((b) => {
        if (b) {
          setName(b.name)
          setPlotCount(String(b.plot_count || 0))
          setNotes(b.notes || '')
        }
      }).catch(() => {})
    }
  }, [blockId])

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('تنبيه', 'أدخل اسم البلوك')
      return
    }
    const count = parseInt(plotCount, 10)
    if (isNaN(count) || count <= 0) {
      Alert.alert('تنبيه', 'أدخل عدد قطع الأراضي (رقم موجب)')
      return
    }
    setSaving(true)
    try {
      if (blockId) {
        await updateBlock(blockId, { name: name.trim(), plot_count: count, notes: notes.trim() })
      } else {
        await createBlock({ project_id: projectId, name: name.trim(), plot_count: count, notes: notes.trim() })
      }
      navigation.goBack()
    } catch (e) {
      Alert.alert('خطأ', 'تعذر حفظ البلوك')
    }
    setSaving(false)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerSide}>
            <Ionicons name="chevron-forward" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{blockId ? 'تعديل البلوك' : 'بلوك جديد'}</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <Input label="اسم البلوك" value={name} onChangeText={setName} placeholder="مثال: البلوك A" />
          </View>
          <View style={styles.field}>
            <Input label="عدد قطع الأراضي" value={plotCount} onChangeText={setPlotCount} keyboardType="numeric" placeholder="مثال: 12" />
          </View>
          <View style={styles.field}>
            <Input label="ملاحظات" value={notes} onChangeText={setNotes} multiline placeholder="ملاحظات إضافية اختيارية" />
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>سيتم إنشاء خانات فارغة بعدد القطع، ويمكن إدخال بيانات كل قطعة عند الضغط عليها</Text>

          <View style={styles.btnRow}>
            <Button title={saving ? 'جارٍ الحفظ...' : 'حفظ'} onPress={handleSave} disabled={saving} icon={<Ionicons name="checkmark" size={16} color="#FFF" />} />
            <Button title="إلغاء" onPress={() => navigation.goBack()} variant="ghost" />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  headerSide: { width: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold' },
  body: { padding: spacing.xl, gap: spacing.md },
  field: { marginBottom: spacing.xs },
  hint: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
})