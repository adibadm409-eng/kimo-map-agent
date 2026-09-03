import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { useChatStore } from '../screens/assistant/agentChatStore'

function stepVisual(status?: string, colors?: any): { name: string; color: string; label: string } {
  if (!colors) return { name: 'ellipse-outline', color: '#94A3B8', label: 'بانتظار' }
  if (status === 'done') return { name: 'checkmark-circle', color: colors.success, label: 'منجزة' }
  if (status === 'active') return { name: 'sync', color: colors.accent, label: 'تُنفذ الآن' }
  if (status === 'blocked') return { name: 'pause-circle', color: colors.warning, label: 'بانتظارك' }
  if (status === 'skipped') return { name: 'remove-circle-outline', color: colors.textMuted, label: 'متجاوزة' }
  return { name: 'ellipse-outline', color: colors.textMuted, label: 'بانتظار' }
}

/**
 * بطاقة خطة المهمة: تظهر فقط عندما يصنف الوكيل الطلب مهمة مخططة،
 * ملتصقة بخانة الإدخال، قابلة للطي، وتختفي تلقائياً عند انتهاء المهمة.
 */
export default function TaskCard() {
  const { colors } = useTheme()
  const plan = useChatStore((s) => s._plan)
  const statusBar = useChatStore((s) => s.statusBar)
  const [expanded, setExpanded] = useState(true)

  if (!plan || !plan.steps?.length) {
    if (!statusBar.visible) return null
    return (
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: colors.accentSurface }]}>
            <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>أحلل طلبك وأبني الخطة…</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>ستظهر الخطوات هنا فور جاهزيتها</Text>
          </View>
        </View>
      </View>
    )
  }

  const done = plan.steps.filter((s) => s.status === 'done').length
  const total = plan.steps.length
  const pct = Math.round((done / total) * 100)
  const activeStep = plan.steps.find((s) => s.status === 'active')

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'طي بطاقة خطة المهمة' : 'توسيع بطاقة خطة المهمة'}
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
      >
        <View style={[styles.avatar, { backgroundColor: done === total ? colors.successSurface : colors.accentSurface }]}>
          <Ionicons
            name={done === total ? 'checkmark-circle' : 'layers-outline'}
            size={16}
            color={done === total ? colors.success : colors.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {plan.goal?.slice(0, 60) || 'خطة المهمة'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {done === total
              ? 'اكتملت جميع الخطوات'
              : activeStep
                ? `${activeStep.title} — ${done} من ${total}`
                : `${done} من ${total} منجزة`}
          </Text>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: done === total ? colors.success : colors.accent }]} />
          </View>
        </View>
        <Text style={[styles.pct, { color: colors.textSecondary }]}>{pct}٪</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {expanded && (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          {plan.steps.map((step, idx) => {
            const v = stepVisual(step.status, colors)
            const isActive = step.status === 'active'
            return (
              <View
                key={step.id ?? `step-${idx}`}
                style={[
                  styles.stepRow,
                  isActive && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm },
                ]}
              >
                <Ionicons name={v.name as any} size={17} color={v.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  {step.detail ? (
                    <Text style={[styles.stepDetail, { color: colors.textMuted }]} numberOfLines={2}>
                      {step.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.stepStatus, { color: v.color }]}>{v.label}</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm, textAlign: 'right' },
  subtitle: { fontFamily: 'Tajawal_400Regular', fontSize: 11, textAlign: 'right', marginTop: 1 },
  track: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  pct: { fontFamily: 'Tajawal_700Bold', fontSize: 11, minWidth: 34, textAlign: 'center' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.sm, gap: 4 },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.sm },
  stepTitle: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm, textAlign: 'right' },
  stepDetail: { fontFamily: 'Tajawal_400Regular', fontSize: 11, textAlign: 'right', marginTop: 1 },
  stepStatus: { fontFamily: 'Tajawal_700Bold', fontSize: 10, minWidth: 52, textAlign: 'left' },
})
