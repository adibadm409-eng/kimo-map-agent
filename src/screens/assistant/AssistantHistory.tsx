import React, { useMemo, useState, useCallback } from 'react'
import {
  View, Text, Modal, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import type { SessionMeta } from '../../assistant'

interface Props {
  visible: boolean
  onClose: () => void
  sessions: SessionMeta[]
  activeId: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  onOpenSettings: () => void
  onRefresh: () => void
}

function timeLabel(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `${hh}:${mm}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`
}

export default function AssistantHistory({
  visible,
  onClose,
  sessions,
  activeId,
  onSelect,
  onDelete,
  onNew,
  onOpenSettings,
  onRefresh,
}: Props) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return sessions
    const lower = q.toLowerCase()
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        (s.providerLabel || '').toLowerCase().includes(lower) ||
        (s.model || '').toLowerCase().includes(lower)
    )
  }, [sessions, query])

  const confirmDelete = useCallback(
    (s: SessionMeta) => {
      Alert.alert('حذف المحادثة', `سيتم حذف «${s.title}» نهائياً مع كل رسائلها.`, [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            setDeleting(s.id)
            try {
              await new Promise<void>((resolve) => {
                onDelete(s.id)
                resolve()
              })
            } finally {
              setDeleting(null)
              onRefresh()
            }
          },
        },
      ])
    },
    [onDelete, onRefresh]
  )

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View style={[styles.sheet, { backgroundColor: colors.bgSecondary, paddingTop: insets.top + 12 }]}>
          <View style={[styles.handleRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>سجل المحادثات</Text>
            <View style={styles.headerRight}>
              <Pressable onPress={onNew} hitSlop={8} style={[styles.headerIconBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="add" size={18} color="#fff" />
              </Pressable>
              <Pressable onPress={onOpenSettings} hitSlop={8} style={[styles.headerIconBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="settings-outline" size={18} color={colors.textPrimary} />
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} style={[styles.headerIconBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث في المحادثات..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={6}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && (
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={30} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {sessions.length === 0 ? 'لا توجد محادثات بعد — ابدأ محادثة جديدة' : 'لا نتائج مطابقة'}
                </Text>
              </View>
            )}
            {filtered.map((s) => {
              const active = s.id === activeId
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onSelect(s.id)}
                  style={({ pressed }) => [
                    styles.item,
                    {
                      backgroundColor: active ? colors.accentSurface : colors.bgCard,
                      borderColor: active ? colors.accent : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={styles.itemMain}>
                    <View style={styles.itemHead}>
                      <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.textPrimary }]}>{s.title}</Text>
                      <Text style={[styles.itemTime, { color: colors.textMuted }]}>{timeLabel(s.updatedAt)}</Text>
                    </View>
                    <View style={styles.itemSub}>
                      {(s.providerLabel || s.model) && (
                        <Text numberOfLines={1} style={[styles.itemMeta, { color: colors.textSecondary }]}>
                          {[s.providerLabel, s.model].filter(Boolean).join(' • ')}
                        </Text>
                      )}
                      <Text style={[styles.itemCount, { color: colors.textMuted }]}>{s.messageCount} رسالة</Text>
                    </View>
                  </View>
                  {active && (
                    <Text style={[styles.activeTag, { color: colors.accent }]}>الحالية</Text>
                  )}
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation()
                      confirmDelete(s)
                    }}
                    hitSlop={8}
                    style={[styles.deleteBtn, { backgroundColor: colors.errorSurface, opacity: deleting === s.id ? 0.5 : 1 }]}
                  >
                    {deleting === s.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    )}
                  </Pressable>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '78%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerIconBtn: { width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 24 },
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: spacing.sm },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', fontFamily: 'Tajawal_400Regular' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  itemMain: { flex: 1, gap: 4 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  itemTime: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  itemSub: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemMeta: { flex: 1, fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  itemCount: { fontSize: fontSize.xs, fontFamily: 'Tajawal_400Regular' },
  activeTag: { fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  deleteBtn: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.full,
  },
  primaryBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  iconBtn: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
})