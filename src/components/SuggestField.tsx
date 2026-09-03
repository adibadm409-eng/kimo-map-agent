import React, { useState, useRef } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { buildContactDirectory, matchContacts, SOURCE_LABELS, type DirectoryContact } from '../utils/contactDirectory'

export interface PickedContact {
  name: string
  phone: string
}

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  field: 'name' | 'phone'
  onPick: (c: PickedContact) => void
  placeholder?: string
  keyboardType?: 'default' | 'phone-pad'
  editable?: boolean
}

const SOURCE_ICONS: Record<string, string> = {
  client: 'person-outline',
  owner: 'home-outline',
  broker: 'briefcase-outline',
}

/** خانة اسم/هاتف بقائمة منسدلة أنيقة تقترح الأسماء المشابهة أثناء الكتابة من الدليل الموحد. */
export default function SuggestField({ label, value, onChange, field, onPick, placeholder, keyboardType, editable = true }: Props) {
  const { colors } = useTheme()
  const [directory, setDirectory] = useState<DirectoryContact[] | null>(null)
  const [focused, setFocused] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function ensureDirectory() {
    if (!directory) {
      void buildContactDirectory().then(setDirectory).catch(() => {})
    }
  }

  const matches = focused && directory && value.trim().length >= 1 ? matchContacts(directory, value) : []

  function pick(c: DirectoryContact) {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    onPick({ name: c.name, phone: c.phone })
    setFocused(false)
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current)
          ensureDirectory()
          setFocused(true)
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 150)
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        editable={editable}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: focused ? colors.accent : colors.border, color: colors.textPrimary }]}
      />
      {matches.length > 0 ? (
        <View style={[styles.dropdown, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          {matches.map((c) => {
            const initials = (c.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('') || '?'
            return (
              <Pressable
                key={`${c.source}:${c.refId}:${c.name}:${c.phone}`}
                onPress={() => pick(c)}
                style={({ pressed }) => [styles.item, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.surface }]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.accentSurface }]}>
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
                </View>
                <View style={styles.itemMain}>
                  <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{c.name || 'بدون اسم'}</Text>
                  {c.phone ? <Text style={[styles.itemPhone, { color: colors.textSecondary }]} numberOfLines={1}>{c.phone}</Text> : null}
                </View>
                <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name={SOURCE_ICONS[c.source] as any} size={12} color={colors.accent} />
                  <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{SOURCE_LABELS[c.source]}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, zIndex: 50 },
  label: { fontSize: fontSize.md, fontWeight: '500', fontFamily: 'Tajawal_500Medium' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right', minHeight: 48 },
  dropdown: {
    position: 'absolute', top: 78, left: 0, right: 0,
    borderWidth: 1, borderRadius: radius.md, overflow: 'hidden',
    elevation: 8, zIndex: 100,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: 'Tajawal_700Bold', textAlign: 'right' },
  itemPhone: { fontSize: 11, fontFamily: 'Tajawal_400Regular', textAlign: 'right', marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Tajawal_500Medium' },
})
