import React from 'react'
import { View, Text, Pressable, ScrollView, Modal, Animated, Image, TextInput, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import Markdown from '../../components/ui/Markdown'
import { TOOL_ARABIC, stepCardTitle, stepCardDetail, stepCardResult, linkCardLabel } from '../../assistant/toolLabels'
import { sanitizeAssistantText } from '../../assistant/sanitize'
import type { Message } from '../../assistant'
import type { AgentDecision } from '../../assistant/agentContract'
import { PHASE_LABELS, type ChatItem, type ActiveContext, type AuditEntry } from './agentChatStore'

type Colors = ReturnType<typeof useTheme>['colors']

export interface RegistryCtx {
  colors: Colors
  busy: boolean
  copiedId: string | null
  onCopy: (id: string, text: string) => void
  onChoice: (text: string) => void
  onConfirm: (approve: boolean, selected?: string[]) => void
  onOpenLink: (link: { kind: string; id: string; label?: string }) => void
  onFileDownload: (uri: string, name: string) => void
  onFileShare: (uri: string, name: string) => void
  onRetry?: () => void
  onOpenSettings?: () => void
}

function stepIcon(tool: string): string {
  if (tool === 'create' || tool.startsWith('workspace_create')) return 'add-circle-outline'
  if (tool === 'update' || tool.startsWith('workspace_update')) return 'create-outline'
  if (tool === 'delete' || tool.startsWith('workspace_delete') || tool === 'remove_attachment') return 'trash-outline'
  if (tool === 'query' || tool.startsWith('search') || tool === 'get') return 'search-outline'
  if (tool === 'import_project_file' || tool === 'read_uploaded_file') return 'document-outline'
  if (tool === 'generate_file') return 'document-text-outline'
  if (tool === 'undo_last') return 'arrow-undo-outline'
  if (tool.startsWith('workspace')) return 'grid-outline'
  return 'git-commit-outline'
}

function ToolStepView({ item, colors }: { item: ChatItem; colors: Colors }) {
  const m = item.message as Message | undefined
  const meta: any = m?.meta ?? {}
  const call = meta.tool_calls?.[0]
  const name = String(meta?.name ?? call?.name ?? 'execute')
  const rawArgs = call?.arguments ? (() => { try { return JSON.parse(String(call.arguments)) } catch { return {} } })() : (meta?.args && typeof meta.args === 'object' ? meta.args : {})
  const result = meta?.observation ?? meta?.result ?? item.payload?.result ?? ''
  const ok = meta?.ok !== false
  const title = stepCardTitle(name, rawArgs)
  const detail = sanitizeAssistantText(stepCardDetail(name, rawArgs))
  const resultText = sanitizeAssistantText(stepCardResult(name, result))
  const statusColor = ok ? colors.success : colors.error
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.accentSurface }]}>
        <Ionicons name={stepIcon(name) as any} size={13} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
          {detail ? <Text style={{ color: colors.textMuted }}> {detail}</Text> : null}
        </Text>
        {!!resultText && (
          <Text style={[styles.sub, { color: statusColor }]} numberOfLines={2}>
            <Text style={{ color: statusColor }}>{ok ? '✓ ' : '✗ '}</Text>
            {resultText}
          </Text>
        )}
      </View>
    </View>
  )
}

