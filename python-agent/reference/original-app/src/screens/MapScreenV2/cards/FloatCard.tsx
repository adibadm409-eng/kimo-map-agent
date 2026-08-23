import React from "react"
import { View, StyleSheet, useWindowDimensions } from "react-native"

type Props = {
  children: React.ReactNode
}

export function FloatCard({ children }: Props) {
  const { width } = useWindowDimensions()
  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={[s.inner, { maxWidth: width - 24 }]} pointerEvents="box-none">
        <View pointerEvents="auto">{children}</View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: "50%",
    marginBottom: 34,
    alignItems: "center",
  },
  inner: { alignSelf: "stretch", alignItems: "center" },
})
