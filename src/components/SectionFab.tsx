import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'

/** زر إضافة عائم عالي الجودة للأقسام الرئيسية. يطفو فوق شريط التبويب السفلي
 *  بمسافة آمنة، بتصميم دائري نظيف مع ظل ناعم وحلقة خفيفة. */
export function SectionFab({
  onPress,
  label,
  icon = 'add',
}: {
  onPress: () => void
  label?: string
  icon?: any
}) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'إضافة'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom: insets.bottom + 56,
          right: 16,
          backgroundColor: colors.accent,
          opacity: pressed ? 0.92 : 1,
          shadowColor: colors.accent,
        },
      ]}
    >
      <Ionicons name={icon} size={26} color="#fff" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    elevation: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
})
