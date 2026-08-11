import React, { useState, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'

/**
 * سجل خطوات التفكير والتنفيذ يعرض تاريخ استدعاءات الأدوات ونتائجها
 * (نجاح/فشل) باصطلاح عربي واضح للمستخدم — قابل للطي/الفتح.
 * الغرض: شفافية عملية الوكيل دون إغراق المحادثة بمسار ReAct كامل.
 */
export interface StepItem {
  id: string
  label: string
  status: 'running' | 'done' | 'failed'
  detail?: string
}

interface Props {
  steps: StepItem[]
  liveStep?: string
  thinking?: boolean
}

export default function ThinkingSteps({ steps, liveStep, thinking }: Props) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)

  const counts = useMemo(() => {
    let done = 0
    let failed = 0
    for (const s of steps) {
      if (s.status === 'done') done++
      else if (s.status === 'failed') failed++
    }
    return { done, failed, total: steps.length }
  }, [steps])

  const hasContent = counts.total > 0 || !!liveStep || !!thinking
  if (!hasContent) return null

  const toggle = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    }
    setOpen((v) => !v)
  }

  const summaryText = thinking
    ? liveStep || 'المساعد يحلّل الطلب ويخطط للخطوات...'
    : counts.total
      ? `نفّذ ${counts.done} خطوة${counts.failed ? ` — فشلت ${counts.failed}` : ''}`
      : 'يبدأ التنفيذ...'

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={toggle} style={styles.head} hitSlop={6}>
        <View style={[styles.iconDot, { backgroundColor: thinking || counts.total ? colors.accentSurface : colors.surface }]}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
        </View>
        <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={2}>
          {summaryText}
        </Text>
        <Ionicons
          name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {open && (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          {steps.map((s, i) => (
            <View key={s.id} style={styles.stepRow}>
              <View style={[styles.dotted, { borderColor: colors.border }]} />
              <View style={[statusColor(s.status, colors), styles.statusDot]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.stepLabel, statusLabel(s.status, colors)]}
                  numberOfLines={3}
                >
                  {s.label}
                </Text>
                {s.detail ? (
                  <Text style={[styles.stepDetail, { color: colors.textMuted }]} numberOfLines={2}>
                    {s.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {thinking && liveStep && (
            <View style={styles.stepRow}>
              <View style={[styles.dotted, { borderColor: colors.border }]} />
              <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.stepLabel, { color: colors.accent, fontWeight: '600' }]} numberOfLines={2}>
                {liveStep}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

function statusColor(status: StepItem['status'], colors: any): { backgroundColor: string } {
  if (status === 'done') return { backgroundColor: colors.success }
  if (status === 'failed') return { backgroundColor: colors.error }
  return { backgroundColor: colors.accent }
}

function statusLabel(status: StepItem['status'], colors: any): any {
  if (status === 'done') return { color: colors.textPrimary }
  if (status === 'failed') return { color: colors.error }
  return { color: colors.textSecondary, fontWeight: '600' }
}

const styles = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 10, marginVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconDot: { width: 22, height: 22, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  summary: { flex: 1, fontSize: fontSize.sm, lineHeight: 18, fontFamily: 'Tajawal_400Regular' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 8, gap: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dotted: { width: 0, borderLeftWidth: StyleSheet.hairlineWidth, alignSelf: 'stretch', position: 'absolute', left: 5, top: 4, bottom: -6, opacity: 0.4 },
  statusDot: { width: 11, height: 11, borderRadius: radius.full, marginTop: 4, borderWidth: 0 },
  stepLabel: { flex: 1, fontSize: fontSize.xs, lineHeight: 17, fontFamily: 'Tajawal_400Regular' },
  stepDetail: { fontSize: 11, marginTop: 1, fontFamily: 'Tajawal_400Regular' },
})
