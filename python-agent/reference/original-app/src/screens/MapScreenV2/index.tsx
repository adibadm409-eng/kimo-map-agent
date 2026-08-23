import React, { useState, useMemo, useRef, useEffect } from "react"
import {
  View, Text, Pressable, StyleSheet, ScrollView,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useNavigation, useRoute } from "@react-navigation/native"
import { useMapEngine } from "./useMapEngine"
import { markerColor } from "../map/constants"
import { fmtDistCalc } from "../map/utils"
import { calcBearing } from "../map/measure"
import { ControlCard } from "./cards/ControlCard"
import { CONTROL_BAR_HEIGHT } from "./cards/ControlCard"
import { VectorEngine, type VectorEngineHandle, type VectorRenderFeatures } from "./vector/VectorEngine"
import { CenterControl } from "./cards/CenterControl"
import { LayersCard } from "./cards/LayersCard"
import { MapTypeCard } from "./cards/MapTypeCard"
import { SpatialCard } from "./cards/SpatialCard"
import { ItemsListCard } from "./cards/ItemsListCard"
import { DetailCard } from "./cards/DetailCard"
import { DrawToolsCard } from "./cards/DrawToolsCard"
import { DrawControlCard } from "./cards/DrawControlCard"
import { FloatCard } from "./cards/FloatCard"
import { SaveWaypointCard } from "./cards/SaveWaypointCard"
import { SaveAreaCard } from "./cards/SaveAreaCard"
import { emptyWpForm, emptyAreaForm } from "./forms"
import { loadSettings, saveSettings } from "./settings"
import { ShareSheet, parseMediaList, type PinItem } from "./cards/shareMedia"
import type { BottomPanel, ToolId } from "./types"

const PROP_STATUS: Record<string, string> = {
  for_sale: "للبيع", sold: "مُباع", rented: "مؤجر", pending: "تحت المعالجة",
}

