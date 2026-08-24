import React, { useMemo, useState } from "react"
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { spacing, fontSize, radius, SCREEN_HEIGHT as SH } from "../../../theme/tokens"
import { toDMS, fmtDistCalc } from "../../map/utils"
import { markerColor } from "../../map/constants"
import type { DetailItem } from "../types"
import { TYPE_LABELS } from "../../../types"
import { CallButton } from "../../../components/CallButton"
import { parseMediaList, MediaStrip, MediaPreview, InlineVideoPlayer, ShareSheet, type PinItem, type MediaItem } from "./shareMedia"

const PROP_STATUS: Record<string, string> = { for_sale: "للبيع", sold: "مُباع", rented: "مؤجر", pending: "تحت المعالجة" }

const WP_CATS: Record<string, string> = {
  general: "عام", property: "عقار", office: "مكتب",
  landmark: "معلم", client: "عميل", site_visit: "زيارة موقع",
}

const AREA_CATS: Record<string, string> = {
  general: "عام", residential: "سكني", commercial: "تجاري",
  agricultural: "زراعي", industrial: "صناعي",
}

type Props = {
  detail: DetailItem
  onClose: () => void
  onDelete: (id: string, kind: "property" | "waypoint" | "area") => void
  onNavigate: (lat: number, lng: number, delta: number) => void
  onOpenProperty?: (id: string) => void
}

