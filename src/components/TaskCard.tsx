import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { useChatStore } from '../screens/assistant/agentChatStore'
import type { AgentPlan } from '../assistant/agentContract'

function stepIcon(status?: string): { name: string; color: string } {
  if (status === 'done') return { name: 'checkmark-circle', color: '#16A34A' }
  if (status === 'active') return { name: 'sync', color: '#2563EB' }
  if (status === 'blocked') return { name: 'pause-circle', color: '#F59E0B' }
  if (status === 'skipped') return { name: 'close-circle', color: '#94A3B8' }
  return { name: 'ellipse-outline', color: '#94A3B8' }
}

function statusLabel(status?: string): string {
  if (status === 'done') return 'منجز'
  if (status === 'active') return 'قيد التنفيذ'
  if (status === 'blocked') return 'معلّق'
  if (status === 'skipped') return 'متجاوز'
  return 'معلّق'
}

export default function TaskCard() {
  const { colors } = useTheme()
  const plan: AgentPlan | null = useChatStore((s) => s._plan)
  const executionSteps = useChatStore((s) => s.executionSteps)
  const statusBar = useChatStore((s) => s.statusBar)
  const [expanded, setExpanded] = useState(true)

  if (!plan || !plan.steps?.length) return null

  const done = plan.steps.filter((s) => s.status === 'done').length
  const total = plan.steps.length
  const busy =
    statusBar.visible && ['execute', 'verify', 'understand', 'plan', 'recover', 'ask'].includes(statusBar.phase)

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'طي بطاقة المهام' : 'توسيع بطاقة المهام'}
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.badge, { backgroundColor: done === total ? '#16A34A18' : '#2563EB18' }]}>
            <Text style={[styles.badgeText, { color: done === total ? '#16A34A' : '#2563EB' }]}>
              {done}/{total}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {plan.goal?.slice(0, 60) || 'خطة التنفيذ'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {done === total ? 'اكتملت جميع المهام' : busy ? 'جارٍ التنفيذ…' : `${done} من ${total} منجزة`}
            </Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {expanded && (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          {plan.steps.map((step, idx) => {
            const icon = stepIcon(step.status)
            const isActive = step.status === 'active'
            return (
              <View
                key={step.id ?? `step-${idx}`}
                style={[
                  styles.stepRow,
                  isActive && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm },
                ]}
              >
                <View style={[styles.stepIndex, { backgroundColor: isActive ? '#2563EB' : colors.border }]}>
                  <Text style={[styles.stepIndexText, { color: isActive ? '#fff' : colors.textMuted }]}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  {step.detail ? (
                    <Text style={[styles.stepDetail, { color: colors.textMuted }]} numberOfLines={2}>
                      {step.detail}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.stepMeta}>
                  <Ionicons name={icon.name as any} size={16} color={icon.color} />
                  <Text style={[styles.stepStatus, { color: icon.color }]}>{statusLabel(step.status)}</Text>
                </View>
              </View>
            )
          })}
          {executionSteps.length > 0 && (
            <Text style={[styles.hint, { color: colors.textMuted }]} numberOfLines={1}>
              آخر نشاط: {executionSteps[executionSteps.length - 1]?.label ?? '—'}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  headerLeft: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  badge: { minWidth: 44, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignItems: 'center' },
  badgeText: { fontFamily: 'Tajawal_700Bold', fontSize: 11 },
  title: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm, textAlign: 'right' },
  subtitle: { fontFamily: 'Tajawal_400Regular', fontSize: 11, textAlign: 'right', marginTop: 1 },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.sm, gap: 6 },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.sm },
  stepIndex: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepIndexText: { fontFamily: 'Tajawal_700Bold', fontSize: 11 },
  stepTitle: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm, textAlign: 'right' },
  stepDetail: { fontFamily: 'Tajawal_400Regular', fontSize: 11, textAlign: 'right', marginTop: 1 },
  stepMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, minWidth: 70, justifyContent: 'flex-end' },
  stepStatus: { fontFamily: 'Tajawal_700Bold', fontSize: 10 },
  hint: { fontFamily: 'Tajawal_400Regular', fontSize: 10, textAlign: 'right', marginTop: 2 },
})
