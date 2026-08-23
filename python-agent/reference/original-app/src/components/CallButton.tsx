import { Linking, Pressable, StyleSheet, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from 'react-native'

interface CallButtonProps extends Omit<PressableProps, 'onPress' | 'style'> {
  phone?: string | null
  compact?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  iconColor?: string
  iconSize?: number
  label?: string
}

function dialablePhone(phone: string): string {
  const normalized = phone.trim().replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  if (normalized.startsWith('+')) return `+${normalized.slice(1).replace(/\D/g, '')}`
  return normalized.replace(/\D/g, '')
}

export function CallButton({
  phone,
  compact = false,
  style,
  textStyle,
  iconColor = '#16A34A',
  iconSize = 16,
  label,
  ...pressableProps
}: CallButtonProps) {
  const displayPhone = phone?.trim() ?? ''
  const number = dialablePhone(displayPhone)
  if (!displayPhone || !number) return null

  const openDialer = async () => {
    try {
      await Linking.openURL(`tel:${number}`)
    } catch {
      // لا يوجد تطبيق اتصال على بعض المنصات مثل الويب؛ لا نكسر الشاشة بسبب ذلك.
    }
  }

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityLabel={label || `الاتصال بالرقم ${displayPhone}`}
      accessibilityHint="يفتح تطبيق الاتصال مباشرة"
      onPress={(event) => { event.stopPropagation(); void openDialer() }}
      hitSlop={pressableProps.hitSlop ?? { top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => [styles.button, compact ? [styles.compact, { borderColor: `${iconColor}55`, backgroundColor: `${iconColor}14` }] : styles.full, style, pressed && styles.pressed]}
    >
      <Ionicons name="call-outline" size={iconSize} color={iconColor} />
      {!compact ? <Text style={[styles.text, textStyle]} numberOfLines={1}>{label || displayPhone}</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  compact: { width: 30, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  full: { minHeight: 30 },
  text: { fontSize: 14 },
  pressed: { opacity: 0.55 },
})
