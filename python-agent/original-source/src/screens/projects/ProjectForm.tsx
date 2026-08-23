import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Pressable } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import { Button, Input } from '../../components/ui'
import { getProject, createProject, updateProject } from '../../database/projects'

export default function ProjectForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const projectId: string | undefined = route.params?.projectId
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (projectId) {
      getProject(projectId).then((p) => {
        if (p) { setName(p.name); setDescription(p.description || '') }
      }).catch(() => {})
    }
  }, [projectId])

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('تنبيه', 'أدخل اسم المشروع')
      return
    }
    setSaving(true)
    try {
      if (projectId) {
        await updateProject(projectId, { name: name.trim(), description: description.trim() })
      } else {
        await createProject(name.trim(), description.trim())
      }
      navigation.goBack()
    } catch (e) {
      Alert.alert('خطأ', 'تعذر حفظ المشروع')
    }
    setSaving(false)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-forward" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{projectId ? 'تعديل المشروع' : 'مشروع جديد'}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>إدارة مشاريع الأراضي السكنية — الاسم إلزامي والوصف اختياري</Text>
          <View style={styles.field}>
            <Input label="اسم المشروع" value={name} onChangeText={setName} placeholder="مثال: مشروع الواحة السكني" />
          </View>
          <View style={styles.field}>
            <Input label="الوصف" value={description} onChangeText={setDescription} multiline placeholder="وصف تفصيلي اختياري للمشروع" />
          </View>

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
  backBtn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold' },
  body: { padding: spacing.xl, gap: spacing.lg },
  hint: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  field: { marginBottom: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
})