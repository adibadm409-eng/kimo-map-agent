import { View, Text, TextInput, TouchableOpacity, StyleSheet, type ViewStyle, type StyleProp } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize, shadows } from '../../theme/tokens'

interface CardProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}

export function Card({ children, style, onPress }: CardProps) {
  const { colors } = useTheme()
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }, style]}
      >
        {children}
      </TouchableOpacity>
    )
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }, style]}>
      {children}
    </View>
  )
}

interface BadgeProps {
  label: string
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const { colors } = useTheme()
  const variantColors: Record<string, { bg: string; text: string }> = {
    success: { bg: colors.successSurface, text: colors.success },
    warning: { bg: colors.warningSurface, text: colors.warning },
    error: { bg: colors.errorSurface, text: colors.error },
    info: { bg: colors.infoSurface, text: colors.info },
    neutral: { bg: colors.surface, text: colors.textSecondary },
  }
  const c = variantColors[variant]
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{label}</Text>
    </View>
  )
}

interface BadgeByValueProps {
  label: string
  value: string
}

const successValues = ['for_sale', 'accepted', 'active', 'completed', 'seller']
const warningValues = ['pending', 'countered', 'draft', 'rented']
const errorValues = ['sold', 'rejected', 'cancelled']
const infoValues = ['buy_offer', 'scheduled', 'social_media', 'buyer']

export function StatusBadge({ label, value }: BadgeByValueProps) {
  let variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral'
  if (successValues.includes(value)) variant = 'success'
  else if (warningValues.includes(value)) variant = 'warning'
  else if (errorValues.includes(value)) variant = 'error'
  else if (infoValues.includes(value)) variant = 'info'
  return <Badge label={label} variant={variant} />
}

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'outline'
  icon?: React.ReactNode
  size?: 'sm' | 'md'
  style?: StyleProp<ViewStyle>
  disabled?: boolean
}

export function Button({ title, onPress, variant = 'primary', icon, size = 'md', style, disabled }: ButtonProps) {
  const { colors } = useTheme()
  const height = size === 'sm' ? 36 : 44
  const pad = size === 'sm' ? 14 : 20

  let bg = colors.accent
  let color = '#FFFFFF'
  let borderC = 'transparent'

  if (variant === 'ghost') {
    bg = colors.surface
    color = colors.textSecondary
    borderC = colors.border
  } else if (variant === 'outline') {
    bg = 'transparent'
    color = colors.textPrimary
    borderC = colors.border
  }

  if (disabled) {
    bg = colors.surface
    color = colors.textMuted
    borderC = colors.border
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[styles.btn, { height, paddingHorizontal: pad, backgroundColor: bg, borderColor: borderC, borderRadius: radius.full }, style]}
    >
      {icon}
      <Text style={[styles.btnText, { color, fontSize: size === 'sm' ? 12 : 13 }]}>{title}</Text>
    </TouchableOpacity>
  )
}

interface InputProps {
  label: string
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  multiline?: boolean
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address'
  editable?: boolean
  onEndEditing?: () => void
}

export function Input({ label, value, onChangeText, placeholder, multiline, keyboardType = 'default', editable, onEndEditing }: InputProps) {
  const { colors } = useTheme()
  return (
    <View style={styles.inputWrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        editable={editable}
        onEndEditing={onEndEditing}
        keyboardType={keyboardType}
        style={[styles.input, {
          backgroundColor: editable === false ? colors.surface : colors.surface,
          borderColor: colors.border,
          color: editable === false ? colors.textMuted : colors.textPrimary,
          minHeight: multiline ? 80 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        }]}
      />
    </View>
  )
}


const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  btnText: {
    fontWeight: '600',
    fontFamily: 'Tajawal_400Regular',
  },
  inputWrap: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
  },
})
