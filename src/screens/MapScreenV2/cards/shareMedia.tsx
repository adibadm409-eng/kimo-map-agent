import React, { useEffect, useState } from "react"
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, Share, Alert, useWindowDimensions, Platform } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { Image } from "expo-image"
import * as Sharing from "expo-sharing"
import * as Clipboard from "expo-clipboard"
import { TYPE_LABELS } from "../../../types"
import { useVideoPlayer, VideoView, type VideoThumbnail } from "expo-video"

const PROP_STATUS: Record<string, string> = { for_sale: "للبيع", sold: "مُباع", rented: "مؤجر", pending: "تحت المعالجة" }
const WP_CATS: Record<string, string> = {
  general: "عام", property: "عقار", office: "مكتب",
  landmark: "معلم", client: "عميل", site_visit: "زيارة موقع",
}

export type PinItem = {
  kind: "property" | "waypoint"
  id: string
  name: string
  data: any
}

export type MediaItem = { uri: string; video: boolean }

export function parseMediaList(data: any): MediaItem[] {
  if (!data) return []
  const raw = data.media
  if (!raw) return []
  let list: string[] = []
  try { list = typeof raw === "string" ? JSON.parse(raw) : raw } catch { return [] }
  if (!Array.isArray(list)) return []
  const isVideo = (u: string) => /\.(mp4|mov|webm|3gp|m4v|mkv)$/i.test(u)
  return list.filter((u) => typeof u === "string" && u).map((u) => ({ uri: u, video: isVideo(u) }))
}

export function fmtPrice(v: number): string {
  if (!v || isNaN(v)) return ""
  return Number(v).toLocaleString("en-US") + " ر.ي"
}

export function pinKindText(kind: "property" | "waypoint", data: any): string {
  return kind === "property"
    ? TYPE_LABELS[data.type] || data.type
    : WP_CATS[data.category] || data.category || "علامة"
}

export function pinStatusText(kind: "property" | "waypoint", data: any): string {
  return kind === "property" ? PROP_STATUS[data.status] || data.status : ""
}

function VideoThumb({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.muted = true; p.pause() })
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null)

  useEffect(() => {
    let active = true
    if (Platform.OS === 'web') return () => { active = false }
    player.generateThumbnailsAsync(0.1, { maxWidth: 320 }).then(([result]) => {
      if (active && result) setThumbnail(result)
    }).catch(() => {})
    return () => { active = false }
  }, [player])

  if (thumbnail) return <Image source={thumbnail as any} style={s.thumbImg} contentFit="cover" transition={150} />
  return <VideoView player={player} style={s.videoThumbVideo} contentFit="cover" nativeControls={false} />
}

/* ─── شريط الوسائط الأفقي (معاينة صغيرة) ─────────────────────────────── */
export function MediaStrip({ item, media, onMedia }: { item: PinItem; media: MediaItem[]; onMedia: (i: number) => void }) {
  if (!media.length) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
      {media.map((m, i) => (
        <Pressable key={i} onPress={() => { Haptics.selectionAsync(); onMedia(i) }} style={s.thumb}>
          {m.video ? (
            <View style={s.videoThumb}>
              <VideoThumb uri={m.uri} />
              <View style={s.videoBadge}><Ionicons name="videocam" size={12} color="#FFF" /><Text style={s.videoThumbText}>فيديو</Text></View>
            </View>
          ) : (
            <Image source={{ uri: m.uri }} style={s.thumbImg} contentFit="cover" transition={150} />
          )}
          <View style={s.thumbPlay}><Ionicons name="expand-outline" size={10} color="#FFF" /></View>
        </Pressable>
      ))}
    </ScrollView>
  )
}

