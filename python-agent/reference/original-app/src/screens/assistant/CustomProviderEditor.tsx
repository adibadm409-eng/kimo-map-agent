import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import {
  getSettings,
  setSettings,
  genId,
  testConnection,
  type AgentSettings,
  type CustomProviderDef,
} from '../../assistant'

interface Draft {
  name: string
  baseUrl: string
  apiKey: string
  models: string
}

function parseModels(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function CustomProviderEditor({ navigation, route }: any) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const editingId: string | undefined = route?.params?.providerId

  const [draft, setDraft] = useState<Draft>({ name: '', baseUrl: '', apiKey: '', models: '' })
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const s = await getSettings().catch(() => null)
      if (s && editingId) {
        const c = s.customProviders.find((x) => x.id === editingId)
        if (c) {
          setDraft({ name: c.name, baseUrl: c.baseUrl, apiKey: c.apiKey, models: c.models.join('\n') })
          setLoaded(true)
          return
        }
      }
      setLoaded(true)
    })()
  }, [editingId])

  const onTest = useCallback(async () => {
    const models = parseModels(draft.models)
    if (!draft.name.trim()) return Alert.alert('الاسم مطلوب', 'اكتب اسم المزود أولاً.')
    if (!draft.baseUrl.trim()) return Alert.alert('الرابط مطلوب', 'اكتب رابط الواجهة المتوافق مع OpenAI مثل https://api.example.com/v1')
    if (!models.length) return Alert.alert('موديل مطلوب', 'أضف موديلاً واحداً على الأقل.')
    setTesting(true)
    setTestResult(null)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    try {
      const res = await testConnection({
        provider: {
          id: 'custom',
          name: draft.name.trim(),
          color: '#F59E0B',
          baseUrl: draft.baseUrl.trim(),
          defaultModels: models,
          modelsKind: 'openai',
        },
        baseUrl: draft.baseUrl.trim(),
        apiKey: draft.apiKey.trim(),
        model: models[0],
        timeoutMs: 45000,
      })
      setTestResult({ ok: res.ok, message: res.message })
      Haptics.notificationAsync(res.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {})
    } finally {
      setTesting(false)
    }
  }, [draft])

  const onSave = useCallback(async () => {
    const models = parseModels(draft.models)
    if (!draft.name.trim()) return Alert.alert('الاسم مطلوب', 'اكتب اسم المزود أولاً.')
    if (!draft.baseUrl.trim()) return Alert.alert('الرابط مطلوب', 'اكتب رابط الواجهة المتوافق مع OpenAI مثل https://api.example.com/v1')
    if (!models.length) return Alert.alert('موديل مطلوب', 'أضف موديلاً واحداً على الأقل.')
    const s = await getSettings()
    const existing: CustomProviderDef = {
      id: editingId ?? genId(),
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      models,
    }
    const others = s.customProviders.filter((c) => c.id !== existing.id)
    const nextSettings: AgentSettings = {
      ...s,
      customProviders: [...others, existing],
      activeProvider: `custom:${existing.id}`,
      models: { ...s.models, [`custom:${existing.id}`]: models[0] },
    }
    await setSettings(nextSettings)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    navigation.goBack()
  }, [draft, editingId, navigation])

  const onDelete = useCallback(async () => {
    if (!editingId) return
    Alert.alert('حذف المزود', 'سيتم حذف هذا المزود المخصص نهائياً.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const s = await getSettings()
          const next: AgentSettings = {
            ...s,
            customProviders: s.customProviders.filter((c) => c.id !== editingId),
          }
          if (next.activeProvider === `custom:${editingId}`) {
            next.activeProvider = 'deepseek'
          }
          await setSettings(next)
          navigation.goBack()
        },
      },
    ])
  }, [editingId, navigation])

  if (!loaded) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 60 }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{editingId ? 'تحرير المزود المخصص' : 'مزود مخصص جديد'}</Text>
          {editingId && (
            <Pressable onPress={onDelete} hitSlop={8} style={[styles.backBtn, { backgroundColor: colors.errorSurface }]}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { backgroundColor: colors.warningSurface, borderColor: colors.border }]}>
            <Ionicons name="pulse-outline" size={20} color={colors.warning} />
            <Text style={[styles.heroText, { color: colors.textSecondary }]}>
              أي مزود متوافق مع واجهة OpenAI (مثل خوادم vLLM/Ollama البعيدة أو بوابات الوسطاء) — اكتب اسمه ورابطه ومفتاحه وموديلاته.
            </Text>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>اسم المزود</Text>
            <TextInput
              value={draft.name}
              onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))}
              placeholder="مثال: بوابة شركتي"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>رابط الواجهة (Base URL)</Text>
            <TextInput
              value={draft.baseUrl}
              onChangeText={(t) => setDraft((d) => ({ ...d, baseUrl: t }))}
              placeholder="https://api.example.com/v1"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
            <Text style={[styles.muted, { color: colors.textMuted }]}>يجب أن ينتهي بـ /v1 (أو المسار الصحيح للواجهة).</Text>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>مفتاح API (اختياري)</Text>
            <TextInput
              value={draft.apiKey}
              onChangeText={(t) => setDraft((d) => ({ ...d, apiKey: t }))}
              placeholder="sk-..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>الموديلات (سطر أو فاصلة لكل موديل)</Text>
            <TextInput
              value={draft.models}
              onChangeText={(t) => setDraft((d) => ({ ...d, models: t }))}
              placeholder={'gpt-4o\ngpt-4o-mini\n...'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={[styles.input, styles.modelsInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          <Pressable
            onPress={onTest}
            disabled={testing}
            style={({ pressed }) => [
              styles.testBtn,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed || testing ? 0.6 : 1 },
            ]}
          >
            {testing ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="pulse-outline" size={17} color={colors.accent} />}
            <Text style={[styles.testBtnText, { color: colors.accent }]}>{testing ? 'جاري الفحص...' : 'فحص الاتصال قبل الحفظ'}</Text>
          </Pressable>
          {testResult && (
            <View style={[styles.testResult, { backgroundColor: testResult.ok ? colors.successSurface : colors.errorSurface, borderColor: colors.border }]}>
              <Ionicons name={testResult.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={testResult.ok ? colors.success : colors.error} />
              <Text style={[styles.testResultText, { color: testResult.ok ? colors.success : colors.error }]}>{testResult.message}</Text>
            </View>
          )}

          <Pressable
            onPress={onSave}
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{editingId ? 'حفظ التعديلات' : 'حفظ المزود وتفعيله'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backBtn: { width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  heroText: { flex: 1, fontSize: fontSize.xs, lineHeight: 18, fontFamily: 'Tajawal_400Regular' },
  fieldWrap: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  modelsInput: { minHeight: 90, textAlignVertical: 'top' },
  muted: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: radius.full, borderWidth: 1, marginTop: spacing.xs },
  testBtnText: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  testResult: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  testResultText: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 18 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.full, marginTop: spacing.sm },
  saveBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
})