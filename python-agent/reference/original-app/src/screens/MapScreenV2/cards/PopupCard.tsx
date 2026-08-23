import React from "react"
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"

type Props = {
  title?: string
  icon?: string
  accent?: string
  onClose?: () => void
  hint?: string
  children: React.ReactNode
  maxWidth?: number
  maxHeight?: number
  scrollable?: boolean
  style?: ViewStyle
}

export function PopupCard({
  title, icon, accent = "#0F172A", onClose, hint, children,
  maxWidth, maxHeight, scrollable, style,
}: Props) {
  const { width, height } = useWindowDimensions()
  const mw = maxWidth ?? Math.min(width - 24, 420)
  const mh = maxHeight ?? Math.min(height * 0.42, 360)
  const bodyH = mh - (title || onClose ? 40 : 0) - (hint ? 22 : 0)

  return (
    <View style={[s.card, { maxWidth: mw, maxHeight: mh, borderColor: accent + "33" }, style]}>
      {(title || onClose) && (
        <View style={s.header}>
          {title && (
            <View style={s.titleWrap}>
              {icon && (
                <View style={[s.iconWrap, { backgroundColor: accent + "18" }]}>
                  <Ionicons name={icon as any} size={14} color={accent} />
                </View>
              )}
              <Text style={[s.title, { color: accent }]}>{title}</Text>
            </View>
          )}
          {onClose && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose() }}
              hitSlop={10}
              style={s.closeBtn}
            >
              <Ionicons name="close" size={15} color="#64748B" />
            </Pressable>
          )}
        </View>
      )}
      {scrollable ? (
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: bodyH }}
          contentContainerStyle={s.body}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={s.body}>{children}</View>
      )}
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  iconWrap: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  closeBtn: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  body: { padding: 12 },
  hint: { fontSize: 9, fontFamily: "Tajawal_500Medium", color: "#94A3B8", textAlign: "center", paddingBottom: 10 },
})
