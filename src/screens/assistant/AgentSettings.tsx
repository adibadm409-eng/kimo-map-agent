import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import {
  PROVIDERS,
  VOICE_SUPPORT_GUIDE,
  defaultProvider,
  fetchProviderModels,
  filterChatModels,
  testConnection,
  getSettings,
  setSettings,
  saveAgentApiKey,
  type AgentSettings,
  type ProviderDef,
  type ProviderId,
  type CustomProviderDef,
} from '../../assistant'
import { voiceSupportFor } from '../../assistant/providers'

function providerDefFor(activeKey: string, customProviders: CustomProviderDef[]): ProviderDef {
  if (activeKey.startsWith('custom:')) {
    const id = activeKey.slice('custom:'.length)
    const c = customProviders.find((x) => x.id === id)
    return c
      ? { id: 'custom', name: c.name, color: '#F59E0B', baseUrl: c.baseUrl, defaultModels: c.models, modelsKind: 'openai', hint: `المزود المخصص ${c.name}` }
      : defaultProvider('custom')
  }
  return defaultProvider(activeKey as ProviderId)
}

export default function AgentSettings({ navigation }: any) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [settings, setSettingsState] = useState<AgentSettings | null>(null)
  const [activeKey, setActiveKey] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [editingBaseUrl, setEditingBaseUrl] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [visionProvider, setVisionProvider] = useState('')
  const [visionModel, setVisionModel] = useState('')
  const [visionPickerOpen, setVisionPickerOpen] = useState(false)
  const [testingVision, setTestingVision] = useState(false)
  const [visionTestResult, setVisionTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const s = await getSettings().catch(() => null)
      if (!s) return
      setSettingsState(s)
      setActiveKey(s.activeProvider)
      setApiKey(s.keys[s.activeProvider] ?? '')
      setModel(s.models[s.activeProvider] ?? '')
      setMode(s.mode)
      setVisionProvider(s.visionProvider ?? '')
      setVisionModel(s.visionModel ?? '')
    })()
  }, [])

  const save = useCallback(
    async (patch: Partial<AgentSettings>) => {
      const next = { ...settings, ...patch } as AgentSettings
      setSettingsState(next)
      await setSettings(patch)
      return next
    },
    [settings]
  )

  const selectProvider = useCallback(
    async (key: string) => {
      const s = await save({ activeProvider: key })
      const def = providerDefFor(key, s.customProviders)
      setActiveKey(key)
      let keyVal = s.keys[key] ?? ''
      if (!keyVal && key.startsWith('custom:')) {
        const custom = s.customProviders.find((c) => c.id === key.slice(7))
        keyVal = custom?.apiKey ?? ''
      }
      setApiKey(keyVal)
      setBaseUrl(def.baseUrl)
      const shown = s.models[key] ?? def.defaultModels[0] ?? ''
      setModel(shown)
      setTestResult(null)
      Haptics.selectionAsync().catch(() => {})
    },
    [save]
  )

  const selectModel = useCallback(
    (m: string) => {
      setModel(m)
      void save({ models: { ...settings?.models, [activeKey]: m } })
      setModelPickerOpen(false)
      setTestResult(null)
    },
    [save, settings?.models, activeKey]
  )

  useEffect(() => {
    const def = providerDefFor(activeKey, settings?.customProviders ?? [])
    setBaseUrl(def.baseUrl)
  }, [activeKey, settings?.customProviders])

  const onSaveApiKey = useCallback(async () => {
    const value = apiKey.trim()
    if (!value) {
      Alert.alert('مفتاح مطلوب', 'أدخل مفتاح API أولاً ثم اضغط زر الحفظ الصريح.')
      return
    }
    setSavingKey(true)
    try {
      await saveAgentApiKey(activeKey, value)
      setSettingsState((current) => current ? {
        ...current,
        keys: activeKey.startsWith('custom:') ? current.keys : { ...current.keys, [activeKey]: value },
        customProviders: activeKey.startsWith('custom:')
          ? current.customProviders.map((provider) => provider.id === activeKey.slice('custom:'.length) ? { ...provider, apiKey: value } : provider)
          : current.customProviders,
      } : current)
      setApiKey(value)
      Alert.alert('تم الحفظ', 'تم حفظ مفتاح API والتحقق من وجوده داخل قاعدة البيانات المحلية.')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (error: any) {
      Alert.alert('تعذر الحفظ', error?.message || 'تعذر حفظ المفتاح داخل قاعدة البيانات المحلية.')
    } finally {
      setSavingKey(false)
    }
  }, [activeKey, apiKey])

  const onFetchModels = useCallback(async () => {
    if (!apiKey.trim()) {
      Alert.alert('مفتاح مطلوب', 'أدخل مفتاح API أولاً ثم اعرض قائمة الموديلات الحية.')
      return
    }
    setFetchingModels(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    try {
      const def = providerDefFor(activeKey, settings?.customProviders ?? [])
      const raw = await fetchProviderModels(def, apiKey.trim(), activeKey.startsWith('custom:') ? baseUrl : undefined)
      const list = filterChatModels(raw)
      if (!list.length) {
        Alert.alert('لا موديلات', 'تعذّر جلب القائمة من المزود — استخدم الموديلات الافتراضية أو أدخل اسم الموديل يدوياً.')
        return
      }
      await save({
        models: { ...settings?.models, [activeKey]: list[0] },
        modelLists: { ...settings?.modelLists, [activeKey]: list },
      })
      setModel(list[0])
    } finally {
      setFetchingModels(false)
    }
  }, [apiKey, activeKey, baseUrl, settings?.models, settings?.modelLists, save])

  const onTest = useCallback(async () => {
    if (!apiKey.trim()) {
      Alert.alert('مفتاح مطلوب', 'أدخل مفتاح API قبل فحص الاتصال.')
      return
    }
    if (!model.trim()) {
      Alert.alert('موديل مطلوب', 'اختر موديلاً قبل فحص الاتصال.')
      return
    }
    setTesting(true)
    setTestResult(null)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    try {
      const def = providerDefFor(activeKey, settings?.customProviders ?? [])
      const res = await testConnection({
        provider: def,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey.trim(),
        model: model.trim(),
        timeoutMs: 45000,
      })
      setTestResult({ ok: res.ok, message: res.message })
      Haptics.notificationAsync(res.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {})
    } finally {
      setTesting(false)
    }
  }, [apiKey, model, baseUrl, activeKey, settings?.customProviders])

  const toggleMode = useCallback(async () => {
    const next: 'read' | 'edit' = mode === 'read' ? 'edit' : 'read'
    setMode(next)
    await save({ mode: next })
    Haptics.selectionAsync().catch(() => {})
  }, [mode, save])

  if (!settings) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 60 }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  const activeDef = providerDefFor(activeKey, settings.customProviders)
  const isCustom = activeKey.startsWith('custom:')
  const builtInModels = activeDef.defaultModels
  const shown = settings.models[activeKey] ?? ''
  const modelOptions = [shown, ...(settings.modelLists[activeKey] ?? []), ...builtInModels].filter(Boolean)
  const uniqueModels = Array.from(new Set(modelOptions)).filter(Boolean)
  const activeVoiceSupport = voiceSupportFor(activeDef, model)

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>إعدادات المساعد</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>المزوّد</Text>
          <View style={styles.providerGrid}>
            {PROVIDERS.filter((p) => p.id !== 'custom').map((p) => {
              const active = activeKey === p.id
              return (
                <Pressable
                  key={p.id}
                  onPress={() => selectProvider(p.id)}
                  style={({ pressed }) => [
                    styles.providerCard,
                    {
                      backgroundColor: active ? colors.accentSurface : colors.bgCard,
                      borderColor: active ? colors.accent : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={[styles.providerDot, { backgroundColor: p.color }]} />
                  <Text numberOfLines={2} style={[styles.providerName, { color: colors.textPrimary }]}>{p.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
                </Pressable>
              )
            })}
            {settings.customProviders.map((c) => {
              const active = activeKey === `custom:${c.id}`
              return (
                <Pressable key={c.id} onPress={() => selectProvider(`custom:${c.id}`)} style={({ pressed }) => [
                  styles.providerCard,
                  {
                    backgroundColor: active ? colors.accentSurface : colors.bgCard,
                    borderColor: active ? colors.accent : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                  <View style={[styles.providerDot, { backgroundColor: '#F59E0B' }]} />
                  <Text numberOfLines={1} style={[styles.providerName, { color: colors.textPrimary }]}>{c.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
                </Pressable>
              )
            })}
            <Pressable
              onPress={() => navigation.navigate('CustomProviderEditor')}
              style={({ pressed }) => [
                styles.providerCard,
                styles.addProviderCard,
                { borderColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={[styles.providerName, { color: colors.accent }]}>مزود مخصص</Text>
            </Pressable>
          </View>

          {activeDef.hint ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{activeDef.hint}</Text>
          ) : null}

          {isCustom ? (
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                قم بتحرير هذا المزود عبر زر «تحرير» لإدارة الرابط والمفتاح والموديلات.
              </Text>
              <Pressable
                onPress={() =>
                  navigation.navigate('CustomProviderEditor', { providerId: activeKey.slice('custom:'.length) })
                }
                style={[styles.editBtn, { backgroundColor: colors.accentSurface }]}
              >
                <Ionicons name="create-outline" size={15} color={colors.accent} />
                <Text style={[styles.editBtnText, { color: colors.accent }]}>تحرير المزود المخصص</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>الربط والمفتاح</Text>
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>مفتاح API</Text>
            <View style={styles.keyRow}>
              <TextInput
                value={apiKey}
                onChangeText={(t) => {
                  setApiKey(t)
                }}
                placeholder="sk-..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
                style={[styles.keyInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              />
              <Pressable onPress={() => setShowKey((v) => !v)} style={[styles.eyeBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              onPress={onSaveApiKey}
              disabled={savingKey}
              style={({ pressed }) => [styles.saveKeyBtn, { backgroundColor: colors.accent, opacity: pressed || savingKey ? 0.65 : 1 }]}
            >
              {savingKey ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={17} color="#fff" />}
              <Text style={styles.saveKeyBtnText}>{savingKey ? 'جاري الحفظ والتحقق...' : 'حفظ المفتاح في قاعدة البيانات'}</Text>
            </Pressable>
            <Text style={[styles.muted, { color: colors.textMuted }]}>لن يعتمد الحفظ على مغادرة الشاشة؛ اضغط الزر بعد كتابة المفتاح.</Text>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>رابط الواجهة (Base URL)</Text>
            <View style={styles.keyRow}>
              <TextInput
                value={baseUrl}
                onChangeText={setBaseUrl}
                onEndEditing={() => setEditingBaseUrl(false)}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!activeDef.baseUrl || editingBaseUrl || isCustom}
                onFocus={() => setEditingBaseUrl(true)}
                style={[styles.keyInput, { backgroundColor: colors.surface, borderColor: colors.border, color: editingBaseUrl || isCustom || !activeDef.baseUrl ? colors.textPrimary : colors.textSecondary, opacity: activeDef.baseUrl && !editingBaseUrl && !isCustom ? 0.6 : 1 }]}
              />
              {activeDef.baseUrl && !isCustom && (
                <Pressable onPress={() => setEditingBaseUrl((v) => !v)} style={[styles.eyeBtn, { backgroundColor: colors.surface }]}>
                  <Ionicons name={editingBaseUrl ? 'checkmark' : 'create-outline'} size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            {!activeDef.baseUrl && <Text style={[styles.muted, { color: colors.textMuted }]}>أدخل رابطًا متوافقًا مع واجهة OpenAI مثل: https://api.example.com/v1</Text>}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>الموديل</Text>
          <Pressable
            onPress={() => setModelPickerOpen(true)}
            style={({ pressed }) => [styles.modelField, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.modelLeft}>
              <Ionicons name="git-branch-outline" size={17} color={colors.accent} />
              <Text numberOfLines={1} style={[styles.modelName, { color: colors.textPrimary }]}>{model || 'اختر موديلاً...'}</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={onFetchModels} disabled={fetchingModels} style={[styles.fetchBtn, { backgroundColor: colors.surface, opacity: fetchingModels ? 0.6 : 1 }]}>
            {fetchingModels ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="cloud-download-outline" size={16} color={colors.accent} />
            )}
            <Text style={[styles.fetchBtnText, { color: colors.accent }]}>
              {fetchingModels ? 'جلب الموديلات...' : 'جلب قائمة الموديلات وحفظها'}
            </Text>
          </Pressable>
          {(settings.modelLists[activeKey] ?? []).length > 0 && (
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              القائمة المحفوظة: {settings.modelLists[activeKey].length} موديل — لن تحتاج لإعادة الجلب.
            </Text>
          )}

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>الإدخال الصوتي</Text>
          <View style={[styles.voiceActiveCard, { backgroundColor: activeVoiceSupport === 'supported' ? colors.successSurface : colors.warningSurface, borderColor: colors.border }]}>
            <Ionicons name={activeVoiceSupport === 'supported' ? 'mic-circle-outline' : 'information-circle-outline'} size={20} color={activeVoiceSupport === 'supported' ? colors.success : colors.warning} />
            <View style={styles.voiceActiveBody}>
              <Text style={[styles.modeTitle, { color: colors.textPrimary }]}>الموديل الحالي: {model || 'غير محدد'}</Text>
              <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
                {activeVoiceSupport === 'supported' ? 'يدعم إرسال التسجيل الصوتي عبر العقد المعتمد.' : 'لن يرسل كيمو صوتاً إلى هذا الموديل حتى لا ينتج طلباً غير متوافق.'}
              </Text>
            </View>
          </View>
          <View style={styles.voiceGuideList}>
            {VOICE_SUPPORT_GUIDE.map((item) => (
              <View key={item.provider} style={[styles.voiceGuideRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.voiceStatusDot, { backgroundColor: item.support === 'supported' ? colors.success : item.support === 'unsupported' ? colors.error : colors.warning }]} />
                <View style={styles.voiceGuideBody}>
                  <Text style={[styles.voiceGuideTitle, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[styles.voiceGuideModels, { color: colors.textSecondary }]}>{item.models}</Text>
                  <Text style={[styles.voiceGuideNote, { color: colors.textMuted }]}>{item.note}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>الوضع الافتراضي</Text>
          <Pressable onPress={toggleMode} style={[styles.modeCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={[styles.modeIcon, { backgroundColor: mode === 'edit' ? colors.successSurface : colors.infoSurface }]}>
              <Ionicons name={mode === 'edit' ? 'create-outline' : 'eye-outline'} size={20} color={mode === 'edit' ? colors.success : colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modeTitle, { color: colors.textPrimary }]}>{mode === 'edit' ? 'وضع التعديل' : 'وضع القراءة فقط'}</Text>
              <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
                {mode === 'edit'
                  ? 'المساعد يستطيع إضافة وتعديل وحذف البيانات (الحذف يتطلب موافقتك).'
                  : 'المساعد يقرأ ويستعرض فقط — ممنوع أي تعديل على البيانات.'}
              </Text>
            </View>
            <View style={[styles.switch, { backgroundColor: mode === 'edit' ? colors.success : colors.borderHover }]}>
              <View style={[styles.switchKnob, { alignSelf: mode === 'edit' ? 'flex-start' : 'flex-end', backgroundColor: '#fff' }]} />
            </View>
          </Pressable>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>موديل الرؤية (تحليل الصور)</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            اختر المزود والموديل المخصص لتحليل الصور عند طلب استخراج البيانات. يُستخدم هذا الموديل لإرسال الصورة فعلياً وتحليلها بدقة.
          </Text>
          <View style={styles.providerGrid}>
            {PROVIDERS.filter((p) => p.id !== 'custom').map((p) => {
              const active = visionProvider === p.id
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setVisionProvider(p.id)
                    setVisionModel(p.defaultModels[0] ?? '')
                    setVisionTestResult(null)
                    void save({ visionProvider: p.id, visionModel: p.defaultModels[0] ?? '' })
                    Haptics.selectionAsync().catch(() => {})
                  }}
                  style={({ pressed }) => [
                    styles.providerCard,
                    {
                      backgroundColor: active ? colors.accentSurface : colors.bgCard,
                      borderColor: active ? colors.accent : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={[styles.providerDot, { backgroundColor: p.color }]} />
                  <Text numberOfLines={2} style={[styles.providerName, { color: colors.textPrimary }]}>{p.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
                </Pressable>
              )
            })}
            {settings.customProviders.map((c) => {
              const active = visionProvider === `custom:${c.id}`
              return (
                <Pressable key={c.id} onPress={() => {
                  setVisionProvider(`custom:${c.id}`)
                  setVisionModel(c.models[0] ?? '')
                  setVisionTestResult(null)
                  void save({ visionProvider: `custom:${c.id}`, visionModel: c.models[0] ?? '' })
                  Haptics.selectionAsync().catch(() => {})
                }} style={({ pressed }) => [
                  styles.providerCard,
                  {
                    backgroundColor: active ? colors.accentSurface : colors.bgCard,
                    borderColor: active ? colors.accent : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                  <View style={[styles.providerDot, { backgroundColor: '#F59E0B' }]} />
                  <Text numberOfLines={1} style={[styles.providerName, { color: colors.textPrimary }]}>{c.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
                </Pressable>
              )
            })}
          </View>
          {visionProvider ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>موديل الرؤية</Text>
              <Pressable
                onPress={() => setVisionPickerOpen(true)}
                style={({ pressed }) => [styles.modelField, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={styles.modelLeft}>
                  <Ionicons name="eye-outline" size={17} color={colors.accent} />
                  <Text numberOfLines={1} style={[styles.modelName, { color: colors.textPrimary }]}>{visionModel || 'اختر موديل رؤية...'}</Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!visionModel.trim()) { Alert.alert('موديل مطلوب', 'اختر موديل رؤية أولاً.'); return }
                  setTestingVision(true)
                  setVisionTestResult(null)
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
                  try {
                    const def = providerDefFor(visionProvider, settings.customProviders)
                    const key = visionProvider.startsWith('custom:')
                      ? settings.customProviders.find((c) => c.id === visionProvider.slice(7))?.apiKey ?? ''
                      : settings.keys[visionProvider] ?? ''
                    if (!key) { Alert.alert('مفتاح مطلوب', 'أدخل مفتاح API للمزود المختار أولاً.'); setTestingVision(false); return }
                    const res = await testConnection({
                      provider: def,
                      apiKey: key,
                      model: visionModel.trim(),
                      timeoutMs: 45000,
                    })
                    setVisionTestResult({ ok: res.ok, message: res.message })
                    Haptics.notificationAsync(res.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {})
                  } finally {
                    setTestingVision(false)
                  }
                }}
                disabled={testingVision}
                style={({ pressed }) => [
                  styles.testBtn,
                  { backgroundColor: colors.accent, opacity: pressed || testingVision ? 0.7 : 1 },
                ]}
              >
                {testingVision ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="eye-outline" size={18} color="#fff" />
                )}
                <Text style={styles.testBtnText}>{testingVision ? 'جاري فحص موديل الرؤية...' : 'فحص الاتصال بموديل الرؤية'}</Text>
              </Pressable>
              {visionTestResult && (
                <View style={[styles.testResult, { backgroundColor: visionTestResult.ok ? colors.successSurface : colors.errorSurface, borderColor: colors.border }]}>
                  <Ionicons name={visionTestResult.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={visionTestResult.ok ? colors.success : colors.error} />
                  <Text style={[styles.testResultText, { color: visionTestResult.ok ? colors.success : colors.error }]}>{visionTestResult.message}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                اختر مزوداً أعلاه لتفعيل إعدادات موديل الرؤية. عند إرسال صورة مع طلب استخراج بيانات، سيتم إرسال الصورة فعلياً إلى هذا الموديل لتحليلها بدقة.
              </Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>فحص الاتصال</Text>
          <Pressable
            onPress={onTest}
            disabled={testing}
            style={({ pressed }) => [
              styles.testBtn,
              { backgroundColor: colors.accent, opacity: pressed || testing ? 0.7 : 1 },
            ]}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="pulse-outline" size={18} color="#fff" />
            )}
            <Text style={styles.testBtnText}>{testing ? 'جاري الفحص...' : 'فحص الاتصال بالمزود والموديل'}</Text>
          </Pressable>
          {testResult && (
            <View style={[styles.testResult, { backgroundColor: testResult.ok ? colors.successSurface : colors.errorSurface, borderColor: colors.border }]}>
              <Ionicons name={testResult.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={testResult.ok ? colors.success : colors.error} />
              <Text style={[styles.testResultText, { color: testResult.ok ? colors.success : colors.error }]}>{testResult.message}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={modelPickerOpen} transparent animationType="fade" onRequestClose={() => setModelPickerOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>اختر الموديل</Text>
              <Pressable onPress={() => setModelPickerOpen(false)} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.modelList} keyboardShouldPersistTaps="handled">
              {uniqueModels.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => selectModel(m)}
                  style={[
                    styles.modelOption,
                    { backgroundColor: m === model ? colors.accentSurface : colors.bgCard, borderColor: m === model ? colors.accent : colors.border },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.modelOptionText, { color: m === model ? colors.accent : colors.textPrimary }]}>{m}</Text>
                  {m === model && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                </Pressable>
              ))}
              {uniqueModels.length === 0 && (
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
                    لا توجد موديلات. اضغط «جلب قائمة الموديلات» أو أعد فتح الشاشة.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={visionPickerOpen} transparent animationType="fade" onRequestClose={() => setVisionPickerOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>اختر موديل الرؤية</Text>
              <Pressable onPress={() => setVisionPickerOpen(false)} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.modelList} keyboardShouldPersistTaps="handled">
              {(() => {
                const vDef = providerDefFor(visionProvider, settings?.customProviders ?? [])
                const builtIn = vDef.defaultModels ?? []
                const listed = settings?.modelLists?.[visionProvider] ?? []
                const opts = [visionModel, ...listed, ...builtIn].filter(Boolean)
                const unique = Array.from(new Set(opts))
                if (unique.length === 0) {
                  return (
                    <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                      <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
                        لا توجد موديلات متاحة. عدّ إلى الإعدادات الرئيسية واضغط «جلب قائمة الموديلات» أولاً.
                      </Text>
                    </View>
                  )
                }
                return unique.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setVisionModel(m)
                      setVisionTestResult(null)
                      void save({ visionModel: m })
                      setVisionPickerOpen(false)
                      Haptics.selectionAsync().catch(() => {})
                    }}
                    style={[
                      styles.modelOption,
                      { backgroundColor: m === visionModel ? colors.accentSurface : colors.bgCard, borderColor: m === visionModel ? colors.accent : colors.border },
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.modelOptionText, { color: m === visionModel ? colors.accent : colors.textPrimary }]}>{m}</Text>
                    {m === visionModel && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                  </Pressable>
                ))
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backBtn: { width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  content: { padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.lg, fontFamily: 'Tajawal_700Bold' },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: '28%',
    flexGrow: 1,
  },
  providerDot: { width: 8, height: 8, borderRadius: radius.full },
  providerName: { flex: 1, fontSize: fontSize.xs, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  addProviderCard: { borderStyle: 'dashed' },
  hint: { fontSize: fontSize.xs, marginTop: spacing.xs, fontFamily: 'Tajawal_400Regular' },
  infoCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginTop: spacing.sm },
  infoText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full },
  editBtnText: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  fieldWrap: { gap: 6, marginTop: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  keyInput: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  eyeBtn: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: fontSize.xs, marginTop: 4, fontFamily: 'Tajawal_400Regular' },
  modelField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  modelLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modelName: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold' },
  saveKeyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: radius.full, marginTop: spacing.sm },
  saveKeyBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  fetchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  fetchBtnText: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  modeIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  modeDesc: { fontSize: fontSize.xs, marginTop: 2, fontFamily: 'Tajawal_400Regular' },
  switch: { width: 44, height: 26, borderRadius: radius.full, justifyContent: 'center', padding: 2 },
  switchKnob: { width: 22, height: 22, borderRadius: radius.full },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: radius.full, marginTop: spacing.sm },
  testBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  testResult: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  testResultText: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 18 },
  voiceActiveCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  voiceActiveBody: { flex: 1, gap: 2 },
  voiceGuideList: { gap: spacing.xs },
  voiceGuideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  voiceStatusDot: { width: 8, height: 8, borderRadius: radius.full, marginTop: 6 },
  voiceGuideBody: { flex: 1, gap: 2 },
  voiceGuideTitle: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  voiceGuideModels: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  voiceGuideNote: { fontSize: fontSize.xs, lineHeight: 17, fontFamily: 'Tajawal_400Regular' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  modalCard: { borderRadius: radius.xl, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  closeBtn: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  modelList: { padding: spacing.md, gap: spacing.sm },
  modelOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  modelOptionText: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})