export function DetailCard({ detail, onClose, onDelete, onNavigate, onOpenProperty }: Props) {
  if (!detail) return null

  return (
    <Modal visible={detail !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          {detail.kind === "property" && <PropertyDetail detail={detail} onClose={onClose} onDelete={onDelete} onOpenProperty={onOpenProperty} />}
          {detail.kind === "waypoint" && <WaypointDetail detail={detail} onClose={onClose} onDelete={onDelete} onNavigate={onNavigate} />}
          {detail.kind === "area" && <AreaDetail detail={detail} onClose={onClose} onDelete={onDelete} />}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function PropertyDetail({ detail, onClose, onDelete, onOpenProperty }: any) {
  const data: any = detail.data
  const item: PinItem = { kind: "property", id: detail.id, name: detail.name, data }
  const media = useMemo(() => parseMediaList(data), [data])
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const [inlineVideo, setInlineVideo] = useState<MediaItem | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const onMedia = (i: number) => {
    Haptics.selectionAsync()
    const m = media[i]
    if (m && m.video) setInlineVideo(m)
    else setPreviewIdx(i)
  }
  return (
    <>
      <Pressable onPress={(e) => e.stopPropagation()} style={[s.header, { backgroundColor: markerColor(data.status) }]}>
        <Text style={s.title}>{data.name}</Text>
        <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color="#FFF" /></Pressable>
      </Pressable>
      <ScrollView style={{ maxHeight: SH * 0.4 }} bounces nestedScrollEnabled>
        <Row icon="business-outline" label="النوع" value={TYPE_LABELS[data.type] || data.type} />
        <Row icon="pricetag-outline" label="السعر" value={`${Number(data.price).toLocaleString()} ر.ي`} />
        <Row icon="checkmark-circle-outline" label="الحالة" value={PROP_STATUS[data.status] || data.status} />
        <Row icon="resize-outline" label="المساحة" value={`${data.area} م²`} />
        <Row icon="location-outline" label="العنوان" value={data.address || "—"} />
        <Row icon="person-outline" label="المالك" value={data.owner_name || "—"} />
        {data.owner_phone ? <PhoneRow value={data.owner_phone} /> : <Row icon="call-outline" label="الهاتف" value="—" />}
        {data.description ? (
          <View style={s.descBox}>
            <Text style={s.descText}>{data.description}</Text>
          </View>
        ) : null}
        {inlineVideo && (
          <View style={{ margin: 12, marginBottom: 4 }}>
            <InlineVideoPlayer
              uri={inlineVideo.uri}
              title={data.name}
              onFullscreen={() => { const i = media.indexOf(inlineVideo); setInlineVideo(null); setPreviewIdx(i >= 0 ? i : 0) }}
              onClose={() => setInlineVideo(null)}
            />
          </View>
        )}
        <MediaStrip item={item} media={media} onMedia={onMedia} />
        <View style={s.coordsBox}>
          <Text style={s.coordsText}>{data.latitude.toFixed(6)}, {data.longitude.toFixed(6)}</Text>
        </View>
      </ScrollView>
      <Pressable onPress={(e) => e.stopPropagation()} style={s.actions}>
        {onOpenProperty && (
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onOpenProperty(detail.id) }} style={[s.btn, { backgroundColor: "#2563EB", flex: 1 }]}>
            <Ionicons name="open-outline" size={16} color="#FFF" />
            <Text style={s.btnText}>فتح العقار</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { Haptics.selectionAsync(); setShareOpen(true) }} style={[s.btn, { backgroundColor: "#0F172A", flex: 0.8 }]}>
          <Ionicons name="share-social-outline" size={16} color="#FFF" />
          <Text style={s.btnText}>مشاركة</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert(
            "حذف العقار",
            `سيتم حذف «${data.name}»`,
            [
              { text: "إلغاء", style: "cancel" as const },
              { text: "حذف", style: "destructive" as const, onPress: () => onDelete(detail.id, "property") },
            ],
          )}
          style={[s.btn, { backgroundColor: "#DC2626", flex: 0.6 }]}
        >
          <Ionicons name="trash" size={16} color="#FFF" />
          <Text style={s.btnText}>حذف</Text>
        </Pressable>
      </Pressable>
      {previewIdx !== null && (
        <MediaPreview media={media} index={previewIdx} onClose={() => setPreviewIdx(null)} />
      )}
      {shareOpen && (
        <ShareSheet item={item} media={media} onClose={() => setShareOpen(false)} />
      )}
    </>
  )
}

function WaypointDetail({ detail, onClose, onDelete, onNavigate }: any) {
  const data: any = detail.data
  const item: PinItem = { kind: "waypoint", id: detail.id, name: detail.name, data }
  const media = useMemo(() => parseMediaList(data), [data])
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const [inlineVideo, setInlineVideo] = useState<MediaItem | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const onMedia = (i: number) => {
    Haptics.selectionAsync()
    const m = media[i]
    if (m && m.video) setInlineVideo(m)
    else setPreviewIdx(i)
  }
  return (
    <>
      <Pressable onPress={(e) => e.stopPropagation()} style={[s.header, { backgroundColor: "#EF4444" }]}>
        <Text style={s.title}>{data.name}</Text>
        <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color="#FFF" /></Pressable>
      </Pressable>
      <ScrollView style={{ maxHeight: SH * 0.45 }} bounces nestedScrollEnabled>
        <Row icon="folder-outline" label="الفئة" value={WP_CATS[data.category] || data.category} />
        {data.owner_name && <Row icon="person" label="المالك" value={data.owner_name} />}
        {data.owner_phone && <PhoneRow value={data.owner_phone} />}
        {data.owner_contact && <Row icon="chatbox-outline" label="تواصل" value={data.owner_contact} />}
        {data.price > 0 && <Row icon="pricetag" label="السعر" value={`${Number(data.price).toLocaleString()} ر.ي`} />}
        {data.area_sqm > 0 && <Row icon="resize" label="المساحة" value={`${data.area_sqm} م²`} />}
        {data.listing_date && <Row icon="calendar" label="تاريخ العرض" value={data.listing_date} />}
        {data.media_count > 0 && (
          <Row
            icon={data.media_kind === "video" ? "videocam" : data.media_kind === "both" ? "film" : "camera"}
            label="الوسائط"
            value={`${data.media_count}`}
          />
        )}
        {data.rating > 0 && (
          <View style={[s.rowInline, { justifyContent: "flex-end" }]}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={s.valueText}>{data.rating}/5</Text>
          </View>
        )}
        {data.description && (
          <View style={s.descBox}>
            <Text style={s.descText}>{data.description}</Text>
          </View>
        )}
        {data.property_details && (
          <View style={s.descBox}>
            <Text style={s.descText}>{data.property_details}</Text>
          </View>
        )}
        {inlineVideo && (
          <View style={{ margin: 12, marginBottom: 4 }}>
            <InlineVideoPlayer
              uri={inlineVideo.uri}
              title={data.name}
              onFullscreen={() => { const i = media.indexOf(inlineVideo); setInlineVideo(null); setPreviewIdx(i >= 0 ? i : 0) }}
              onClose={() => setInlineVideo(null)}
            />
          </View>
        )}
        <MediaStrip item={item} media={media} onMedia={onMedia} />
        <View style={s.coordsBox}>
          <Text style={s.coordsText}>{toDMS(data.latitude, true)} · {toDMS(data.longitude, false)}</Text>
        </View>
      </ScrollView>
      <Pressable onPress={(e) => e.stopPropagation()} style={s.actions}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNavigate(data.latitude, data.longitude, 0.005) }}
          style={[s.btn, { backgroundColor: "#2563EB", flex: 1 }]}
        >
          <Ionicons name="compass" size={16} color="#FFF" />
          <Text style={s.btnText}>التقريب للنقطة</Text>
        </Pressable>
        <Pressable onPress={() => setShareOpen(true)} style={[s.btn, { backgroundColor: "#0F172A", flex: 0.8 }]}>
          <Ionicons name="share-social-outline" size={16} color="#FFF" />
          <Text style={s.btnText}>مشاركة</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert(
            "حذف النقطة",
            `سيتم حذف «${data.name}»`,
            [
              { text: "إلغاء", style: "cancel" as const },
              { text: "حذف", style: "destructive" as const, onPress: () => onDelete(detail.id, "waypoint") },
            ],
          )}
          style={[s.btn, { backgroundColor: "#DC2626", flex: 0.6 }]}
        >
          <Ionicons name="trash" size={16} color="#FFF" />
          <Text style={s.btnText}>حذف</Text>
        </Pressable>
      </Pressable>
      {previewIdx !== null && (
        <MediaPreview media={media} index={previewIdx} onClose={() => setPreviewIdx(null)} />
      )}
      {shareOpen && (
        <ShareSheet item={item} media={media} onClose={() => setShareOpen(false)} />
      )}
    </>
  )
}