function AskCardView({ item, ctx }: { item: ChatItem; ctx: RegistryCtx }) {
  const colors = ctx.colors
  const m = item.message as Message | undefined
  const meta: any = m?.meta ?? item.payload ?? {}
  const [text, setText] = React.useState('')
  return (
    <View style={[styles.card, { backgroundColor: colors.warningSurface, borderColor: colors.border }]}>
      <View style={styles.headRow}>
        <Ionicons name="help-circle" size={18} color={colors.warning} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>سؤال من المساعد</Text>
      </View>
      <Text style={[styles.body, { color: colors.textPrimary }]}>{m?.content ?? meta.question ?? ''}</Text>
      {Array.isArray(meta.choices) && meta.choices.length > 0 && (
        <View style={styles.chips}>
          {(meta.choices as string[]).map((c, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`اختيار: ${c}`} disabled={ctx.busy} onPress={() => ctx.onChoice(c)} style={({ pressed }) => [styles.chip, { backgroundColor: colors.accentSurface, borderColor: colors.borderHover, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[styles.chipText, { color: colors.accent }]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {(meta.allowFreeText !== false) && (
        <View style={styles.inputRow}>
          <TextInput value={text} onChangeText={setText} placeholder="أكتب إجابتك هنا..." placeholderTextColor={colors.textMuted} editable={!ctx.busy} style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="إرسال إجابة" disabled={ctx.busy || !text.trim()} onPress={() => { ctx.onChoice(text.trim()); setText('') }} style={[styles.sendMini, { backgroundColor: colors.accent, opacity: ctx.busy || !text.trim() ? 0.4 : 1 }]}>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  )
}

function ConfirmCardView({ item, ctx }: { item: ChatItem; ctx: RegistryCtx }) {
  const colors = ctx.colors
  const m = item.message as Message | undefined
  const meta: any = m?.meta ?? item.payload ?? {}
  return (
    <View style={[styles.card, { backgroundColor: colors.errorSurface, borderColor: colors.border }]}>
      <View style={styles.headRow}>
        <Ionicons name="warning" size={18} color={colors.error} />
        <Text style={[styles.title, { color: colors.error }]}>{meta.title ?? 'طلب موافقة'}</Text>
      </View>
      <Text style={[styles.body, { color: colors.textPrimary }]}>{m?.content ?? ''}</Text>
      {!!meta.details && (
        <ScrollView style={[styles.detailsBox, { backgroundColor: colors.surface, borderColor: colors.border }]} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{meta.details}</Text>
        </ScrollView>
      )}
      {!ctx.busy && (
        <View style={styles.btnRow}>
          <Pressable onPress={() => ctx.onConfirm(true)} style={[styles.btnPrimary, { backgroundColor: colors.error }]}>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.btnText}>موافقة</Text>
          </Pressable>
          <Pressable onPress={() => ctx.onConfirm(false)} style={[styles.btnGhost, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
            <Text style={[styles.btnText, { color: colors.textSecondary }]}>رفض</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

function LinkCardView({ item, ctx }: { item: ChatItem; ctx: RegistryCtx }) {
  const colors = ctx.colors
  const m = item.message as Message | undefined
  const meta: any = m?.meta ?? item.payload ?? {}
  const label = linkCardLabel(String(meta.kind ?? ''))
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`فتح ${label}`} onPress={() => ctx.onOpenLink({ kind: String(meta.kind ?? ''), id: String(meta.id ?? ''), label: meta.label })} style={({ pressed }) => [styles.card, { backgroundColor: colors.successSurface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.success + '18' }]}>
        <Ionicons name="open-outline" size={14} color={colors.success} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{label}{meta.label ? ` — ${meta.label}` : ''}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>اضغط للانتقال إلى مكان البيانات</Text>
      </View>
      <Ionicons name="chevron-back" size={16} color={colors.success} />
    </Pressable>
  )
}

function FileCardView({ item, ctx }: { item: ChatItem; ctx: RegistryCtx }) {
  const colors = ctx.colors
  const m = item.message as Message | undefined
  const meta: any = m?.meta ?? item.payload ?? {}
  const format: string = meta.format ?? ''
  const icon = format === 'excel' ? 'grid-outline' : format === 'word' ? 'document-text-outline' : 'print-outline'
  return (
    <View style={[styles.card, { backgroundColor: colors.successSurface, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={18} color={colors.success} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{meta.name ?? 'ملف'}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{format === 'excel' ? 'جدول إكسل' : format === 'word' ? 'مستند وورد' : 'ملف PDF'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`تحميل ${meta.name ?? 'الملف'}`} onPress={() => ctx.onFileDownload(String(meta.uri ?? ''), String(meta.name ?? 'ملف'))} style={[styles.fileBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
        <Ionicons name="download-outline" size={14} color={colors.textPrimary} />
        <Text style={[styles.btnText, { color: colors.textPrimary }]}>تحميل</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="فتح/مشاركة" onPress={() => ctx.onFileShare(String(meta.uri ?? ''), String(meta.name ?? ''))} style={[styles.fileBtn, { backgroundColor: colors.accent }]}>
        <Ionicons name="share-outline" size={14} color="#fff" />
        <Text style={styles.btnText}>مشاركة</Text>
      </Pressable>
    </View>
  )
}

function DecisionCardView({ item, ctx }: { item: ChatItem; ctx: RegistryCtx }) {
  const colors = ctx.colors
  const d = item.payload as AgentDecision
  const warn = d.kind === 'question'
  return (
    <View style={[styles.card, { backgroundColor: warn ? colors.warningSurface : colors.surface, borderColor: colors.border }]}>
      <Ionicons name={warn ? 'help-circle-outline' : 'git-branch-outline'} size={15} color={warn ? colors.warning : colors.accent} />
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{d.title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>{d.detail}</Text>
      </View>
    </View>
  )
}

function ObservationCardView({ item, ctx }: { item: ChatItem; ctx: RegistryCtx }) {
  const colors = ctx.colors
  const o = item.payload as any
  const isRecovery = o.type === 'recovery'
  return (
    <View style={styles.observeRow}>
      <Ionicons name={isRecovery ? 'refresh-outline' : 'information-circle-outline'} size={14} color={isRecovery ? colors.warning : colors.textMuted} />
      <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={2}>{o.detail}</Text>
    </View>
  )
}

const OUTCOME_LABELS: Record<string, string> = { completed: 'اكتملت المهمة', cancelled: 'أُلغيت المهمة', paused: 'المهمة متوقفة مؤقتاً', error: 'تعثرت المهمة', failed: 'فشلت المهمة' }
function CompletionPulse({ item }: { item: ChatItem }) {
  const outcome = String(item.payload?.outcome ?? 'completed')
  const ok = outcome === 'completed'
  return (
    <View style={styles.observeRow}>
      <Ionicons name={ok ? 'checkmark-circle' : 'checkmark-circle-outline'} size={14} color={ok ? '#16A34A' : '#888'} />
      <Text style={[styles.sub, { color: ok ? '#16A34A' : '#888' }]}>{OUTCOME_LABELS[outcome] ?? `انتهت المهمة (${outcome})`}</Text>
    </View>
  )
}

export function renderRegistryItem(item: ChatItem, ctx: RegistryCtx) {
  const colors = ctx.colors
  switch (item.uiComponent) {
    case 'user_bubble': {
      const m = item.message as Message
      const userImages = Array.isArray(m?.meta?.images) ? (m.meta.images as string[]).filter(Boolean) : []
      return (
        <View style={[styles.row, styles.userRow]}>
          <View style={[styles.bubble, { backgroundColor: colors.accent }]}>
            {userImages.length > 0 && (
              <View style={styles.userImages}>
                {userImages.map((uri, i) => (<Image key={`${uri}-${i}`} source={{ uri }} style={styles.userImg} />))}
              </View>
            )}
            {!!m?.content && <Text style={[styles.bubbleText, { color: '#fff' }]}>{m.content}</Text>}
          </View>
        </View>
      )
    }
    case 'assistant_message': {
      const m = item.message as Message
      return (
        <View style={[styles.row, styles.assistantRow]}>
          <View style={{ flex: 1 }}>
            <View style={styles.assistantPlain}>
              <Markdown content={m?.content ?? ''} streamEnded />
            </View>
            {!!m?.content && (
              <Pressable accessibilityRole="button" accessibilityLabel={ctx.copiedId === m.id ? 'تم النسخ' : 'نسخ الرد'} onPress={() => ctx.onCopy(m.id, m.content)} hitSlop={8} style={styles.copyBtn}>
                <Ionicons name={ctx.copiedId === m.id ? 'checkmark' : 'copy-outline'} size={14} color={ctx.copiedId === m.id ? colors.success : colors.textMuted} />
                <Text style={[styles.sub, { color: ctx.copiedId === m.id ? colors.success : colors.textMuted }]}>{ctx.copiedId === m.id ? 'تم النسخ' : 'نسخ'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )
    }
    case 'tool_step':
      return <ToolStepView item={item} colors={colors} />
    case 'ask_card':
      return <AskCardView item={item} ctx={ctx} />
    case 'confirm_card':
      return <ConfirmCardView item={item} ctx={ctx} />
    case 'link_card':
      return <LinkCardView item={item} ctx={ctx} />
    case 'file_card':
      return <FileCardView item={item} ctx={ctx} />
    case 'decision_card':
      return <DecisionCardView item={item} ctx={ctx} />
    case 'observation_card':
      return <ObservationCardView item={item} ctx={ctx} />
    case 'completion_pulse':
      return <CompletionPulse item={item} />
    case 'error_card': {
      const m = item.message as Message
      return (
        <View style={[styles.card, { backgroundColor: colors.errorSurface, borderColor: colors.border }]}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={[styles.sub, { color: colors.error }]}>{m?.content}</Text>
          {(ctx.onRetry || ctx.onOpenSettings) && (
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
              {!!ctx.onRetry && (
                <Pressable accessibilityRole="button" accessibilityLabel="إعادة المحاولة" onPress={() => ctx.onRetry?.()} style={[styles.btnPrimary, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.sub, { color: '#fff' }]}>إعادة المحاولة</Text>
                </Pressable>
              )}
              {!!ctx.onOpenSettings && (
                <Pressable accessibilityRole="button" accessibilityLabel="فتح إعدادات المساعد" onPress={() => ctx.onOpenSettings?.()} style={[styles.btnGhost, { borderWidth: 1, borderColor: colors.border }]}>
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>الإعدادات</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )
    }
    case 'system_card': {
      const m = item.message as Message
      return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{m?.content}</Text>
        </View>
      )
    }
    default:
      return null
  }
}

export function ContextBanner({ context, phase, colors }: { context: ActiveContext; phase: string; colors: Colors }) {
  const collapsed = !context.goal && !context.status
  if (collapsed) return null
  return (
    <View style={[styles.banner, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <View style={styles.bannerRow}>
        <Ionicons name="clipboard-outline" size={15} color={colors.accent} />
        <Text style={[styles.bannerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{context.goal || 'مساحة عمل المساعد'}</Text>
      </View>
      <View style={styles.bannerMeta}>
        {!!context.date && (<Text style={[styles.bannerChip, { color: colors.textSecondary }]}>🗓️ {context.date}</Text>)}
        {!!context.status && (<Text style={[styles.bannerChip, { color: colors.accent }]}>● {context.status}</Text>)}
        <Text style={[styles.bannerChip, { color: colors.textMuted }]}>{PHASE_LABELS[phase as keyof typeof PHASE_LABELS] ?? phase}</Text>
      </View>
    </View>
  )
}

export function ExecutionStatusBar({ statusBar, colors }: { statusBar: { visible: boolean; phase: string; thinking: boolean; steps: string[] }; colors: Colors }) {
  if (!statusBar.visible) return null
  return (
    <View style={[styles.statusBar, { backgroundColor: colors.accentSurface, borderColor: colors.border }]}>
      <View style={styles.spinner}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.statusTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {PHASE_LABELS[statusBar.phase as keyof typeof PHASE_LABELS] ?? statusBar.phase}
        </Text>
        {statusBar.steps.length > 0 && (
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>…{statusBar.steps[statusBar.steps.length - 1]}</Text>
        )}
      </View>
    </View>
  )
}

export function AuditDrawer({ visible, onClose, trail, colors, onFlashHandled }: { visible: boolean; onClose: () => void; trail: AuditEntry[]; colors: Colors; onFlashHandled?: () => void }) {
  React.useEffect(() => { if (visible) onFlashHandled?.() }, [visible])
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.drawerOverlay} onPress={onClose}>
        <Pressable style={({ pressed }) => [styles.drawer, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: pressed ? 0.98 : 1 }]} onPress={() => {}}>
          <View style={styles.headRow}>
            <Ionicons name="list-outline" size={18} color={colors.accent} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>سجل العمليات</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="إغلاق السجل" onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.drawerContent}>
            {trail.length === 0 && <Text style={[styles.sub, { color: colors.textMuted }]}>لا توجد عمليات بعد.</Text>}
            {trail.slice().reverse().map((e) => (
              <View key={e.id} style={[styles.auditRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.auditType, { color: colors.accent }]}>{e.type}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={3}>{e.text}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginVertical: 4 },
  iconBox: { width: 22, height: 22, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  sub: { fontSize: fontSize.sm, lineHeight: 20, fontFamily: 'Tajawal_400Regular' },
  body: { fontSize: fontSize.md, lineHeight: 22, fontFamily: 'Tajawal_400Regular' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', minHeight: 42 },
  sendMini: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  inputRow: { marginTop: spacing.xs },
  detailsBox: { maxHeight: 190, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full },
  btnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full },
  btnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  row: { flexDirection: 'row', marginVertical: 2 },
  userRow: { justifyContent: 'flex-start' },
  assistantRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  bubbleText: { fontSize: fontSize.md, lineHeight: 22, fontFamily: 'Tajawal_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  userImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6, alignSelf: 'flex-start', maxWidth: 200 },
  userImg: { width: 88, height: 88, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  assistantPlain: { flex: 1, paddingVertical: 4 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 6, paddingVertical: 3 },
  observeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingVertical: 2 },
  banner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  bannerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bannerChip: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  spinner: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'flex-end', justifyContent: 'center', padding: spacing.lg },
  drawer: { width: '62%', maxWidth: 460, height: '85%', borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  drawerContent: { gap: spacing.sm, paddingBottom: 4 },
  auditRow: { gap: 2, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  auditType: { fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
})
