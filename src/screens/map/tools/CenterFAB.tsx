import React, { useEffect, useRef, useState } from "react"
import { View, Text, StyleSheet, Pressable, Modal, Animated, Easing, Dimensions, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useTheme } from "../../../theme/ThemeContext"
import { TOOL_FAB_ITEMS } from "../tools/registry"
import type { DrawMode } from "../tools/types"

const { width: SCREEN_W } = Dimensions.get("window")
// Radial config — أزرار دائرية موزعة حول الزر المركزي
const RADIUS = 78
const FAB_SIZE = 60
const ITEM_SIZE = 50

type Props = {
  activeMode: DrawMode
  onPick: (m: DrawMode) => void
  onQuickAction: () => void
  frozen?: boolean
}

export function CenterFAB({ activeMode, onPick, onQuickAction, frozen }: Props) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  const scale = useRef(new Animated.Value(0)).current
  const rotate = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0, duration: 180, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [open])

  const handleOpen = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setOpen(true)
  }
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setOpen(false)
  }
  const handlePick = (m: DrawMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
    setOpen(false)
    onPick(m)
  }
  const handleQuick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onQuickAction()
  }
  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    setOpen(true)
  }

  const activeTool = TOOL_FAB_ITEMS.find((t) => t.mode === activeMode) || TOOL_FAB_ITEMS[0]
  const fabColor = activeMode !== "none" ? activeTool.color : colors.accent

  const rotation = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "135deg"] })

  return (
    <>
      {/* Modal overlay for backdrop tap-to-close */}
      <Modal visible={open && !frozen} transparent animationType="none" onRequestClose={handleClose}>
        <Pressable style={s.backdrop} onPress={handleClose}>
          <Animated.View style={[s.radialGroup, { opacity: fade }]}>
            {TOOL_FAB_ITEMS.map((item, idx) => {
              const angle = (idx / TOOL_FAB_ITEMS.length) * 2 * Math.PI - Math.PI / 2
              const dx = Math.cos(angle) * RADIUS
              const dy = Math.sin(angle) * RADIUS
              return (
                <Animated.View
                  key={item.mode}
                  style={[
                    s.radialItemWrap,
                    {
                      transform: [
                        { translateX: dx },
                        { translateY: dy },
                        { scale: scale },
                      ],
                    },
                  ]}
                >
                  <Pressable onPress={() => handlePick(item.mode)} style={({ pressed }) => ([
                    s.radialItem,
                    {
                      backgroundColor: item.color,
                      width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: ITEM_SIZE / 2,
                      opacity: pressed ? 0.85 : 1,
                      transform: [{ scale: pressed ? 0.92 : 1 }],
                      borderColor: activeMode === item.mode ? "#FFF" : "transparent",
                      borderWidth: 2,
                    },
                  ])}>
                    <Ionicons name={item.icon as any} size={22} color="#FFF" />
                  </Pressable>
                  <View style={[s.radialLabel, { backgroundColor: item.color }]}>
                    <Text style={s.radialLabelText}>{item.label}</Text>
                  </View>
                </Animated.View>
              )
            })}
          </Animated.View>

          {/* Center FAB above the radial — close rotate */}
          <Animated.View style={[s.fabCenter, { transform: [{ rotate: rotation }] }]} pointerEvents="none">
            <View style={[s.fabInner, { backgroundColor: "#0F172A" }]}>
              <Ionicons name="close" size={26} color="#FFF" />
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Persistent center crosshair + FAB */}
      <View style={s.persistentWrap} pointerEvents="box-none">
        <Animated.View style={[s.fabCenter, { transform: [{ rotate: rotation }] }]}>
          <Pressable
            delayLongPress={350}
            onPress={open ? handleClose : handleQuick}
            onLongPress={handleLongPress}
            style={({ pressed }) => ([
              s.fabInner,
              { backgroundColor: fabColor, opacity: frozen ? 0.5 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] },
            ])}
          >
            <Ionicons
              name={(activeMode === "none" ? "add" : activeTool.icon) as any}
              size={26}
              color="#FFF"
            />
          </Pressable>
        </Animated.View>
      </View>
    </>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  radialGroup: { alignItems: "center", justifyContent: "center", position: "absolute", left: SCREEN_W / 2 - FAB_SIZE / 2, top: 0, bottom: 0 },
  radialItemWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  radialItem: { alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  radialLabel: { position: "absolute", top: ITEM_SIZE + 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  radialLabelText: { color: "#FFF", fontSize: 11, fontFamily: "Tajawal_700Bold" },
  persistentWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 90 },
  fabCenter: { width: FAB_SIZE, height: FAB_SIZE, alignItems: "center", justifyContent: "center" },
  fabInner: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: "center", justifyContent: "center", elevation: 12, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, borderWidth: 3, borderColor: "rgba(255,255,255,0.25)" },
})