/* ─── معاينة الوسائط بملء الشاشة ─────────────────────────────────────── */
export function MediaPreview({ media, index, onClose }: { media: MediaItem[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index)
  useEffect(() => setI(index), [index])
  const cur = media[i]
  const { height } = useWindowDimensions()
  const player = useVideoPlayer(cur && cur.video ? cur.uri : "", (p) => { p.loop = true; p.play() })

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.previewWrap}>
        <View style={s.previewTop}>
          <Text style={s.previewCount}>{i + 1} / {media.length}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق معاينة الوسائط" onPress={onClose} hitSlop={10} style={s.previewClose}>
            <Ionicons name="close" size={20} color="#FFF" />
          </Pressable>
        </View>
        <View style={s.previewBody}>
          {cur.video ? (
            <VideoView player={player} style={{ width: "100%", height: height * 0.5 }} contentFit="contain" nativeControls />
          ) : (
            <Image source={{ uri: cur.uri }} style={{ width: "100%", height: height * 0.55 }} contentFit="contain" />
          )}
        </View>
        <View style={s.previewNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="الوسيط السابق" disabled={i === 0} onPress={() => setI(i - 1)} hitSlop={8} style={[s.navBtn, i === 0 && { opacity: 0.3 }]}>
            <Ionicons name="chevron-forward" size={22} color="#FFF" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="الوسيط التالي" disabled={i === media.length - 1} onPress={() => setI(i + 1)} hitSlop={8} style={[s.navBtn, i === media.length - 1 && { opacity: 0.3 }]}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

/* ─── مشغّل الفيديو مصغّراً داخل البطاقة ─────────────────────────────── */
export function InlineVideoPlayer({ uri, title, onFullscreen, onClose }: {
  uri: string
  title?: string
  onFullscreen: () => void
  onClose: () => void
}) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.pause() })
  return (
    <View style={s.inlineBox}>
      <View style={s.inlineHead}>
        <View style={{ flex: 1 }} />
        <Text style={s.inlineTitle} numberOfLines={1}>{title || "فيديو"}</Text>
        <Pressable onPress={onFullscreen} hitSlop={8} style={s.inlineBtn}>
          <Ionicons name="expand-outline" size={15} color="#0F172A" />
        </Pressable>
        <Pressable onPress={onClose} hitSlop={8} style={s.inlineBtn}>
          <Ionicons name="close" size={15} color="#0F172A" />
        </Pressable>
      </View>
      <VideoView player={player} style={{ width: "100%", height: 190 }} contentFit="contain" nativeControls />
    </View>
  )
}

/* ─── لوحة المشاركة: اختر الحقول والوسائط ثم شارك ───────────────────── */
const FIELD_OPTS: { key: string; label: string }[] = [
  { key: "name", label: "الاسم" },
  { key: "type", label: "النوع" },
  { key: "price", label: "السعر" },
  { key: "status", label: "الحالة" },
  { key: "area", label: "المساحة" },
  { key: "address", label: "العنوان" },
  { key: "owner", label: "المالك" },
  { key: "phone", label: "الهاتف" },
  { key: "desc", label: "الوصف" },
  { key: "coords", label: "الإحداثيات" },
]