function AreaDetail({ detail, onClose, onDelete }: any) {
  const data: any = detail.data
  return (
    <>
      <Pressable onPress={(e) => e.stopPropagation()} style={[s.header, { backgroundColor: "#3B82F6" }]}>
        <Text style={s.title}>{data.name}</Text>
        <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color="#FFF" /></Pressable>
      </Pressable>
      <ScrollView style={{ maxHeight: SH * 0.4 }} bounces nestedScrollEnabled>
        <Row icon="folder-outline" label="الفئة" value={AREA_CATS[data.category] || data.category} />
        <Row icon="resize-outline" label="المساحة" value={`${(Number(data.area_sqm) / 10000).toFixed(2)} هكتار`} />
        <Row icon="git-branch-outline" label="المحيط" value={fmtDistCalc(Number(data.perimeter_m))} />
        {data.rating > 0 && (
          <View style={[s.rowInline, { justifyContent: "flex-end" }]}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={s.valueText}>{data.rating}/5</Text>
          </View>
        )}
        {data.description && (
          <View style={s.descBox}>
            <Text style={s.descText}>{data.description}</Text>
          </View>
        )}
      </ScrollView>
      <Pressable onPress={(e) => e.stopPropagation()} style={s.actions}>
        <Pressable
          onPress={() => Alert.alert(
            "حذف المنطقة",
            `سيتم حذف «${data.name}»`,
            [
              { text: "إلغاء", style: "cancel" as const },
              { text: "حذف", style: "destructive" as const, onPress: () => onDelete(detail.id, "area") },
            ],
          )}
          style={[s.btn, { backgroundColor: "#DC2626", flex: 1 }]}
        >
          <Ionicons name="trash" size={16} color="#FFF" />
          <Text style={s.btnText}>حذف المنطقة</Text>
        </Pressable>
      </Pressable>
    </>
  )
}

function PhoneRow({ value }: { value: string }) {
  return (
    <View style={s.row}>
      <Ionicons name="call-outline" size={16} color="#16A34A" />
      <View style={s.rowContent}>
        <Text style={s.label}>الهاتف</Text>
        <View style={s.phoneValue}>
          <Text style={s.valueText} numberOfLines={1}>{value}</Text>
          <CallButton phone={value} compact iconColor="#16A34A" />
        </View>
      </View>
    </View>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.row}>
      <Ionicons name={icon as any} size={16} color="#2563EB" />
      <View style={s.rowContent}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.valueText}>{value}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", elevation: 24, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: "#FFF", fontSize: fontSize.lg, fontFamily: "Tajawal_700Bold", flex: 1 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F1F5F9" },
  rowContent: { flex: 1, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: fontSize.sm, fontFamily: "Tajawal_500Medium", color: "#64748B" },
  valueText: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#1E293B" },
  phoneValue: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  rowInline: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.lg },
  descBox: { margin: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  descText: { fontSize: fontSize.sm, fontFamily: "Tajawal_400Regular", color: "#475569", lineHeight: 20 },
  coordsBox: { margin: spacing.md, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0", alignItems: "center" },
  coordsText: { fontSize: 10, fontFamily: "monospace", color: "#94A3B8" },
  actions: { flexDirection: "row-reverse", padding: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0" },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm + 2, borderRadius: 999 },
  btnText: { color: "#FFF", fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold" },
})
