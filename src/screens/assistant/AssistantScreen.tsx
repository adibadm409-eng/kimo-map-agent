import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react'
import {
  View, Text, TextInput, FlatList, StyleSheet, Pressable, Keyboard, Platform, Alert, Dimensions, Modal, ScrollView, ActivityIndicator, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Clipboard from 'expo-clipboard'
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import {
  sendUserMessage,
  answerAsk,
  answerConfirmation,
  cancelAgent,
} from '../../assistant'
import {
  getSettings,
  setSettings,
  activeConfig,
  listSessions,
  createSession,
  deleteSession,
  getMessages,
  getPending,
  type SessionMeta,
  type PendingState,
} from '../../assistant'
import { shareFile, saveToDownloads } from '../../assistant'
import AssistantHistory from './AssistantHistory'
import Markdown from '../../components/ui/Markdown'
import { useChatStore } from './agentChatStore'
import { renderRegistryItem, ContextBanner, ExecutionStatusBar, AuditDrawer, type RegistryCtx } from './registry'
import { useAgentEvents } from './useAgentEvents'

interface AttachItem {
  uri: string
  name: string
  mime?: string
  size?: number
  kind?: 'image' | 'audio' | 'video' | 'document' | 'spreadsheet' | 'text' | 'unknown'
}

interface AudioDraft {
  uri: string
  name: string
  format: 'm4a' | 'webm'
}

export default function AssistantScreen({ navigation }: any) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const store = useChatStore()
  const { items: chatItems, activeContext, statusBar, auditTrail, streamText } = store

  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<AttachItem[]>([])
  const [busy, setBusy] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingState | null>(null)
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [providerLabel, setProviderLabel] = useState('')
  const [model, setModel] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [kbHeight, setKbHeight] = useState(0)
  const [selDel, setSelDel] = useState<number[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [auditFlash, setAuditFlash] = useState(false)
  const listRef = useRef<FlatList>(null)
  const wantedBottom = useRef(false)
  const [atBottom, setAtBottom] = useState(true)
  const [voiceReady, setVoiceReady] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(audioRecorder)

  useEffect(() => {
    return () => {
      setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (ev: any) => {
      const screenY = Math.round(ev?.endCoordinates?.screenY ?? -1)
      const screenH = Math.round(Dimensions.get('window').height)
      const endH = Math.round(ev?.endCoordinates?.height ?? 0)
      const pad = screenY > 0 && screenY < screenH ? screenH - screenY : endH
      setKbHeight(Math.max(0, pad))
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
    })
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const reload = useCallback(async (sid: string) => {
    const msgs = await getMessages(sid).catch(() => [])
    useChatStore.getState().setMessages(msgs)
    const p = await getPending(sid).catch(() => null)
    setPending(p)
    wantedBottom.current = true
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120)
  }, [])

  useFocusEffect(
    useCallback(() => {
      wantedBottom.current = true
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 260)
    }, [sessionId, chatItems.length])
  )

  const loadSessions = useCallback(async () => {
    const list = await listSessions().catch(() => [])
    setSessions(list)
    if (list.length && !list.some((s) => s.id === sessionId)) {
      setSessionId(list[0].id)
      reload(list[0].id)
    }
  }, [sessionId, reload])

  const loadSettings = useCallback(async () => {
    const s = await getSettings().catch(() => null)
    if (s) {
      setMode(s.mode)
      setProviderLabel(providerLabelOf(s))
      setModel(modelOf(s))
      if (!s.models[s.activeProvider]) {
        const config = await activeConfig(s).catch(() => null)
        if (config?.model) setModel(config.model)
      }
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadSettings().catch(() => {})
    }, [loadSettings])
  )

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await listSessions().catch(() => [])
        if (!mounted) return
        setSessions(list)
        let sid = list[0]?.id ?? ''
        if (!sid) sid = await createSession().catch(() => '')
        if (!sid) throw new Error('تعذر إنشاء جلسة محادثة محلية.')
        setSessionId(sid)
        useChatStore.getState().reset()
        await reload(sid)
      } catch (error: any) {
        if (mounted) setActionError(error?.message ?? 'تعذر تحميل جلسة كيمو.')
      } finally {
        if (mounted) setInitializing(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useAgentEvents(sessionId, reload)

  useEffect(() => {
    if (pending?.kind === 'confirmation' && Array.isArray(pending.items)) {
      setSelDel(pending.items.map((_, i) => i))
    } else if (pending?.kind === 'confirmation') {
      setSelDel([])
    }
  }, [pending])

  useEffect(() => {
    if (chatItems.length) {
      wantedBottom.current = true
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    }
  }, [chatItems.length, pending?.kind])

  function providerLabelOf(s: any): string {
    const active = s.activeProvider
    if (active.startsWith('custom:')) {
      const c = (s.customProviders ?? []).find((x: any) => x.id === active.slice(7))
      return c?.name ?? 'مزود مخصص'
    }
    return active
  }

  function modelOf(s: any): string {
    return s.models?.[s.activeProvider] ?? ''
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId
    const id = await createSession()
    setSessionId(id)
    return id
  }

  async function handleSend(text: string, audio?: AudioDraft) {
    const trimmed = text.trim()
    if ((!trimmed && !audio) || busy) return
    const sid = await ensureSession()
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    setInput('')
    const imageUris = attachments.filter((a) => a.kind === 'image' || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(a.uri)).map((a) => a.uri)
    useChatStore.getState().reset()
    useChatStore.getState().setMessages([
      ...(useChatStore.getState().items),
      { id: `local-user-${Date.now()}`, sessionId: sid, role: 'user', kind: 'text', content: audio ? `رسالة صوتية: ${audio.name}` : trimmed || (attachments.length ? `أرسلت ${attachments.length} مرفقات` : ''), createdAt: Date.now(), meta: imageUris.length ? { images: imageUris } : undefined } as any,
    ])
    const atts = attachments.length ? [...attachments] : undefined
    setAttachments([])
    setBusy(true)
    setPending(null)
    try {
      setActionError(null)
      await sendUserMessage(sid, trimmed, atts || audio ? { attachments: atts, audio } : undefined)
    } catch (error: any) {
      setActionError(error?.message ?? 'تعذر تنفيذ الطلب. راجع اتصال مزود الذكاء الاصطناعي أو إعداداته.')
    } finally {
      setBusy(false)
      reload(sid).catch(() => {})
      loadSessions().catch(() => {})
    }
  }

  async function handleChoice(answer: string) {
    setBusy(true)
    try {
      await answerAsk(sessionId, answer)
    } finally {
      setBusy(false)
      reload(sessionId).catch(() => {})
    }
  }

  async function handleConfirm(approve: boolean, selected?: number[]) {
    setBusy(true)
    try {
      await answerConfirmation(sessionId, approve, selected)
    } finally {
      setBusy(false)
      setSelDel([])
      setPending(null)
      reload(sessionId).catch(() => {})
    }
  }

  async function handleCopy(id: string, text: string) {
    try {
      await Clipboard.setStringAsync(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {}
  }

  async function toggleMode() {
    const next = mode === 'read' ? 'edit' : 'read'
    Haptics.selectionAsync().catch(() => {})
    await setSettings({ mode: next })
    setMode(next)
  }

  async function pickFiles() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
      if (res.canceled || !res.assets?.length) return
      const items = res.assets.map((a) => ({
        uri: a.uri,
        name: a.name ?? 'ملف',
        mime: a.mimeType ?? undefined,
        size: a.size ?? undefined,
        kind: /^(xlsx?|csv)$/i.test(a.name ?? '') ? 'spreadsheet' as const : undefined,
      }))
      setAttachments((prev) => [...prev, ...items])
    } catch {}
  }

  async function pickImages() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('الوصول إلى الصور غير متاح', 'اسمح للتطبيق بالوصول إلى الصور ثم أعد المحاولة.')
        return
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
        exif: false,
      })
      if (res.canceled || !res.assets?.length) return
      const items = res.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName ?? `صورة-${Date.now()}.jpg`,
        mime: a.mimeType ?? 'image/jpeg',
        size: a.fileSize ?? undefined,
        kind: 'image' as const,
      }))
      setAttachments((prev) => [...prev, ...items])
    } catch (error: any) {
      Alert.alert('تعذر اختيار الصور', error?.message ?? 'تعذر قراءة الصور من الجهاز.')
    }
  }

  function handleAttach() {
    if (busy || recorderState.isRecording) return
    Alert.alert('إرفاق', 'ماذا تريد إرفاقه؟', [
      { text: 'ملف', onPress: () => pickFiles() },
      { text: 'صورة', onPress: () => pickImages() },
      { text: 'إلغاء', style: 'cancel' },
    ])
  }

  async function handleVoice() {    if (busy) return
    if (!voiceReady) {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync()
        if (!permission.granted) {
          Alert.alert('الميكروفون غير مصرّح', 'اسمح لكيمو باستخدام الميكروفون من إعدادات Android ثم أعد المحاولة.')
          return
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })
        setVoiceReady(true)
      } catch (error: any) {
        setVoiceError(error?.message ?? 'تعذر تهيئة الميكروفون.')
        Alert.alert('تعذر التسجيل', error?.message ?? 'تحقق من إذن الميكروفون ثم أعد المحاولة.')
        return
      }
    }
    try {
      if (recorderState.isRecording) {
        await audioRecorder.stop()
        const uri = audioRecorder.uri
        if (!uri) {
          Alert.alert('تعذر حفظ التسجيل', 'لم يُنتج الجهاز ملفاً صوتياً صالحاً.')
          return
        }
        const format = Platform.OS === 'web' ? 'webm' : 'm4a'
        await handleSend('', { uri, name: `voice-${Date.now()}.${format}`, format })
      } else {
        await audioRecorder.prepareToRecordAsync()
        audioRecorder.record()
      }
    } catch (error: any) {
      setVoiceError(error?.message ?? 'تعذر بدء التسجيل الصوتي.')
      Alert.alert('تعذر التسجيل', error?.message ?? 'تحقق من إذن الميكروفون ثم أعد المحاولة.')
    }
  }

  async function handleNewSession() {
    const id = await createSession()
    setSessionId(id)
    setShowHistory(false)
    useChatStore.getState().reset()
    reload(id).catch(() => {})
    loadSessions().catch(() => {})
  }

  async function handleDeleteSession(sid: string) {
    Alert.alert('حذف المحادثة', 'سيتم حذف هذه المحادثة نهائياً. هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deleteSession(sid).catch(() => {})
          if (sid === sessionId) {
            const list = await listSessions().catch(() => [])
            const next = list[0]?.id ?? ''
            setSessionId(next)
            if (next) { useChatStore.getState().reset(); reload(next).catch(() => {}) }
            else { useChatStore.getState().reset() }
          }
          loadSessions().catch(() => {})
        },
      },
    ])
  }

  function selectSession(sid: string) {
    setSessionId(sid)
    setShowHistory(false)
    useChatStore.getState().reset()
    reload(sid).catch(() => {})
  }

  function openLinkCard(link: { kind: string; id: string; label?: string }) {
    const { kind, id } = link
    const paramsMap: Record<string, any> = {
      workspace: { workspaceId: id },
      project: { projectId: id },
      block: { blockId: id },
      plot: { plotId: id },
      client: { id },
      property: { id },
    }
    const screenMap: Record<string, string> = {
      workspace: 'WorkspaceDetail',
      project: 'ProjectDetail',
      block: 'BlockDetail',
      plot: 'PlotDetail',
      client: 'ClientDetail',
      property: 'PropertyDetail',
    }
    const stack = kind === 'client' ? 'ClientsStack' : kind === 'property' ? 'PropertiesStack' : 'ProjectsStack'
    const params = paramsMap[kind]
    if (!params || !screenMap[kind]) return
    navigation.navigate(stack, { screen: screenMap[kind], params })
  }

  const configured = !!(providerLabel && model)

  // إخفاء confirmation المعروض عبر الـ modal (الحذف) لتفادي الازدواجية
  const pendingDelete = pending?.kind === 'confirmation' && Array.isArray(pending.items) && pending.items.length > 0
  const visibleItems = useMemo(() => chatItems.filter((i) => !(i.uiComponent === 'confirm_card' && pendingDelete)), [chatItems, pendingDelete])

  const ctx: RegistryCtx = {
    colors,
    busy,
    copiedId,
    onCopy: handleCopy,
    onChoice: handleChoice,
    onConfirm: handleConfirm,
    onOpenLink: openLinkCard,
    onFileDownload: async (uri, name) => {
      const res = await saveToDownloads(uri, name)
      if (res.ok) Alert.alert('تم التحميل', `تم حفظ الملف "${res.savedName}" في جهازك بنجاح.`)
    },
    onFileShare: (uri, name) => { shareFile(uri, name).catch(() => {}) },
  }

  useEffect(() => {
    if (auditTrail.length) {
      setAuditFlash(true)
      const t = setTimeout(() => setAuditFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [auditTrail.length])

  const { setRight } = React.useContext(HeaderCtx)

  useEffect(() => {
    setRight(
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="فتح سجل محادثات كيمو"
          onPress={() => setShowHistory(true)}
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: mode === 'edit' }}
          accessibilityLabel={mode === 'edit' ? 'إيقاف وضع التعديل' : 'تفعيل وضع التعديل'}
          onPress={toggleMode}
          style={[styles.modeChip, { backgroundColor: mode === 'edit' ? colors.successSurface : colors.surface }]}
        >
          <Ionicons name={mode === 'edit' ? 'create-outline' : 'eye-outline'} size={13} color={mode === 'edit' ? colors.success : colors.textSecondary} />
          <Text style={[styles.modeChipText, { color: mode === 'edit' ? colors.success : colors.textSecondary }]}>
            {mode === 'edit' ? 'تعديل' : 'قراءة'}
          </Text>
        </Pressable>
        {!configured ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="فتح إعدادات مزود كيمو"
            onPress={() => navigation.navigate('AgentSettings')}
            style={[styles.setupChip, { backgroundColor: colors.warningSurface }]}
          >
            <Text style={[styles.modeChipText, { color: colors.warning }]}>الإعداد</Text>
          </Pressable>
        ) : null}
      </View>,
    )
    return () => setRight(null)
  }, [setRight, mode, configured, colors, navigation, setShowHistory, toggleMode])

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ContextBanner context={activeContext} phase={statusBar.phase} colors={colors} />
      <ExecutionStatusBar statusBar={statusBar} colors={colors} />

      {actionError ? (
        <View style={[styles.errorCard, { backgroundColor: colors.errorSurface, borderColor: colors.error }]} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={17} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{actionError}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق رسالة الخطأ" onPress={() => setActionError(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.error} />
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={visibleItems}
        keyExtractor={(m) => m.id}
        renderItem={({ item }: any) => renderRegistryItem(item, ctx)}
        contentContainerStyle={styles.listContent}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!wantedBottom.current) return
          listRef.current?.scrollToEnd({ animated: false })
        }}
        onScroll={(e) => {
          const ns = e.nativeEvent
          const h = ns.contentSize?.height ?? 0
          let nearBottom = true
          if (h > 0) {
            nearBottom = ns.contentOffset.y >= h - ns.layoutMeasurement.height - 60
            if (nearBottom) wantedBottom.current = false
          }
          if (nearBottom !== atBottom) setAtBottom(nearBottom)
        }}
        onScrollEndDrag={(e) => {
          const ns = e.nativeEvent
          if ((ns.contentSize?.height ?? 0) > 0 && ns.contentOffset.y < ns.contentSize.height - ns.layoutMeasurement.height - 60) {
            wantedBottom.current = false
          }
        }}
        onMomentumScrollEnd={(e) => {
          const ns = e.nativeEvent
          if ((ns.contentSize?.height ?? 0) > 0 && ns.contentOffset.y < ns.contentSize.height - ns.layoutMeasurement.height - 60) {
            wantedBottom.current = false
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {initializing ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="sparkles-outline" size={34} color={colors.textMuted} />}
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{initializing ? 'جارٍ فتح مساحة كيمو…' : 'مساحة عمل المساعد'}</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {initializing ? 'يتم تحميل المحادثات المحلية دون إرسال بياناتك إلى السحابة.' : 'اسأل عن بياناتك، أنشئ مشروعاً من الصفر، نظّم مشروعك بجدول حر، أو ارفع ملفات (Excel/CSV) ليقرأها الوكيل ويحوّل المنظم منها إلى مشروع، والبقية يستخرج منها ما يلزم.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          busy && streamText ? (
            <View style={styles.assistantPlain}>
              <Markdown content={streamText} streamEnded={false} />
            </View>
          ) : null
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="سجل تنفيذ كيمو"
        onPress={() => setShowAudit(true)}
        style={({ pressed }) => [styles.auditFab, { backgroundColor: auditFlash ? colors.accent : colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="list-outline" size={18} color={auditFlash ? '#fff' : colors.accent} />
      </Pressable>

      <View style={[styles.inputArea, { paddingBottom: kbHeight > 0 ? kbHeight + 4 : 0, backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
        {!atBottom && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="الانتقال إلى آخر رسالة"
            onPress={() => {
              wantedBottom.current = true
              listRef.current?.scrollToEnd({ animated: true })
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.downBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="arrow-down" size={20} color={colors.accent} />
          </Pressable>
        )}
        {attachments.length > 0 && (
          <View style={styles.attWrap}>
            {attachments.map((a, i) => (
              <View key={i} style={[styles.attChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="attach" size={12} color={colors.textSecondary} />
                <Text numberOfLines={1} style={[styles.attName, { color: colors.textSecondary }]}>{a.name}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`إزالة المرفق ${a.name}`} onPress={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                  <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {recorderState.isRecording && (
          <View style={[styles.recordingBanner, { backgroundColor: colors.errorSurface, borderColor: colors.error }]}>
            <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
            <Text style={[styles.recordingText, { color: colors.error }]}>جاري التسجيل… اضغط الميكروفون للإيقاف والإرسال</Text>
          </View>
        )}
        <View style={styles.inputRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="إرفاق ملف أو صورة" onPress={handleAttach} disabled={busy || recorderState.isRecording} style={[styles.attachBtn, { backgroundColor: colors.surface, opacity: busy || recorderState.isRecording ? 0.4 : 1 }]}>
            <Ionicons name="attach-outline" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recorderState.isRecording ? 'إيقاف التسجيل وإرساله' : 'بدء الإدخال الصوتي'}
            onPress={handleVoice}
            disabled={busy}
            style={[styles.voiceBtn, { backgroundColor: recorderState.isRecording ? colors.errorSurface : colors.surface, borderColor: recorderState.isRecording ? colors.error : colors.border, borderWidth: 1, opacity: busy ? 0.4 : 1 }]}
          >
            <Ionicons name={recorderState.isRecording ? 'stop' : 'mic-outline'} size={19} color={recorderState.isRecording ? colors.error : colors.textSecondary} />
          </Pressable>
          <TextInput
            accessibilityLabel={pending?.kind === 'ask_user' ? 'إجابة سؤال كيمو' : 'رسالة إلى كيمو'}
            accessibilityHint="اكتب رسالتك ثم اضغط إرسال"
            value={input}
            onChangeText={setInput}
            onBlur={() => setKbHeight(0)}
            placeholder={pending?.kind === 'ask_user' ? 'أجب على سؤال المساعد...' : 'اكتب للمساعد...'}
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!busy}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? 'إيقاف تنفيذ كيمو' : 'إرسال الرسالة إلى كيمو'}
            disabled={!busy && !input.trim() && !attachments.length}
            onPress={busy ? () => cancelAgent(sessionId) : () => handleSend(input)}
            style={[styles.sendBtn, { backgroundColor: busy ? colors.error : colors.accent, opacity: !busy && !input.trim() && !attachments.length ? 0.4 : 1 }]}
          >
            <Ionicons name={busy ? 'stop' : 'arrow-up'} size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={!!pending && pending.kind === 'confirmation' && Array.isArray(pending.items) && !busy}
        transparent
        animationType="fade"
        onRequestClose={() => handleConfirm(false)}
      >
        {pending && pending.items ? (
          <View style={styles.modalOverlay}>
            <View style={[styles.confirmModal, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.askHead}>
                <Ionicons name="warning" size={20} color={colors.error} />
                <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>{pending.title ?? 'تأكيد الحذف'}</Text>
              </View>
              <Text style={[styles.confirmIntro, { color: colors.textSecondary }]} numberOfLines={2}>
                {pending.question}
              </Text>
              <ScrollView
                style={styles.delList}
                contentContainerStyle={styles.delListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {pending.items.map((it, i) => {
                  const checked = selDel.includes(i)
                  return (
                    <Pressable
                      key={`${it.tool}-${i}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={it.preview}
                      onPress={() =>
                        setSelDel((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
                      }
                      style={[styles.delItem, { backgroundColor: colors.surface, borderColor: checked ? colors.error : colors.border }]}
                    >
                      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? colors.error : colors.textMuted} />
                      <Text style={[styles.delItemText, { color: colors.textPrimary }]}>{it.preview}</Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
              <View style={styles.confirmBtns}>
                <Pressable
                  disabled={!selDel.length}
                  onPress={() => handleConfirm(true, selDel)}
                  style={[styles.confirmBtn, { backgroundColor: colors.error, opacity: selDel.length ? 1 : 0.4 }]}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.confirmBtnText}>حذف المحدد ({selDel.length})</Text>
                </Pressable>
                <Pressable onPress={() => handleConfirm(false)} style={[styles.confirmBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                  <Ionicons name="close" size={16} color={colors.textSecondary} />
                  <Text style={[styles.confirmBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>

      <AuditDrawer
        visible={showAudit}
        onClose={() => setShowAudit(false)}
        trail={auditTrail}
        colors={colors}
      />

      <AssistantHistory
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        sessions={sessions}
        activeId={sessionId}
        onSelect={selectSession}
        onDelete={handleDeleteSession}
        onNew={handleNewSession}
        onOpenSettings={() => {
          setShowHistory(false)
          navigation.navigate('AgentSettings')
        }}
        onRefresh={loadSessions}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  headerSub: { fontSize: fontSize.xs, marginTop: 2, fontFamily: 'Tajawal_400Regular' },
  iconBtn: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginStart: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  modeChipText: { fontSize: fontSize.xs, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  setupChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  listContent: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 24, fontFamily: 'Tajawal_400Regular' },
  assistantPlain: { flex: 1, paddingVertical: 4, paddingHorizontal: spacing.lg },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginVertical: 2, marginHorizontal: spacing.lg },
  errorText: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  inputArea: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: 4 },
  downBtn: {
    position: 'absolute', top: -56, left: spacing.lg,
    width: 42, height: 42, borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    zIndex: 30,
  },
  attWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  attChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 200 },
  attName: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', flexShrink: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  voiceBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  recordingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, marginBottom: spacing.sm },
  recordingDot: { width: 8, height: 8, borderRadius: radius.full },
  recordingText: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', maxHeight: 110 },
  sendBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  auditFab: {
    position: 'absolute', bottom: 76, right: spacing.lg,
    width: 42, height: 42, borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    zIndex: 25,
  },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  confirmIntro: { fontSize: fontSize.sm, lineHeight: 20, fontFamily: 'Tajawal_400Regular' },
  delList: { flexGrow: 0, flexShrink: 1, gap: spacing.sm },
  delListContent: { gap: spacing.sm, paddingBottom: 4 },
  delItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  delItemText: { flex: 1, fontSize: fontSize.md, lineHeight: 22, fontFamily: 'Tajawal_400Regular' },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full },
  confirmBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  confirmModal: { width: '100%', maxWidth: 460, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, maxHeight: '85%' },
})