export function ShareSheet({ item, media, onClose }: { item: PinItem; media: MediaItem[]; onClose: () => void }) {
  const data: any = item.data
  const isProp = item.kind === "property"
  const [fields, setFields] = useState<Set<string>>(new Set(["name", "type", "price", "status", "area", "phone", "coords"]))
  const [selMedia, setSelMedia] = useState<Set<number>>(new Set(media.map((_, i) => i)))
  const [busy, setBusy] = useState(false)

  const toggleField = (k: string) => {
    Haptics.selectionAsync()
    setFields((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  const toggleMedia = (i: number) => {
    Haptics.selectionAsync()
    setSelMedia((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  }

  const buildText = () => {
    const L: string[] = []
    const push = (k: string, label: string, value: string) => { if (fields.has(k) && value) L.push(`${label}: ${value}`) }
    push("name", "العقار", item.name)
    push("type", "النوع", pinKindText(item.kind, data))
    if (fields.has("price")) L.push(`السعر: ${fmtPrice(Number(data.price))}`)
    push("status", "الحالة", pinStatusText(item.kind, data))
    push("area", "المساحة", `${data.area || data.area_sqm || ""} م²`)
    push("address", "العنوان", data.address)
    push("owner", "المالك", data.owner_name)
    push("phone", "الهاتف", data.owner_phone || data.owner_contact)
    push("desc", "الوصف", data.description)
    if (fields.has("coords") && data.latitude) {
      L.push(`الموقع: https://maps.google.com/?q=${data.latitude},${data.longitude}`)
    }
    const lines = L.filter(Boolean)
    if (!lines.length) return ""
    const head = isProp ? "🏠 عقار للبيع" : "📍 معلومة موقع"
    return `${head}\n${lines.join("\n")}`
  }

  const shareAll = async () => {
    const msg = buildText()
    const idxs = [...selMedia]
    const hasText = !!msg
    const hasMedia = idxs.length > 0
    if (!hasText && !hasMedia) { Alert.alert("اختر حقلاً أو وسائط على الأقل"); return }
    if (!(await Sharing.isAvailableAsync())) { Alert.alert("المشاركة غير متاحة على هذا الجهاز"); return }
    setBusy(true)
    try {
      if (hasMedia) {
        for (let k = 0; k < idxs.length; k++) {
          const m = media[idxs[k]]
          if (k > 0) { await new Promise((r) => setTimeout(r, 600)) }
          const ext = m.uri.split('.').pop()?.toLowerCase() || ''
          const mime = m.video ? 'video/mp4'
            : ext === 'png' ? 'image/png'
            : ext === 'webp' ? 'image/webp'
            : ext === 'heic' || ext === 'heif' ? 'image/heic'
            : 'image/jpeg'
          const uti = m.video ? 'public.movie'
            : ext === 'png' ? 'public.png'
            : 'public.jpeg'
          await Sharing.shareAsync(m.uri, {
            mimeType: mime,
            dialogTitle: `مشاركة — ${item.name}`,
            UTI: uti,
          })
        }
      }
      if (hasText) {
        await new Promise((r) => setTimeout(r, 400))
        await Share.share({ message: msg, title: item.name })
      }
    } catch {}
    setBusy(false)
  }

  const copyText = async () => {
    const msg = buildText()
    if (!msg) { Alert.alert("اختر حقلاً واحداً على الأقل"); return }
    await Clipboard.setStringAsync(msg)
    Alert.alert("تم النسخ", "يمكنك لصق المعلومات في واتساب مباشرةً")
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.shareOverlay}>
        <Pressable style={s.shareBackdrop} onPress={onClose} />
        <View style={s.shareSheet}>
          <View style={s.shareHead}>
            <Text style={s.shareTitle} numberOfLines={1}>مشاركة «{item.name}»</Text>
            <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <Ionicons name="close" size={16} color="#64748B" />
            </Pressable>
          </View>

          <Text style={s.sectionLabel}>معلومات للنص</Text>
          <View style={s.fieldsWrap}>
            {FIELD_OPTS.map((f) => {
              const on = fields.has(f.key)
              return (
                <Pressable key={f.key} onPress={() => toggleField(f.key)} style={[s.fieldChip, on && s.fieldChipOn]}>
                  <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={13} color={on ? "#2563EB" : "#94A3B8"} />
                  <Text style={[s.fieldChipText, { color: on ? "#2563EB" : "#64748B" }]}>{f.label}</Text>
                </Pressable>
              )
            })}
          </View>

          {media.length > 0 && (
            <>
              <Text style={s.sectionLabel}>الصور والفيديو ({selMedia.size})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.selStrip}>
                {media.map((m, i) => {
                  const on = selMedia.has(i)
                  return (
                    <Pressable key={i} onPress={() => toggleMedia(i)} style={[s.selThumb, on && { borderColor: "#2563EB", borderWidth: 2 }]}>
                      {m.video ? (
                        <View style={[s.selVideo, { opacity: on ? 1 : 0.45 }]}>
                          <Ionicons name="videocam" size={16} color="#FFF" />
                        </View>
                      ) : (
                        <Image source={{ uri: m.uri }} style={[s.selImg, { opacity: on ? 1 : 0.45 }]} contentFit="cover" />
                      )}
                      <View style={[s.selCheck, { backgroundColor: on ? "#2563EB" : "rgba(0,0,0,0.35)" }]}>
                        <Ionicons name="checkmark" size={10} color="#FFF" />
                      </View>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </>
          )}

          {/* معاينة حية — ترى ما ستُرسله بالضبط قبل النشر */}
          <Text style={s.sectionLabel}>معاينة النص المرسل</Text>
          <View style={s.previewBox}>
            <Text style={s.previewText} numberOfLines={4}>{buildText() || "اختر حقلاً واحداً على الأقل..."}</Text>
          </View>

          <View style={s.shareActions}>
            <Pressable onPress={copyText} style={[s.actionBtn, { backgroundColor: "#475569" }]}>
              <Ionicons name="copy-outline" size={15} color="#FFF" />
              <Text style={s.actionText}>نسخ</Text>
            </Pressable>
            <Pressable onPress={shareAll} disabled={busy} style={[s.actionBtn, { backgroundColor: "#25D366", flex: 1 }]}>
              <Ionicons name="logo-whatsapp" size={15} color="#FFF" />
              <Text style={s.actionText}>{busy ? "جاري المشاركة..." : "مشاركة عبر واتساب"}</Text>
            </Pressable>
          </View>
          <Pressable onPress={shareAll} disabled={busy} style={[s.actionBtn, { backgroundColor: "#10B981", marginTop: 8 }]}>
            <Ionicons name="share-social-outline" size={15} color="#FFF" />
            <Text style={s.actionText}>مشاركة عبر التطبيقات…</Text>
          </Pressable>
          <Text style={s.hint}>اختر الحقول والوسائط المطلوبة فقط، ثم شارك مباشرة — لا حاجة لإعادة كتابة بيانات العقار في كل مرة.</Text>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  strip: { gap: 8, paddingVertical: 6 },
  thumb: { width: 84, height: 58, borderRadius: 10, overflow: "hidden", backgroundColor: "#F1F5F9" },
  thumbImg: { width: "100%", height: "100%" },
    videoThumb: {
 flex: 1, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: "#1E293B" },
    videoThumbVideo: { ...StyleSheet.absoluteFillObject },
  videoBadge: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(15,23,42,0.78)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  videoThumbText: {
 fontSize: 9, fontFamily: "Tajawal_700Bold", color: "#FFF" },
  thumbPlay: { position: "absolute", left: 4, bottom: 4, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" },

  previewWrap: { flex: 1, backgroundColor: "rgba(2,6,23,0.96)" },
  previewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 46 },
  previewCount: { color: "#CBD5E1", fontSize: 12, fontFamily: "monospace", direction: "ltr" },
  previewClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  previewBody: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  previewNav: { flexDirection: "row", justifyContent: "center", gap: 28, paddingBottom: 40 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },

  shareOverlay: { flex: 1, justifyContent: "flex-end" },
  shareBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  shareSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: "78%" },
  shareHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  shareTitle: { flex: 1, fontSize: 15, fontFamily: "Tajawal_700Bold", color: "#0F172A", textAlign: "right" },
  sectionLabel: { fontSize: 11, fontFamily: "Tajawal_700Bold", color: "#475569", marginTop: 8, marginBottom: 6 },
  fieldsWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  fieldChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  fieldChipOn: { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" },
  fieldChipText: { fontSize: 11, fontFamily: "Tajawal_700Bold" },
  selStrip: { gap: 8, paddingVertical: 6 },
  selThumb: { width: 64, height: 64, borderRadius: 10, overflow: "hidden", borderWidth: 1.5, borderColor: "transparent" },
  selImg: { width: "100%", height: "100%" },
  selVideo: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E293B" },
  selCheck: { position: "absolute", left: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  shareActions: { flexDirection: "row-reverse", gap: 8, marginTop: 14 },
  actionBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 999 },
  actionText: { color: "#FFF", fontSize: 12, fontFamily: "Tajawal_700Bold" },
  hint: { fontSize: 9, fontFamily: "Tajawal_400Regular", color: "#94A3B8", textAlign: "center", marginTop: 8 },
  closeBtn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  previewBox: { marginTop: 4, padding: 10, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  previewText: { fontSize: 11, fontFamily: "Tajawal_400Regular", color: "#334155", lineHeight: 17, textAlign: "right" },
  inlineBox: { borderRadius: 12, overflow: "hidden", backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#1E293B", marginBottom: 8 },
  inlineHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#FFFFFF" },
  inlineTitle: { fontSize: 11, fontFamily: "Tajawal_700Bold", color: "#0F172A", flex: 1, textAlign: "right" },
  inlineBtn: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
})