export default function MapScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<any>()
  const route = useRoute<any>()
  const eng = useMapEngine(nav, route)
  const {
    region, ready, mapType, cycleMapType, selectMapType, layerSwitching,
    connectionOnline, setConnectionOnline, mapMoving, motionTick,
    gpsPos, gpsAcc, goToGps,
    onRegionChange, onRegionChangeComplete,
    properties, waypoints, areas,
    activeTool, toggleTool, endTool, cancelDrawing,
    drawPts, drawSummary, ghostLine, addDrawPt, undoDrawPt, finishTool, canFinishTool, eraseDrawables,
    measureStart, measureDist, measureLinePts,
    trackRunning, trackPts, trackDist, toggleTrack,
    layerVis, toggleLayer, propFilter, setFilter,
    visProps, visWps, visAreas, spatial,
    bottomPanel, setBottomPanel,
    detail, setDetail,
    wpPendingCoord, wpForm, setWpForm, saveWaypoint,
    areaPending, areaForm, setAreaForm, saveAreaEntity,
    areaSaveTarget, setAreaSaveTarget, attachPropId, setAttachPropId,
    deleteItem, animateTo,
    isPick, confirmPick,
  } = eng

  const vecRef = useRef<VectorEngineHandle>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [tapToAdd, setTapToAdd] = useState(false)
  const [vecErr, setVecErr] = useState("")
  /** مشاركة سريعة من تلميح الدبوس — يُفتح مباشرة بدون فتح صفحة التفاصيل */
  const [shareTarget, setShareTarget] = useState<{ kind: string; id: string; name: string; data: any } | null>(null)

  // كل الأنماط تُرسم بمحرك Leaflet يطلب البلاط مباشرة من المزود العام عبر
  // https (بلا أي خادم خلفي). لا connectionOnline ولا rasterTwin هنا.
  const tileKey = mapType

  // تسجيل حركة الخريطة من تقويم/قوائم/بحث → flyTo داخل المحرك
  useEffect(() => {
    eng.setVectorFly((r, ms) => vecRef.current?.animateToRegion(r, ms))
    return () => eng.setVectorFly(null)
  }, [])

  React.useEffect(() => {
    ;(async () => {
      const s = await loadSettings()
      setTapToAdd(s.tapToAddDrawing)
      setConnectionOnline(s.connectionOnline)
    })()
  }, [])

  useEffect(() => { setVecErr("") }, [mapType])

  const itemsList = useMemo(() => [
    ...waypoints.map((w: any) => ({ id: w.id, name: w.name, kind: "waypoint" as const, latitude: w.latitude, longitude: w.longitude })),
    ...properties.filter((p: any) => p.latitude && p.longitude).map((p: any) => ({ id: p.id, name: p.name, kind: "property" as const, latitude: p.latitude || 0, longitude: p.longitude || 0 })),
    ...areas.map((a: any) => ({ id: a.id, name: a.name, kind: "area" as const, latitude: 0, longitude: 0, area_sqm: a.area_sqm })),
  ], [waypoints, properties, areas])

  // ─── معطيات المحرك المتجهي (نفس بيانات Overlays، بصيغة [lng,lat]) ────────
  const ringCoords = (gj: any): [number, number][] | null => {
    try {
      const g = JSON.parse(gj)
      if (g.type === "Polygon" && g.coordinates?.[0]) {
        const ring = g.coordinates[0].map((c: number[]) => [c[0], c[1]] as [number, number])
        ring.push(ring[0])
        return ring
      }
    } catch {}
    return null
  }
  const vecFeatures = useMemo<VectorRenderFeatures>(() => {
    const areasCoords: VectorRenderFeatures["areas"] = []
    for (const a of visAreas) {
      const r = ringCoords(a.geojson)
      if (r) areasCoords.push({ id: String(a.id), coords: r, color: "#3B82F6", stroke: "#3B82F6" })
    }
    const bounds: VectorRenderFeatures["propBounds"] = []
    for (const p of visProps) {
      if (!p.geojson) continue
      const r = ringCoords(p.geojson)
      if (r) bounds.push({ id: String(p.id), coords: r, color: markerColor(p.status) })
    }
    const measurePts = measureLinePts.length >= 2
      ? measureLinePts.map((c: any) => [c.longitude, c.latitude] as [number, number])
      : null
    const dPts = (activeTool === "polygon" || activeTool === "polyline") && drawPts.length >= 2
      ? drawPts.map((c: any) => [c.longitude, c.latitude] as [number, number])
      : null
    return {
      props: visProps.map((p: any) => ({
        id: String(p.id), lat: Number(p.latitude), lng: Number(p.longitude), color: markerColor(p.status), name: p.name,
        type: p.type || "", price: (Number(p.price) || 0).toLocaleString("en-US") + " ر.ي", status: p.status,
        img: (() => { try { const raw = typeof p.media === "string" ? JSON.parse(p.media) : p.media; if (Array.isArray(raw) && raw[0]) return raw[0] } catch {} return undefined })(),
      })),
      waypoints: visWps.map((w: any) => ({ id: String(w.id), lat: Number(w.latitude), lng: Number(w.longitude), name: w.name })),
      areas: areasCoords,
      propBounds: bounds,
      drawing: dPts ? { pts: dPts, shape: activeTool === "polygon" ? "polygon" : "polyline" } : null,
      ghost: ghostLine && ghostLine.pts.length === 2
        ? { pts: ghostLine.pts.map((c) => [c.longitude, c.latitude] as [number, number]) }
        : null,
      track: trackPts.map((c: any) => [c.longitude, c.latitude] as [number, number]),
      measure: measurePts ? { pts: measurePts } : null,
      measureStart: measureStart ? { lat: measureStart.latitude, lng: measureStart.longitude } : null,
      gps: gpsPos ? { lat: gpsPos.latitude, lng: gpsPos.longitude, acc: gpsAcc || 40 } : null,
    }
  }, [visProps, visWps, visAreas, drawPts, ghostLine, trackPts, measureLinePts, measureStart, gpsPos, gpsAcc, activeTool])

  const measureBearing = useMemo(() => {
    if (measureLinePts.length >= 2) {
      const [a, b] = measureLinePts
      return Math.round(calcBearing(a, b))
    }
    return undefined
  }, [measureLinePts])

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#F8FAFC" }} />

  const showSaveWp = wpPendingCoord !== null

  let areaMode: "choose" | "attach" | "form" = "choose"
  if (areaSaveTarget === "attach") areaMode = "attach"
  else if (areaSaveTarget === "area" || areaSaveTarget === "property") areaMode = "form"

  const handleCtrl = (k: string) => {
    if (k === "gps") { goToGps(); return }
    if (k === "track") { toggleTrack(); return }
    setToolsOpen(false)
    setBottomPanel(bottomPanel === k ? null : (k as BottomPanel))
  }

  const onCenterPress = () => {
    if (activeTool === "marker" || activeTool === "polygon" || activeTool === "polyline") {
      addDrawPt()
      return
    }
    setToolsOpen((v) => !v)
  }

  const pickTool = (id: ToolId) => {
    toggleTool(id)
    setToolsOpen(false)
  }

  const zoom = (f: number) => {
    const r = {
      ...region,
      latitudeDelta: Math.max(0.0001, region.latitudeDelta * f),
      longitudeDelta: Math.max(0.0001, region.longitudeDelta * f),
    }
    vecRef.current?.animateToRegion(r, 600)
  }

  const onMapPress = (e: any) => {
    if (activeTool === "polygon" || activeTool === "polyline") {
      if (tapToAdd) addDrawPt(e.nativeEvent.coordinate)
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }
    if (bottomPanel) setBottomPanel(null)
    if (toolsOpen && !activeTool) setToolsOpen(false)
  }

  // لا تحديثات عند تحرك الخريطة إطلاقاً: الدبابيس وتلميحاتها يرسمها المحرك
  const handleRegionChange = (r: any) => { onRegionChange(r) }
  const handleRegionChangeComplete = (r: any) => { onRegionChangeComplete(r) }

  // ضغطات المحرك: قناة واحدة لكل النقرات (أرض / دبّ / مضلع / حد) —
  // الرسم أولاً، ثم فتح بطاقة التفاصيل الأصلية لأي عنصر، ثم إغلاق اللوحات.
  const onEnginePress = (p: { latitude: number; longitude: number; kind?: string; id?: number | string }) => {
    const coord = { latitude: p.latitude, longitude: p.longitude }
    if (activeTool === "measure") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }
    if (activeTool === "polygon" || activeTool === "polyline") {
      // رسم المساحة/المسار يتم عبر مؤشر المركز: حرك الخريطة لرؤية المسافة
      // (الخط الأبيض + الحبة) قبل تأكيد كل نقطة بضغطة زر المركز —
      // لا رسم بالنقر على الشاشة لكي يسبق القياسُ الرسمَ ولا يحدثان معاً.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }
    if (p.kind && p.id != null) {
      const id = String(p.id)
      if (p.kind === "props" || p.kind === "propBounds") {
        const pr = properties.find((x: any) => String(x.id) === id)
        if (pr) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBottomPanel(null); setDetail({ kind: "property", id: String(pr.id), name: pr.name, data: pr }); return }
      }
      if (p.kind === "waypoint") {
        const w = waypoints.find((x: any) => String(x.id) === id)
        if (w) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBottomPanel(null); setDetail({ kind: "waypoint", id: String(w.id), name: w.name, data: w }); return }
      }
      if (p.kind === "areas") {
        const a = areas.find((x: any) => String(x.id) === id)
        if (a) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBottomPanel(null); setDetail({ kind: "area", id: String(a.id), name: a.name, data: a }); return }
      }
    }
    onMapPress({ nativeEvent: { coordinate: coord } })
  }

  // فتح لوحة التفاصيل من زر "عرض التفاصيل" داخل تلميح المحرك
  const onEngineOpenItem = (kind: string, id: string) => {
    if (kind === "props" || kind === "property") {
      const pr = properties.find((x: any) => String(x.id) === id)
      if (pr) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDetail({ kind: "property", id: String(pr.id), name: pr.name, data: pr }) }
      return
    }
    if (kind === "waypoint") {
      const w = waypoints.find((x: any) => String(x.id) === id)
      if (w) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDetail({ kind: "waypoint", id: String(w.id), name: w.name, data: w }) }
    }
  }

    // مشاركة سريعة من زر المشاركة داخل تلميح المحرك (بدون فتح التفاصيل)
  const onEngineShareItem = (kind: string, id: string) => {
    if (kind === "props" || kind === "property") {
      const pr = properties.find((x: any) => String(x.id) === id)
      if (pr) { Haptics.selectionAsync(); setShareTarget({ kind: "property", id: String(pr.id), name: pr.name, data: pr }) }
      return
    }
    if (kind === "waypoint") {
      const w = waypoints.find((x: any) => String(x.id) === id)
      if (w) { Haptics.selectionAsync(); setShareTarget({ kind: "waypoint", id: String(w.id), name: w.name, data: w }) }
    }
  }

  const drawCtrlVisible = activeTool === "polygon" || activeTool === "polyline" || activeTool === "eraser"

  const onToggleTapToAdd = () => {
    const next = !tapToAdd
    setTapToAdd(next)
    saveSettings({ tapToAddDrawing: next })
  }

  const onToggleConnection = () => {
    const next = !connectionOnline
    setConnectionOnline(next)
    saveSettings({ connectionOnline: next })
  }

  return (
<View
        style={{ flex: 1, backgroundColor: (tileKey === "satellite" || tileKey === "3d" || tileKey === "dark") ? "#1a2332" : tileKey === "terrain" ? "#e8efe8" : "#f0f4f8" }}
      onLayout={(e) => { /* لا حاجة لقياس الحجم — الـ Callout مدمج بالخريطة */ }}
    >
      {/* ─── المحرك الواحد لكل الأنماط (Leaflet — بلاط مباشر من المزود العام) ─── */}
      <VectorEngine
        key={"engine-" + tileKey}
        ref={vecRef}
        styleKey={tileKey}
        initialRegion={region}
        online={connectionOnline}
        features={vecFeatures}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        onEnginePress={onEnginePress as any}
        onEngineOpenItem={onEngineOpenItem}
        onEngineShareItem={onEngineShareItem}
        onEngineReady={() => { setVecErr("") }}
        onEngineError={(msg) => setVecErr(msg)}
      />

      {/* شارة صغيرة غير محجوبة أثناء تبديل النمط (لا تغطي الخريطة أبداً) */}
      {layerSwitching && (
        <View style={[s.layerChip, { top: insets.top + 8 }]} pointerEvents="none">
          <Ionicons name="sync" size={12} color="#475569" />
          <Text style={s.layerChipText}>تحديث الطبقة...</Text>
        </View>
      )}

      {/* تنبيه المحرك (خطأ بلاط هادئ — لا يقطع الخريطة أبداً) */}
      {vecErr !== "" && (
        <View style={[s.errChip, { top: insets.top + 40 }]} pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={13} color="#B91C1C" />
          <Text style={s.errChipText} numberOfLines={2}>الخريطة: {vecErr}</Text>
        </View>
      )}

      {/* ─── OVERLAY: عناصر التحكم فقط — البطاقات والـ Callout ترسمهما الخريطة نفسها ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        {/* ─── Top: Coordinate box ────────────────────────────────────────── */}
        <View style={[s.coordBox, { top: insets.top + 50 }]}>
          <Text style={s.coordText}>
            {region.latitude.toFixed(5)}, {region.longitude.toFixed(5)} · عقارات {visProps.length}
          </Text>
        </View>

        {/* ─── Top: GPS tracking badge ────────────────────────────────────── */}
        {trackRunning && (
          <View style={[s.trackBadge, { top: insets.top + 84 }]}>
            <View style={s.trkDot} />
            <Text style={s.trkText}>{fmtDistCalc(trackDist)} · {trackPts.length}ن</Text>
            <Pressable onPress={toggleTrack} hitSlop={8}><Ionicons name="stop-circle" size={18} color="#FFF" /></Pressable>
          </View>
        )}

        {/* ─── Pick-location banner ───────────────────────────────────────── */}
        {isPick && (
          <View style={[s.pickBar, { top: insets.top + 12 }]}>
            <Ionicons name="location-outline" size={16} color="#FFF" />
            <Text style={s.pickBarText}>اختر الموقع ثم اضغط التأكيد</Text>
            <Pressable onPress={confirmPick} style={s.pickBtn}>
              <Ionicons name="checkmark" size={16} color="#FFF" />
            </Pressable>
          </View>
        )}

        {/* ─── Right rail: Zoom ───────────────────────────────────────────── */}
        <View style={[s.railGroup, { top: insets.top + 160, right: 12 }]}>
          <Pressable onPress={() => zoom(0.5)} style={s.railBtn}><Ionicons name="add" size={20} color="#475569" /></Pressable>
          <Pressable onPress={() => zoom(2)} style={s.railBtn}><Ionicons name="remove" size={20} color="#475569" /></Pressable>
        </View>

        {/* ─── Left: Quick GPS ────────────────────────────────────────────── */}
        <View style={[s.railGroup, { top: insets.top + 160, left: 12 }]}>
          <Pressable onPress={goToGps} style={[s.railBtn, { backgroundColor: "#2563EB" }]}><Ionicons name="navigate" size={20} color="#FFF" /></Pressable>
        </View>

        {/* ─── CENTER: primary control ────────────────────────────────────── */}
        <View style={s.centerCluster} pointerEvents="box-none">
          {!activeTool && toolsOpen && (
            <FloatCard>
              <DrawToolsCard
                activeTool={null}
                onPickTool={pickTool}
                onClose={() => setToolsOpen(false)}
              />
            </FloatCard>
          )}
          {measureStart && (
            <Pressable
              style={({ pressed }) => [s.distPill, pressed && { transform: [{ scale: 0.95 }] }]}
              onPress={() => { endTool(); setToolsOpen(false) }}
            >
              <Text style={s.distPillText}>{fmtDistCalc(measureDist)}</Text>
              {measureBearing !== undefined && (
                <Text style={s.distPillSub}>اتجاه {measureBearing}°</Text>
              )}
              <Ionicons name="stop-circle" size={14} color="#F87171" />
            </Pressable>
          )}
          {(activeTool === "polygon" || activeTool === "polyline") && ghostLine && ghostLine.dist >= 1 && (
            <View style={s.distPill} pointerEvents="none">
              <Ionicons name="swap-horizontal" size={11} color="#0F172A" />
              <Text style={s.distPillText}>{fmtDistCalc(ghostLine.dist)}</Text>
            </View>
          )}
          <View style={s.centerBtnHolder}>
            <CenterControl activeTool={activeTool} onPress={onCenterPress} />
          </View>
        </View>

                {/* ─── BOTTOM PANEL SHEET (ملء الشاشة فوق شريط الأدوات) ────────────── */}
        {bottomPanel && (
          <View style={[s.bottomSheet, { top: insets.top + 118, bottom: drawCtrlVisible ? CONTROL_BAR_HEIGHT + 84 : CONTROL_BAR_HEIGHT + 14 }]}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.sheetContent}
            >
              {bottomPanel === "layers" && (
                <LayersCard
                  layerVis={layerVis}
                  propFilter={propFilter}
                  mapType={mapType}
                  counts={{ properties: visProps.length, waypoints: visWps.length, areas: visAreas.length, tracks: trackPts.length }}
                  connectionOnline={connectionOnline}
                  onToggleConnection={onToggleConnection}
                  onToggleLayer={toggleLayer}
                  onFilterChange={setFilter}
                  onMapTypeChange={(t) => selectMapType(t as any)}
                  onClose={() => setBottomPanel(null)}
                />
              )}
              {bottomPanel === "mapType" && (
                <MapTypeCard
                  mapType={mapType}
                  onChange={(t) => selectMapType(t as any)}
                  onClose={() => setBottomPanel(null)}
                />
              )}
              {bottomPanel === "spatial" && (
                <SpatialCard
                  originLat={region.latitude}
                  originLng={region.longitude}
                  nearestProperties={spatial.nearestProps}
                  nearestWaypoints={spatial.nearestWps}
                  insideAreas={spatial.insideAreas}
                  onSelectProperty={(id: string) => {
                    const p = properties.find((x: any) => x.id === id)
                    if (p) { animateTo(p.latitude, p.longitude, 0.008); setBottomPanel(null); setDetail({ kind: "property", id: p.id, name: p.name, data: p }) }
                  }}
                  onSelectWaypoint={(id: string) => {
                    const w = waypoints.find((x: any) => x.id === id)
                    if (w) { animateTo(w.latitude, w.longitude, 0.005); setBottomPanel(null); setDetail({ kind: "waypoint", id: w.id, name: w.name, data: w }) }
                  }}
                  onFocusArea={(id: string) => {
                    const a = areas.find((x: any) => x.id === id)
                    if (a) { setBottomPanel(null); setDetail({ kind: "area", id: a.id, name: a.name, data: a }) }
                  }}
                  onClose={() => setBottomPanel(null)}
                />
              )}
              {bottomPanel === "waypoint-list" && (
                <ItemsListCard
                  items={itemsList}
                  onSelect={(it) => {
                    setBottomPanel(null)
                    if (it.latitude && it.longitude) animateTo(it.latitude, it.longitude, 0.01)
                  }}
                  onClose={() => setBottomPanel(null)}
                />
              )}
            </ScrollView>
          </View>
        )}

        {/* ─── BOTTOM DOCK ────────────────────────────────────────────────── */}
        <View style={s.dock} pointerEvents="box-none">

          {drawCtrlVisible && (
            <View style={s.drawHolder} pointerEvents="box-none">
              <View pointerEvents="auto">
                <DrawControlCard
                  tool={activeTool!}
                  coords={drawPts}
                  nextPt={ghostLine?.pts ? ghostLine.pts[1] : undefined}
                  canFinish={canFinishTool()}
                  onSave={() => { if (finishTool()) setToolsOpen(false) }}
                  onAddPoint={() => addDrawPt()}
                  onUndo={undoDrawPt}
                  onClear={eraseDrawables}
                />
              </View>
            </View>
          )}

          <ControlCard
            onAction={handleCtrl}
            trackRunning={trackRunning}
            activePanel={bottomPanel}
          />
        </View>
      </View>

      {/* ─── DETAIL MODAL ──────────────────────────────────────────────────── */}
      <DetailCard
        detail={detail}
        onClose={() => setDetail(null)}
        onDelete={(id, kind) => deleteItem(id, kind)}
        onNavigate={(lat, lng, delta) => animateTo(lat, lng, delta)}
        onOpenProperty={(id) => nav.navigate("PropertiesStack", { screen: "PropertyDetail", params: { id } })}
      />

      {/* ─── SHARE SNAPSHOT (مشاركة سريعة من التلميح) ────────────────────── */}
      {shareTarget && (
        <ShareSheet
          item={{ kind: shareTarget.kind as "property" | "waypoint", id: shareTarget.id, name: shareTarget.name, data: shareTarget.data } satisfies PinItem}
          media={parseMediaList(shareTarget.data)}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* ─── SAVE WAYPOINT MODAL ──────────────────────────────────────────── */}
      <SaveWaypointCard
        visible={showSaveWp}
        form={wpForm}
        setForm={setWpForm}
        coord={wpPendingCoord}
        onClose={() => { setWpForm(emptyWpForm()); endTool() }}
        onSave={async () => { if (await saveWaypoint()) { setWpForm(emptyWpForm()); endTool() } }}
      />

      {/* ─── SAVE AREA MODAL ──────────────────────────────────────────────── */}
      <SaveAreaCard
        visible={areaPending !== null}
        mode={areaMode}
        form={areaForm}
        setForm={setAreaForm}
        pending={areaPending}
        saveTarget={areaSaveTarget}
        setSaveTarget={setAreaSaveTarget}
        attachPropId={attachPropId}
        setAttachPropId={setAttachPropId}
        properties={properties}
        onClose={() => { setAreaForm(emptyAreaForm()); setAreaSaveTarget(null); setAttachPropId(null); cancelDrawing() }}
        onSave={async () => { await saveAreaEntity() }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  centerCluster: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  centerBtnHolder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "box-none",
  },
  dock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 95,
    justifyContent: "flex-end",
  },
  drawHolder: {
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  bottomSheet: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 100,
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sheetContent: { gap: 10, paddingBottom: 6 },
  coordBox: { position: "absolute", left: 60, right: 100, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, zIndex: 90 },
  coordText: { fontSize: 9, fontFamily: "monospace", color: "#0F172A" },
  layerChip: { position: "absolute", left: 12, right: 100, alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", elevation: 3, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, zIndex: 90 },
  layerChipText: { fontSize: 10, fontFamily: "Tajawal_700Bold", color: "#475569" },
  errChip: { position: "absolute", left: 12, right: 100, alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(254,242,242,0.96)", borderWidth: 1, borderColor: "#FECACA", elevation: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, zIndex: 90 },
  errChipText: { fontSize: 10, fontFamily: "Tajawal_700Bold", color: "#B91C1C", flexShrink: 1 },
  distPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "rgba(255,255,255,0.85)", marginBottom: 72, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, zIndex: 60 },
  distPillText: { fontSize: 11, fontFamily: "Tajawal_700Bold", color: "#FFFFFF" },
  distPillSub: { fontSize: 10, fontFamily: "Tajawal_500Medium", color: "#D3D3D3" },
  trackBadge: { position: "absolute", left: 12, right: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: "#DC2626", zIndex: 90, elevation: 6 },
  trkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFF" },
  trkText: { color: "#FFF", fontSize: 11, fontWeight: "700", fontFamily: "Tajawal_700Bold" },
  railGroup: { position: "absolute", gap: 6, zIndex: 90 },
  railBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.95)", elevation: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  pickBar: { position: "absolute", left: 12, right: 12, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: "#2563EB", zIndex: 110, elevation: 8 },
  pickBarText: { color: "#FFF", fontSize: 12, fontFamily: "Tajawal_700Bold", flex: 1 },
  pickBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" },
})