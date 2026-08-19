import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, StyleSheet, Pressable, Keyboard, Platform, Alert, Dimensions, Modal, ScrollView, ActivityIndicator,
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
  subscribeAgent,
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
  type Message,
  type SessionMeta,
  type PendingState,
} from '../../assistant'
import { shareFile, saveToDownloads } from '../../assistant'
import AssistantHistory from './AssistantHistory'
import Markdown from '../../components/ui/Markdown'
import { TOOL_ARABIC, stepCardTitle, stepCardDetail, stepCardResult, linkCardLabel } from '../../assistant/toolLabels'
import type { AgentDecision, AgentPhase, AgentPlan, AgentSkill, VisibleAgentEvent } from '../../assistant/agentContract'
import { restoreRuntimeEvents } from '../../assistant/runtimeEvents'

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
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
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
  const [streamText, setStreamText] = useState('')
  const [askText, setAskText] = useState('')
  const [kbHeight, setKbHeight] = useState(0)
  const [selDel, setSelDel] = useState<number[]>([])
  const [thinking, setThinking] = useState(false)
  const [liveProgress, setLiveProgress] = useState<string[]>([])
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('understand')
  const [agentPlan, setAgentPlan] = useState<AgentPlan | null>(null)
  const [activeSkill, setActiveSkill] = useState<Pick<AgentSkill, 'id' | 'label' | 'description'> | null>(null)
  const [agentDecisions, setAgentDecisions] = useState<AgentDecision[]>([])
  const [agentObservations, setAgentObservations] = useState<VisibleAgentEvent[]>([])
  const [agentPanelCollapsed, setAgentPanelCollapsed] = useState(true)
  const [liveSteps, setLiveSteps] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const listRef = useRef<FlatList>(null)
  /** طلب «انزل لأسفل» نشط: يُعاد التمرير عند كل تغيّر حجم للمحتوى حتى الالتحام
      الفعلي بالقاع — لأن FlatList افتراضية: حجم المحتوى وقت التمرير جزئي
      (الخلايا غير المركّبة بلا ارتفاع) فينزل التمرير عند آخر خلية مركّبة ≈ المنتصف،
      ثم تكبر القائمة وتحتاج التكرار حتى تكتمل. يُلغى عند بلوغ القاع فعلاً أو
      توقف إصبع المستخدم فوق النهاية. */
  const wantedBottom = useRef(false)
  /** هل المستخدم في نهاية المحادثة فعلاً؟ يتحكم بإظهار زر النزول فوق زر الإرسال */
  const [atBottom, setAtBottom] = useState(true)
  const [voiceReady, setVoiceReady] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(audioRecorder)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync()
        if (!permission.granted) {
          if (mounted) setVoiceError('لم يُسمح لكيمو باستخدام الميكروفون. يمكنك تفعيل الإذن من إعدادات Android.')
          return
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })
        if (mounted) setVoiceReady(true)
      } catch (error: any) {
        if (mounted) setVoiceError(error?.message ?? 'تعذر تهيئة الميكروفون.')
      }
    })()
    return () => {
      mounted = false
      setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (ev: any) => {
      // حساب المسافة الفعلية التي يغطيها الكيبورد: يعمل في وضعي adjustResize و adjustPan دون مضاعفة
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
    setMessages(msgs)
    const p = await getPending(sid).catch(() => null)
    setPending(p)
    const runtimeEvents = await restoreRuntimeEvents(sid).catch(() => [])
    const lastPlan = runtimeEvents.filter((event) => event.type === 'plan').pop()
    const lastSkill = runtimeEvents.filter((event) => event.type === 'skill').pop()
    const decisions = runtimeEvents.filter((event) => event.type === 'decision').slice(-4).map((event) => (event as Extract<VisibleAgentEvent, { type: 'decision' }>).decision)
    const observations = runtimeEvents.filter((event) => event.type === 'observation' || event.type === 'recovery').slice(-3)
    const lastPhase = runtimeEvents.filter((event): event is Extract<VisibleAgentEvent, { type: 'phase' }> => event.type === 'phase').pop()
    setAgentPlan(lastPlan && lastPlan.type === 'plan' ? lastPlan.plan : null)
    setActiveSkill(lastSkill && lastSkill.type === 'skill' ? lastSkill.skill : null)
    setAgentDecisions(decisions)
    setAgentObservations(observations)
    if (lastPhase) setAgentPhase((lastPhase as Extract<VisibleAgentEvent, { type: 'phase' }>).phase)
    // عند فتح أي محادثة (بما فيها العودة بعد إغلاق التطبيق) نمرّر لأسفل المحادثة
    // وليس لمنتصفها، ثم نعيد التمرير بعد اكتمال الترسيم الأول.
    // والطلب يُسجَّل في wantedBottom لضمان التنفيذ عند أول ظهور فعلي للمحتوى.
    wantedBottom.current = true
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120)
  }, [])

  useFocusEffect(
    useCallback(() => {
      wantedBottom.current = true
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 260)
    }, [sessionId, messages.length])
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

  useEffect(() => {
    const unsub = subscribeAgent((e) => {
      if (e.sessionId !== sessionId) return
      if (e.type === 'phase') {
        setAgentPhase(e.phase)
        return
      }
      if (e.type === 'plan') {
        setAgentPlan(e.plan)
        // الخطة الجديدة تُظهر عنوانها فقط؛ يقرر المستخدم فتح التفاصيل.
        setAgentPanelCollapsed(true)
        return
      }
      if (e.type === 'plan_step') {
        setAgentPlan((current) => current ? ({ ...current, steps: current.steps.map((step) => step.id === e.step.id ? e.step : step), currentStepId: e.step.status === 'active' ? e.step.id : current.currentStepId, updatedAt: Date.now() }) : current)
        return
      }
      if (e.type === 'skill') {
        setActiveSkill(e.skill)
        return
      }
      if (e.type === 'decision') {
        setAgentDecisions((prev) => [...prev.slice(-4), e.decision])
        return
      }
      if (e.type === 'observation' || e.type === 'recovery') {
        setAgentObservations((prev) => [...prev.slice(-3), e])
        return
      }
      if (e.type === 'stream') {
        if (e.done) setStreamText('')
        else setStreamText(e.content ?? '')
        return
      }
      if (e.type === 'progress') {
        // نشاط الوكيل (تفكيره/تخطيطه) يبث لحظياً: يظهر فوراً في القائمة
        setLiveProgress((prev) => [...prev, e.text])
        return
      }
      if (e.type === 'tool') {
        // خطوة تنفيذ فعلية (نداء أداة بنتيجتها): تُراكم لحظياً لتُظهر ما يفعله الوكيل الآن
        setLiveSteps((prev) => [...prev, formatStep((e as any).name, (e as any).args, (e as any).result)])
        return
      }
      if (e.type === 'text') {
        setLiveProgress([])
        return
      }
      if (e.type === 'thinking') {
        setThinking(true)
        return
      }
      if (e.type === 'error') {
        setThinking(false)
        setStreamText('')
        setAgentPhase('error')
        setActionError(e.message)
        reload(sessionId).catch(() => {})
        return
      }
      if (e.type === 'done') {
        const outcome = e.outcome ?? 'completed'
        setThinking(false)
        setStreamText('')
        setLiveProgress([])
        setLiveSteps([])
        if (outcome === 'completed') {
          setActionError(null)
          setAgentPhase('complete')
        } else if (outcome === 'paused' || outcome === 'cancelled') {
          setActionError(null)
          setAgentPhase('paused')
        } else {
          setActionError('توقفت المهمة قبل إثبات اكتمالها. راجع آخر نتيجة أو أرسل متابعة لإعادة التحقق.')
          setAgentPhase('error')
        }
        reload(sessionId).catch(() => {})
        return
      }
      reload(sessionId).catch(() => {})
    }, sessionId)
    return unsub
  }, [sessionId, reload])

  useEffect(() => {
    if (pending?.kind === 'confirmation' && Array.isArray(pending.items)) {
      setSelDel(pending.items.map((_, i) => i))
    } else if (pending?.kind === 'confirmation') {
      setSelDel([])
    }
  }, [pending])

  useEffect(() => {
    if (messages.length) {
      wantedBottom.current = true
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    }
  }, [messages.length, pending?.kind])

  function providerLabelOf(s: any): string {
    const active = s.activeProvider
    if (active.startsWith('custom:')) {
      const c = (s.customProviders ?? []).find((x: any) => x.id === active.slice(7))
      return c?.name ?? 'مزود مخصص'
    }
    return active
  }

  // يصف خطوة التنفيذ بأسلوب بشري بلا معرفات/أسماء جداوTechniques: اسم الأداة مدرج في toolLabels
  function formatStep(name: string, args: any, result: any): string {
    const label = (TOOL_ARABIC as Record<string, string>)[name] ?? name
    let detail = ''
    const a = (args && typeof args === 'object') ? args : {}
    if (name === 'create' && a.entity) detail = ` على ${a.entity}`
    else if (name === 'update' && a.entity) detail = ` ${String(a.entity)}`
    else if (name === 'delete' && a.entity) detail = ` حذف ${a.entity}`
    else if (name === 'query') detail = a.entity ? ` على ${a.entity}` : ''
    else if (name === 'generate_file' && a.format) detail = ` (${a.format})`
    else if (name === 'workspace_create' && a.name) detail = `: ${a.name}`
    else if (name === 'workspace_add_table' && a.name) detail = `: ${a.name}`
    else if (name === 'import_project_file' && a.name) detail = `: ${a.name}`
    const outcome = !result || typeof result === 'string' && result.trim() === 'محظور في وضع القراءة فقط'
      ? ''
      : ' ✓'
    return `خطوة: ${label}${detail}${outcome}`
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
    setAskText('')
    const imageUris = attachments.filter((a) => a.kind === 'image' || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(a.uri)).map((a) => a.uri)
    // أظهر رسالة المستخدم محلياً فوراً حتى لا تختفي لحظة كتحضير الإرسال
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, sessionId: sid, role: 'user', kind: 'text', content: audio ? `رسالة صوتية: ${audio.name}` : trimmed || (attachments.length ? `أرسلت ${attachments.length} مرفقات` : ''), createdAt: Date.now(), meta: imageUris.length ? { images: imageUris } : undefined },
    ])
    const atts = attachments.length ? [...attachments] : undefined
    setAttachments([])
    setBusy(true)
    setPending(null)
    setThinking(true)
    setStreamText('')
    setLiveProgress([])
    setAgentPhase('understand')
    setAgentPlan(null)
    setActiveSkill(null)
    setAgentDecisions([])
    setAgentObservations([])
    try {
      setActionError(null)
      await sendUserMessage(sid, trimmed, atts || audio ? { attachments: atts, audio } : undefined)
    } catch (error: any) {
      setActionError(error?.message ?? 'تعذر تنفيذ الطلب. راجع اتصال مزود الذكاء الاصطناعي أو إعداداته.')
    } finally {
      setBusy(false)
      setThinking(false)
      setStreamText('')
      setLiveProgress([])
      reload(sid).catch(() => {})
      loadSessions().catch(() => {})
    }
  }

  async function handleChoice(answer: string) {
    setBusy(true)
    setThinking(true)
    setStreamText('')
    setLiveProgress([])
    try {
      await answerAsk(sessionId, answer)
    } finally {
      setBusy(false)
      setThinking(false)
      setStreamText('')
      setLiveProgress([])
      reload(sessionId).catch(() => {})
    }
  }

  async function handleConfirm(approve: boolean, selected?: number[]) {
    setBusy(true)
    setThinking(true)
    setStreamText('')
    setLiveProgress([])
    try {
      await answerConfirmation(sessionId, approve, selected)
    } finally {
      setBusy(false)
      setThinking(false)
      setStreamText('')
      setLiveProgress([])
      setSelDel([])
      reload(sessionId).catch(() => {})
    }
    setPending(null)
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

  async function handleVoice() {
    if (busy) return
    if (!voiceReady) {
      Alert.alert('الميكروفون غير جاهز', voiceError ?? 'اسمح بالوصول إلى الميكروفون ثم أعد المحاولة.')
      return
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
            if (next) reload(next).catch(() => {})
            else setMessages([])
          }
          loadSessions().catch(() => {})
        },
      },
    ])
  }

  function selectSession(sid: string) {
    setSessionId(sid)
    setShowHistory(false)
    reload(sid).catch(() => {})
  }

  const configured = !!(providerLabel && model)

  const visibleMessages = useMemo(() => {
    // إخفاء رسائل tool_call الأبتر (بدون ملاحظة tool تابعة) حتى لا تظهر بطاقات معلقة
    // وأيضا عرض كل tool_call له ملاحظة لاحقة (إذ يمثّل خطوة "running" تُعقبها "done")
    // كما نخفي confirmation المعروض عبر الـ modal (الحذف) لتفادي الازدواجية
    const pendingDelete = pending?.kind === 'confirmation' && Array.isArray(pending.items) && pending.items.length > 0
    return messages.filter((m) => {
      if (m.kind === 'tool') return false
      if (m.kind === 'tool_call') {
        const hasToolMeta = m.meta?.tool_calls?.[0]
        return !!hasToolMeta
      }
      if (m.kind === 'confirmation' && pendingDelete) return false
      return true
    })
  }, [messages, pending])

  interface StepCardData {
    tool: string
    args: Record<string, any>
    result: any
    ok: boolean
  }
  // دمج نداء الأداة بنتيجته في بطاقة واحدة دائمة (أثر مرئي لكل خطوة نُفذت):
  // تُبنى من الرسائل المحفوظة فلا تختفي بعد انتهاء الوكيل بل تبقى في سجل المحادثة.
  const stepCards = useMemo(() => {
    const map = new Map<string, StepCardData>()
    for (const m of messages) {
      if (m.kind !== 'tool' || !m.meta?.tool_call_id) continue
      const callId = String(m.meta.tool_call_id)
      const name = String(m.meta?.name ?? 'execute')
      const args = m.meta?.args && typeof m.meta.args === 'object' ? (m.meta.args as Record<string, any>) : {}
      map.set(callId, {
        tool: name,
        args,
        result: m.meta?.observation ?? m.meta?.result ?? '',
        ok: m.meta?.ok !== false,
      })
    }
    return map
  }, [messages])

  function safeParseArgs(raw: string): Record<string, any> {
    try {
      const p = JSON.parse(raw)
      return p && typeof p === 'object' ? p : {}
    } catch {
      return {}
    }
  }

  function stepIcon(tool: string): string {
    if (tool === 'create' || tool === 'workspace_create' || tool === 'workspace_create_full_table') return 'add-circle-outline'
    if (tool === 'update' || tool === 'workspace_update' || tool === 'workspace_update_row') return 'create-outline'
    if (tool === 'delete' || tool.startsWith('workspace_delete') || tool === 'remove_attachment') return 'trash-outline'
    if (tool === 'query' || tool === 'search_everything' || tool === 'search_sessions' || tool === 'get') return 'search-outline'
    if (tool === 'import_project_file' || tool === 'read_uploaded_file') return 'document-outline'
    if (tool === 'generate_file') return 'document-text-outline'
    if (tool === 'undo_last') return 'arrow-undo-outline'
    if (tool === 'custom_field_set') return 'pricetag-outline'
    if (tool.startsWith('workspace')) return 'grid-outline'
    return 'git-commit-outline'
  }

  function renderStepCard(callId: string, toolName: string, rawArgs: any) {
    const done = stepCards.get(callId)
    const tool = done ? done.tool : String(toolName ?? 'execute')
    const args = done ? done.args : (rawArgs && typeof rawArgs === 'object' ? rawArgs : {})
    const resultText = done ? stepCardResult(tool, done.result) : ''
    const statusColor = !done ? colors.textMuted : done.ok ? colors.success : colors.error
    const statusLabel = !done ? '…' : done.ok ? '✓' : '✗'
    const detail = stepCardDetail(tool, args)
    return (
      <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.stepIcon, { backgroundColor: colors.accentSurface }]}>
          <Ionicons name={stepIcon(tool) as any} size={13} color={colors.accent} />
        </View>
        <View style={styles.stepBody}>
          <View style={styles.stepTitleRow}>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {stepCardTitle(tool, args)}
              {detail ? <Text style={{ color: colors.textMuted }}> {detail}</Text> : null}
            </Text>
          </View>
          {!!resultText && (
            <Text style={[styles.stepResult, { color: statusColor }]} numberOfLines={2}>
              <Text style={{ color: statusColor }}>{statusLabel} </Text>
              {resultText}
            </Text>
          )}
        </View>
      </View>
    )
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

  function phaseLabel(phase: AgentPhase): string {
    const labels: Record<AgentPhase, string> = {
      understand: 'أفهم طلبك', plan: 'أبني الخطة', ask: 'أحتاج قرارك', execute: 'أنفذ الآن', verify: 'أراجع النتيجة', recover: 'أعالج تعثراً', complete: 'اكتملت المهمة', paused: 'متوقف مؤقتاً', error: 'تحتاج المهمة إلى معالجة',
    }
    return labels[phase]
  }

  function phaseIcon(phase: AgentPhase): string {
    if (phase === 'understand') return 'sparkles-outline'
    if (phase === 'plan') return 'map-outline'
    if (phase === 'ask') return 'help-circle-outline'
    if (phase === 'execute') return 'play-circle-outline'
    if (phase === 'verify') return 'shield-checkmark-outline'
    if (phase === 'recover') return 'refresh-outline'
    if (phase === 'complete') return 'checkmark-circle-outline'
    if (phase === 'error') return 'alert-circle-outline'
    return 'pause-circle-outline'
  }

  function planStepIcon(status: string): string {
    if (status === 'done') return 'checkmark-circle'
    if (status === 'active') return 'radio-button-on'
    if (status === 'blocked') return 'alert-circle'
    return 'ellipse-outline'
  }

  function renderAgentPanel() {
    // لا نعرض حالة قديمة محفوظة بعد انتهاء الرد، ولا نسمح لقرار/ملاحظة
    // تاريخية وحدها باحتلال مساحة المحادثة. البطاقة ملك لدورة تنفيذ حية
    // أو لخطة أنشأها الوكيل وما زالت غير مكتملة.
    const activePlan = agentPlan && !['complete', 'cancelled'].includes(agentPlan.status) ? agentPlan : null
    const visible = busy || thinking || !!pending || !!activePlan || liveProgress.length > 0 || liveSteps.length > 0
    if (!visible) return null
    const currentStep = activePlan?.steps.find((step) => step.id === activePlan.currentStepId)
    const lastDecision = agentDecisions[agentDecisions.length - 1]
    const lastObservation = agentObservations[agentObservations.length - 1]
    const lastObservationDetail = lastObservation && 'detail' in lastObservation ? lastObservation.detail : ''
    return (
      <View style={[styles.agentPanel, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={agentPanelCollapsed ? 'توسيع لوحة مهام كيمو' : 'طي لوحة مهام كيمو'}
          accessibilityState={{ expanded: !agentPanelCollapsed }}
          onPress={() => setAgentPanelCollapsed((value) => !value)}
          style={styles.agentPanelHeader}
        >
          <View style={styles.agentIdentity}>
            <View style={[styles.agentAvatar, { backgroundColor: colors.accent }]}><Ionicons name="sparkles" size={15} color="#fff" /></View>
            <View style={styles.agentPanelTitleWrap}>
              <Text style={[styles.agentPanelTitle, { color: colors.textPrimary }]}>كيمو يعمل معك</Text>
              <Text style={[styles.agentPanelSub, { color: colors.textMuted }]}>{phaseLabel(agentPhase)}{currentStep ? ` · ${currentStep.title}` : ''}</Text>
            </View>
          </View>
          <View style={styles.panelHeaderActions}>
            <View style={[styles.phaseChip, { backgroundColor: agentPhase === 'error' ? colors.errorSurface : agentPhase === 'complete' ? colors.successSurface : colors.accentSurface }]}>
            <Ionicons name={phaseIcon(agentPhase) as any} size={13} color={agentPhase === 'error' ? colors.error : agentPhase === 'complete' ? colors.success : colors.accent} />
              <Text style={[styles.phaseChipText, { color: agentPhase === 'error' ? colors.error : agentPhase === 'complete' ? colors.success : colors.accent }]}>{phaseLabel(agentPhase)}</Text>
            </View>
            <Ionicons name={agentPanelCollapsed ? 'chevron-down' : 'chevron-up'} size={17} color={colors.textMuted} />
          </View>
        </Pressable>
        {!agentPanelCollapsed && activeSkill ? (
          <View style={[styles.skillRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="construct-outline" size={15} color={colors.accent} />
            <View style={styles.skillBody}>
              <Text style={[styles.skillLabel, { color: colors.textPrimary }]}>{activeSkill.label}</Text>
              <Text style={[styles.skillDescription, { color: colors.textMuted }]} numberOfLines={1}>{activeSkill.description}</Text>
            </View>
          </View>
        ) : null}
        {!agentPanelCollapsed && activePlan ? (
          <View style={styles.planWrap}>
            <View style={styles.planTitleRow}>
              <Text style={[styles.planTitle, { color: colors.textPrimary }]}>{activePlan.goal}</Text>
              <Text style={[styles.planCount, { color: colors.textMuted }]}>{activePlan.steps.filter((s) => s.status === 'done').length}/{activePlan.steps.length}</Text>
            </View>
            <View style={styles.planSteps}>
              {activePlan.steps.map((step) => (
                <View key={step.id} style={styles.planStepRow}>
                  <Ionicons name={planStepIcon(step.status) as any} size={15} color={step.status === 'done' ? colors.success : step.status === 'blocked' ? colors.error : step.status === 'active' ? colors.accent : colors.textMuted} />
                  <Text style={[styles.planStepText, { color: step.status === 'active' ? colors.textPrimary : colors.textSecondary, fontFamily: step.status === 'active' ? 'Tajawal_700Bold' : 'Tajawal_400Regular' }]} numberOfLines={1}>{step.title}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {!agentPanelCollapsed && lastDecision ? (
          <View style={[styles.decisionRow, { backgroundColor: lastDecision.kind === 'question' ? colors.warningSurface : colors.surface, borderColor: colors.border }]}>
            <Ionicons name={lastDecision.kind === 'question' ? 'help-circle-outline' : 'git-branch-outline'} size={15} color={lastDecision.kind === 'question' ? colors.warning : colors.accent} />
            <View style={styles.skillBody}><Text style={[styles.decisionTitle, { color: colors.textPrimary }]}>{lastDecision.title}</Text><Text style={[styles.skillDescription, { color: colors.textSecondary }]} numberOfLines={2}>{lastDecision.detail}</Text></View>
          </View>
        ) : null}
        {!agentPanelCollapsed && lastObservation ? (
          <View style={styles.observationRow}>
            <Ionicons name={lastObservation.type === 'recovery' ? 'refresh-outline' : 'information-circle-outline'} size={14} color={lastObservation.type === 'recovery' ? colors.warning : colors.textMuted} />
            <Text style={[styles.observationText, { color: colors.textMuted }]} numberOfLines={2}>{lastObservationDetail}</Text>
          </View>
        ) : null}
      </View>
    )
  }

  function renderLinkCard(link: { kind: string; id: string; label?: string }) {
    const label = linkCardLabel(link.kind)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`فتح ${label}`}
        onPress={() => openLinkCard(link)}
        style={({ pressed }) => [
          styles.linkCard,
          { backgroundColor: colors.successSurface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={[styles.stepIcon, { backgroundColor: colors.success + '18' }]}>
          <Ionicons name="open-outline" size={14} color={colors.success} />
        </View>
        <View style={styles.stepBody}>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {label}
            {link.label ? ` — ${link.label}` : ''}
          </Text>
          <Text style={[styles.stepResult, { color: colors.textMuted }]}>اضغط للانتقال إلى مكان البيانات ومراجعتها</Text>
        </View>
        <Ionicons name="chevron-back" size={16} color={colors.success} />
      </Pressable>
    )
  }

  const renderMessage = ({ item }: { item: Message }) => {
    if (item.kind === 'tool_call') {
      // عند طي لوحة المحرك تبقى المحادثة نظيفة وطبيعية (نص المستخدم والرد فقط)؛
      // تفاصيل الخطوات تظهر عند فتح اللوحة. البطاقات الكاشفة (رابط/تأكيد) تُعرض
      // كنوع رسالة مستقل فلا تختفي.
      if (agentPanelCollapsed) return null
      const call = item.meta?.tool_calls?.[0]
      if (!call) return null
      const rawArgs = safeParseArgs(String(call.arguments ?? '{}'))
      return renderStepCard(String(call.id), String(call.name ?? 'execute'), rawArgs)
    }
    if (item.kind === 'tool') {
      return null
    }
    if (item.kind === 'link') {
      const meta = item.meta ?? {}
      return renderLinkCard({ kind: String(meta.kind ?? ''), id: String(meta.id ?? ''), label: meta.label ? String(meta.label) : undefined })
    }
    if (item.kind === 'ask_user') {
      const meta = item.meta ?? {}
      return (
        <View style={[styles.askCard, { backgroundColor: colors.warningSurface, borderColor: colors.border }]}>
          <View style={styles.askHead}>
            <Ionicons name="help-circle" size={18} color={colors.warning} />
            <Text style={[styles.askTitle, { color: colors.textPrimary }]}>سؤال من المساعد</Text>
          </View>
          <Text style={[styles.askBody, { color: colors.textPrimary }]}>{item.content}</Text>
          {Array.isArray(meta.choices) && meta.choices.length > 0 && (
            <View style={styles.choicesWrap}>
              {(meta.choices as string[]).map((c, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`اختيار: ${c}`}
                  disabled={busy}
                  onPress={() => handleChoice(c)}
                  style={({ pressed }) => [styles.choiceChip, { backgroundColor: colors.accentSurface, borderColor: colors.borderHover, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.choiceText, { color: colors.accent }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {meta.allowFreeText !== false && (
            <View style={styles.askInputRow}>
              <TextInput
                value={askText}
                onChangeText={setAskText}
                placeholder="أكتب إجابتك هنا..."
                placeholderTextColor={colors.textMuted}
                editable={!busy}
                style={[styles.askInput, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="إرسال إجابة كيمو"
                disabled={busy || !askText.trim()}
                onPress={() => handleChoice(askText.trim())}
                style={[styles.askSend, { backgroundColor: colors.accent, opacity: busy || !askText.trim() ? 0.4 : 1 }]}
              >
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      )
    }
    if (item.kind === 'confirmation') {
      // confirmation للعمليات غير الـ delete تموضعه inline مرتبط بـ pending
      // الحذف له modal مستقل — لا نعرضه inline هنا لتفادي الازدواجية
      const meta = item.meta ?? {}
      const hasModalDelete = Array.isArray(pending?.items) && pending?.kind === 'confirmation' && pending.items.length > 0
      if (hasModalDelete) return null
      return (
        <View style={[styles.confirmCard, { backgroundColor: colors.errorSurface, borderColor: colors.border }]}>
          <View style={styles.askHead}>
            <Ionicons name="warning" size={18} color={colors.error} />
            <Text style={[styles.askTitle, { color: colors.error }]}>{meta.title ?? 'طلب موافقة'}</Text>
          </View>
          <Text style={[styles.askBody, { color: colors.textPrimary }]}>{item.content}</Text>
          {!!meta.details && (
            <ScrollView
              style={[styles.confirmDetailsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
              contentContainerStyle={styles.confirmDetailsContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.confirmDetails, { color: colors.textSecondary }]}>{meta.details}</Text>
            </ScrollView>
          )}
          {!busy && (
            <View style={styles.confirmBtns}>
              <Pressable onPress={() => handleConfirm(true)} style={[styles.confirmBtn, { backgroundColor: colors.error }]}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>موافقة</Text>
              </Pressable>
              <Pressable onPress={() => handleConfirm(false)} style={[styles.confirmBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
                <Text style={[styles.confirmBtnText, { color: colors.textSecondary }]}>رفض</Text>
              </Pressable>
            </View>
          )}
        </View>
      )
    }
    if (item.kind === 'file') {
      const meta = item.meta ?? {}
      const format: string = meta.format ?? ''
      const icon = format === 'excel' ? 'grid-outline' : format === 'word' ? 'document-text-outline' : 'print-outline'
      return (
        <View style={[styles.fileCard, { backgroundColor: colors.successSurface, borderColor: colors.border }]}>
          <Ionicons name={icon as any} size={18} color={colors.success} />
          <View style={styles.fileInfo}>
            <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{meta.name ?? 'ملف'}</Text>
            <Text style={[styles.formatBadge, { color: colors.textSecondary }]}>
              {format === 'excel' ? 'جدول إكسل' : format === 'word' ? 'مستند وورد' : 'ملف PDF'}
            </Text>
          </View>
                            <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`تحميل ${String(meta.name ?? 'الملف')}`}
                    onPress={async () => {

              const res = await saveToDownloads(String(meta.uri ?? ''), String(meta.name ?? 'ملف'))
              if (res.ok) Alert.alert('تم التحميل', `تم حفظ الملف "${res.savedName}" في جهازك بنجاح.`)
            }}
            style={[styles.fileBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          >
            <Ionicons name="download-outline" size={14} color={colors.textPrimary} />
            <Text style={[styles.fileBtnText, { color: colors.textPrimary }]}>تحميل</Text>
          </Pressable>
          <Pressable onPress={() => shareFile(String(meta.uri ?? ''), String(meta.name ?? '')).catch(() => {})} style={[styles.fileBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="share-outline" size={14} color="#fff" />
            <Text style={styles.fileBtnText}>فتح/مشاركة</Text>
          </Pressable>
        </View>
      )
    }
    if (item.kind === 'error') {
      return (
        <View style={[styles.errorCard, { backgroundColor: colors.errorSurface, borderColor: colors.border }]}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{item.content}</Text>
        </View>
      )
    }
    if (item.kind === 'system') {
      return (
        <View style={[styles.systemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.systemText, { color: colors.textSecondary }]}>{item.content}</Text>
        </View>
      )
    }
    if (item.kind === 'progress') {
      // منطقة تفكير ونشاط الوكيل أثناء التنفيذ: محللة منفصلة وم تمييز بصري خفيف
      // بحيث يرى المستخدم خطوات العمل دون خلطها بالرد النهائي
      return (
        <View style={[styles.progressWrap, { backgroundColor: colors.accentSurface, borderColor: colors.border }]}>
          <View style={[styles.progressDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{item.content}</Text>
        </View>
      )
    }
    const isUser = item.role === 'user'
    const userImages = isUser && Array.isArray(item.meta?.images) ? (item.meta.images as string[]).filter(Boolean) : []
    return (
      <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
        {isUser ? (
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: colors.accent,
                borderColor: colors.accent,
              },
            ]}
          >
            {userImages.length > 0 && (
              <View style={styles.userImages}>
                {userImages.map((uri, i) => (
                  <Image key={`${uri}-${i}`} source={{ uri }} style={styles.userImg} />
                ))}
              </View>
            )}
            {!!item.content && <Text style={[styles.bubbleText, { color: '#FFFFFF', textAlign: 'right', writingDirection: 'rtl' }]}>{item.content}</Text>}
          </View>
        ) : (
          <View style={styles.assistantBlock}>
            <View style={styles.assistantPlain}>
              <Markdown content={item.content} streamEnded />
            </View>
            {!!item.content && (
              <Pressable accessibilityRole="button" accessibilityLabel={copiedId === item.id ? 'تم نسخ الرد' : 'نسخ رد كيمو'} onPress={() => handleCopy(item.id, item.content)} hitSlop={8} style={styles.copyBtn}>
                <Ionicons
                  name={copiedId === item.id ? 'checkmark' : 'copy-outline'}
                  size={14}
                  color={copiedId === item.id ? colors.success : colors.textMuted}
                />
                <Text style={[styles.copyText, { color: copiedId === item.id ? colors.success : colors.textMuted }]}>
                  {copiedId === item.id ? 'تم النسخ' : 'نسخ'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>كيمو</Text>
            <Text numberOfLines={1} style={[styles.headerSub, { color: colors.textMuted }]}>
              {configured ? `${providerLabel} — ${model}` : 'لم يُعدَّ المزود بعد'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="فتح سجل محادثات كيمو" onPress={() => setShowHistory(true)} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.modeRow}>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: mode === 'edit' }} accessibilityLabel={mode === 'edit' ? 'إيقاف وضع التعديل' : 'تفعيل وضع التعديل'} onPress={toggleMode} style={[styles.modeChip, { backgroundColor: mode === 'edit' ? colors.successSurface : colors.surface }]}>
            <Ionicons name={mode === 'edit' ? 'create-outline' : 'eye-outline'} size={13} color={mode === 'edit' ? colors.success : colors.textSecondary} />
            <Text style={[styles.modeChipText, { color: mode === 'edit' ? colors.success : colors.textSecondary }]}>
              {mode === 'edit' ? 'وضع التعديل مفعّل' : 'قراءة فقط'}
            </Text>
          </Pressable>
          {!configured && (
            <Pressable accessibilityRole="button" accessibilityLabel="فتح إعدادات مزود كيمو" onPress={() => navigation.navigate('AgentSettings')} style={[styles.setupChip, { backgroundColor: colors.warningSurface }]}>
              <Text style={[styles.modeChipText, { color: colors.warning }]}>الإعداد الآن</Text>
            </Pressable>
          )}
        </View>
      </View>

      {renderAgentPanel()}

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
        data={visibleMessages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          // أعد التمرير عند كل تغيّر حجم — لا تمسح الطلب (المحتوى يُركَّب تدريجياً،
          // والتمرير الواحد قد ينزل عند آخر خلية مركّبة فقط = المنتصف)
          if (!wantedBottom.current) return
          listRef.current?.scrollToEnd({ animated: false })
        }}
        onScroll={(e) => {
          // بلوغ القاع فعلاً = نهاية الطلب (سيُعاد تلقائياً عند وصول رسائل جديدة)
          const ns = e.nativeEvent
          const h = ns.contentSize?.height ?? 0
          let nearBottom = true
          if (h > 0) {
            nearBottom = ns.contentOffset.y >= h - ns.layoutMeasurement.height - 60
            if (nearBottom) wantedBottom.current = false
          }
          // إخفاء/إظهار زر النزول: يظهر فقط عندما يكون المستخدم فوق آخر رسالة
          if (nearBottom !== atBottom) setAtBottom(nearBottom)
        }}
        onScrollEndDrag={(e) => {
          // توقف المستخدم فوق نهاية المحادثة (لا في القاع) → ألغِ الطلب، لا نطارد إصبعه
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
          busy || thinking ? (
            <>
              {liveProgress.length > 0 ? (
                <View style={styles.liveProgressWrap}>
                  {liveProgress.map((p, i) => (
                    <View key={i} style={[styles.progressWrap, { backgroundColor: colors.accentSurface, borderColor: colors.border }]}>
                      <View style={[styles.progressDot, { backgroundColor: colors.accent }]} />
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>{p}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {liveSteps.length > 0 ? (
                <View style={styles.liveProgressWrap}>
                  {liveSteps.map((s, i) => (
                    <View key={i} style={[styles.progressWrap, { backgroundColor: colors.accentSurface, borderColor: colors.border }]}>
                      <Ionicons name="git-commit-outline" size={13} color={colors.accent} />
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {streamText ? (
                <View style={styles.assistantPlain}>
                  <Markdown content={streamText} streamEnded={false} />
                </View>
              ) : null}
            </>
          ) : null
        }
      />

      <View style={[styles.inputArea, { paddingBottom: kbHeight > 0 ? kbHeight + 4 : Math.max(insets.bottom, 2), backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
          {/* زر النزول لآخر رسالة — يطفو فوق زر الإرسال ولا يظهر إلا خارج نهاية المحادثة */}
          {!atBottom && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="الانتقال إلى آخر رسالة"
              onPress={() => {
                // ضغطة واحدة تكفي: أبقِ الطلب نشطاً حتى الالتحام الفعلي بالقاع
                wantedBottom.current = true
                listRef.current?.scrollToEnd({ animated: true })
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.downBtn, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: '#000', opacity: pressed ? 0.7 : 1 }]}
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
            <Pressable accessibilityRole="button" accessibilityLabel="إرفاق ملفات" onPress={pickFiles} disabled={busy || recorderState.isRecording} style={[styles.attachBtn, { backgroundColor: colors.surface, opacity: busy || recorderState.isRecording ? 0.4 : 1 }]}>
              <Ionicons name="attach-outline" size={20} color={colors.textSecondary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="إرفاق صور" onPress={pickImages} disabled={busy || recorderState.isRecording} style={[styles.attachBtn, { backgroundColor: colors.surface, opacity: busy || recorderState.isRecording ? 0.4 : 1 }]}>
              <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
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
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  userRow: { justifyContent: 'flex-start' },
  assistantRow: { justifyContent: 'flex-end' },
  assistantPlain: { flex: 1, paddingVertical: 4 },
  assistantBlock: { flex: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 6, paddingVertical: 3 },
  copyText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_500Medium' },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  streamBubble: { marginVertical: 4 },
  bubbleText: { fontSize: fontSize.md, lineHeight: 22, fontFamily: 'Tajawal_400Regular' },
  userImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6, alignSelf: 'flex-start', maxWidth: 200 },
  userImg: { width: 88, height: 88, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  askCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginVertical: 4 },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  askTitle: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  askBody: { fontSize: fontSize.md, lineHeight: 22, fontFamily: 'Tajawal_400Regular' },
  choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1 },
  choiceText: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  askInputRow: { flexDirection: 'row', gap: spacing.sm },
  askInput: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', minHeight: 42 },
  askSend: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  confirmCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginVertical: 4 },
  confirmDetailsBox: { maxHeight: 190, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8 },
  confirmDetailsContent: { paddingBottom: 4 },
  confirmDetails: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full },
  confirmBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  confirmModal: { width: '100%', maxWidth: 460, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, maxHeight: '85%' },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  confirmIntro: { fontSize: fontSize.sm, lineHeight: 20, fontFamily: 'Tajawal_400Regular' },
  delList: { flexGrow: 0, flexShrink: 1, gap: spacing.sm },
  delListContent: { gap: spacing.sm, paddingBottom: 4 },
  delItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  delItemText: { flex: 1, fontSize: fontSize.md, lineHeight: 22, fontFamily: 'Tajawal_400Regular' },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginVertical: 2 },
  fileInfo: { flex: 1, gap: 2, minWidth: 0 },
  fileName: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  formatBadge: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  fileBtnText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginVertical: 2 },
  errorText: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  systemCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.sm, marginVertical: 2 },
  systemText: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  progressWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 1 },
  progressDot: { width: 7, height: 7, borderRadius: 4, marginTop: 7, flexShrink: 0 },
  progressText: { flex: 1, fontSize: fontSize.sm, lineHeight: 20, fontFamily: 'Tajawal_400Regular', fontStyle: 'italic' },
  liveProgressWrap: { gap: 2, paddingHorizontal: spacing.lg },
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
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 1 },
  stepIcon: { width: 22, height: 22, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepBody: { flex: 1, gap: 1, minWidth: 0 },
  stepTitleRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stepTitle: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  stepResult: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular', lineHeight: 18 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, marginVertical: 2 },
  agentPanel: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  agentPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  agentIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  agentAvatar: { width: 30, height: 30, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  agentPanelTitleWrap: { flex: 1, gap: 1 },
  agentPanelTitle: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  agentPanelSub: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  phaseChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.full, maxWidth: 145 },
  phaseChipText: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  panelHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.sm },
  skillBody: { flex: 1, gap: 1 },
  skillLabel: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  skillDescription: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  planWrap: { gap: spacing.xs },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  planTitle: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  planCount: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  planSteps: { gap: 3 },
  planStepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 22 },
  planStepText: { flex: 1, fontSize: fontSize.xs },
  decisionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.sm },
  decisionTitle: { fontSize: fontSize.xs, fontFamily: 'Tajawal_700Bold' },
  observationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  observationText: { flex: 1, fontSize: fontSize.xs, lineHeight: 17, fontFamily: 'Tajawal_400Regular' },
})
