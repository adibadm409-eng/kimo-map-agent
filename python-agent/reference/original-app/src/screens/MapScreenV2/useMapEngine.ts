import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import * as Location from "expo-location"
import { Alert } from "react-native"
import {
  getAllProperties, getAllWaypoints, getAllAreas,
  createWaypoint, createArea, createProperty,
  updateProperty as dbUpdateProperty,
  deleteWaypoint, deleteArea, deleteProperty,
} from "../../database/db"
import { haversineCalc, fmtDistCalc } from "../map/utils"
import {
  polylineLength, polygonArea, centroid,
  pointInPolygon, nearestItems,
} from "../map/measure"
import { loadMapState, scheduleSaveMapState } from "../map/mapState"
import {
  warmTiles,
  type WarmHandle,
} from "./tileService"
import {
  emptyWpForm, emptyAreaForm,
  type WaypointForm, type AreaForm,
} from "./forms"
import type {
  LatLng, MapTypeKey, ToolId, DetailItem, LayerVis,
  PropFilter, MeasureSummary, SaveTarget, BottomPanel,
} from "./types"

const DEFAULT_REGION = {
  latitude: 24.7136, longitude: 46.6753,
  latitudeDelta: 0.1, longitudeDelta: 0.1,
}

const MAP_TYPES: MapTypeKey[] = ["standard", "satellite", "latest", "terrain", "3d", "dark", "hot", "wikimedia", "osm", "carto-positron", "carto-dark", "carto-positron-nl", "carto-dark-nl", "carto-voyager-nl", "esri-streets", "esri-clarity", "sentinel2", "sentinel2-2021", "usgs-imagery", "gibs-marble", "gibs-lights"]

export function useMapEngine(nav: any, route: any) {
  const mapRef = useRef<any>(null)
  const vectorFlyRef = useRef<((r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, ms?: number) => void) | null>(null)
  const lastR = useRef(DEFAULT_REGION)
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackIV = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewR = useRef(DEFAULT_REGION)

  const [region, setRegion] = useState(DEFAULT_REGION)
  const [ready, setReady] = useState(false)
  const [mapType, setMapType] = useState<MapTypeKey>("standard")
  const mapTypeRef = useRef<MapTypeKey>("standard")
  const setMapTypeSafe = (t: MapTypeKey) => { mapTypeRef.current = t; setMapType(t) }
  const [layerSwitching, setLayerSwitching] = useState(false)
  const warmerRef = useRef<WarmHandle | null>(null)
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapMoving, setMapMoving] = useState(false)
  const [motionTick, setMotionTick] = useState(0)

  const [connectionOnline, setConnectionOnlineState] = useState(true)
  const setConnectionOnline = (online: boolean) => {
    setConnectionOnlineState(online)
    if (online) {
      warmerRef.current?.cancel()
      setLayerSwitching(true)
      warmerRef.current = warmTiles(mapTypeRef.current, lastR.current, 2, true)
      warmerRef.current.done.catch(() => {}).finally(() => setLayerSwitching(false))
    }
  }

  const [gpsPos, setGpsPos] = useState<LatLng | null>(null)
  const [gpsAcc, setGpsAcc] = useState<number | null>(null)

  const [properties, setProperties] = useState<any[]>([])
  const [waypoints, setWaypoints] = useState<any[]>([])
  const [areas, setAreas] = useState<any[]>([])

  const [activeTool, setActiveTool] = useState<ToolId | null>(null)
  const [drawPts, setDrawPts] = useState<LatLng[]>([])
  const [drawSummary, setDrawSummary] = useState<MeasureSummary | null>(null)
  const [ghostLine, setGhostLine] = useState<{ pts: LatLng[]; dist: number } | null>(null)
  const ghostRef = useRef<{ pts: LatLng[]; dist: number } | null>(null)

  // ─── Measure: مسافة خطية حية بين نقطة بداية مثبتة ومركز الشاشة المتحرك ────
  // نقطة البداية = مركز الشاشة لحظة تفعيل الأداة وتُثبَّت نهائياً (لا تتغير)؛
  // نقطة النهاية = مركز الشاشة أثناء التحريك، والمسافة بينهما تُحدَّث حياً.
  const [measureStart, setMeasureStart] = useState<LatLng | null>(null)
  const [measureDist, setMeasureDist] = useState(0)
  const [measureLinePts, setMeasureLinePts] = useState<LatLng[]>([])

  const [trackRunning, setTrackRunning] = useState(false)
  const [trackPts, setTrackPts] = useState<LatLng[]>([])
  const [trackDist, setTrackDist] = useState(0)

  const [layerVis, setLayerVis] = useState<LayerVis>({
    properties: true, waypoints: true, areas: true, tracks: true,
  })
  const [propFilter, setPropFilter] = useState<PropFilter>({ status: "", type: "", priceMax: 0 })

  const [bottomPanel, setBottomPanel] = useState<BottomPanel>(null)
  const [detail, setDetail] = useState<DetailItem>(null)

  const [wpPendingCoord, setWpPendingCoord] = useState<LatLng | null>(null)
  const [wpForm, setWpForm] = useState<WaypointForm>(emptyWpForm())

  const [areaPending, setAreaPending] = useState<{ coords: LatLng[]; area: number; perimeter: number } | null>(null)
  const [areaForm, setAreaForm] = useState<AreaForm>(emptyAreaForm())
  const [areaSaveTarget, setAreaSaveTarget] = useState<SaveTarget>(null)
  const [attachPropId, setAttachPropId] = useState<string | null>(null)

  const [, tick] = useState(0)
  const isPick = route.params?.pickLocation === true

  const centerNow = useCallback((): LatLng => ({
    latitude: lastR.current.latitude, longitude: lastR.current.longitude,
  }), [])

  // ─── rAF preview ────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    const f = () => {
      const r = lastR.current
      if (r && (
        Math.abs(r.latitude - previewR.current.latitude) > 1e-7 ||
        Math.abs(r.longitude - previewR.current.longitude) > 1e-7
      )) { previewR.current = r; tick((n) => n + 1) }
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ─── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const p = await loadMapState()
      const initialType: MapTypeKey = p?.mapType ?? "standard"
      const initialRegion = p?.region ?? region
      if (p) { lastR.current = p.region; setRegion(p.region); setMapTypeSafe(p.mapType) }
      await refreshData()
      setReady(true)
      // تدفئة بلطف في الخلفية بعد التهيئة دون إبطاء الظهور
      setLayerSwitching(true)
      warmerRef.current = warmTiles(initialType, initialRegion, 2, connectionOnline)
      warmerRef.current.done.finally(() => setLayerSwitching(false))
    })()
    return () => {
      if (saveT.current) clearTimeout(saveT.current)
      if (trackIV.current) clearInterval(trackIV.current)
      if (switchTimer.current) clearTimeout(switchTimer.current)
      if (settleTimer.current) clearTimeout(settleTimer.current)
      if (moveT.current) clearTimeout(moveT.current)
      warmerRef.current?.cancel()
    }
  }, [])

  useEffect(() => {
    const id = route.params?.focusPropertyId
    if (id && properties.length > 0) {
      const p = properties.find((x) => x.id === id)
      if (p?.latitude && p?.longitude) animateTo(p.latitude, p.longitude, 0.01)
    }
    if (route.params?.initialLat && route.params?.initialLng) {
      setRegion({
        latitude: route.params.initialLat, longitude: route.params.initialLng,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      })
    }
  }, [properties, route.params])

  const refreshGhost = (r: { latitude: number; longitude: number }, pts: LatLng[]) => {
    if (pts.length === 0) {
      // قبل أول نقطة لا قياس: المسافة تُحسب فقط بعد وضع أول نقطة في المساحة/المسار
      if (ghostRef.current) {
        ghostRef.current = null; setGhostLine(null)
      }
      return
    }
    const from = pts[pts.length - 1]
    const to = { latitude: r.latitude, longitude: r.longitude }
    ghostRef.current = { pts: [from, to], dist: haversineCalc(from.latitude, from.longitude, to.latitude, to.longitude) }
    setGhostLine(ghostRef.current)
  }

  const onRegionChange = useCallback((r: any) => {
    lastR.current = r
    // أثناء الحركة نُخفي الظل المتصل بالمركز (حتى لا يبدو "ملاحقاً" للزر).
    setMapMoving(true)
    setMotionTick((t) => t + 1)
    if (moveT.current) clearTimeout(moveT.current)
    moveT.current = setTimeout(() => setMapMoving(false), 150)
    if (measureStart) {
      // البداية مثبّتة لا تتغير، والنهاية = مركز الشاشة المتحرك.
      setMeasureLinePts([measureStart, { latitude: r.latitude, longitude: r.longitude }])
      setMeasureDist(haversineCalc(measureStart.latitude, measureStart.longitude, r.latitude, r.longitude))
    }
    if ((activeTool === "polygon" || activeTool === "polyline")) {
      refreshGhost(r, drawPts)
    } else if (ghostRef.current) {
      ghostRef.current = null; setGhostLine(null)
    }
  }, [measureStart, activeTool, drawPts])

  const onRegionChangeComplete = useCallback((r: any) => {
    lastR.current = r; setRegion(r)
    setMapMoving(false)
    if (moveT.current) clearTimeout(moveT.current)
    if (measureStart) {
      // عند إفلات الإصبع أيضاً (regionEnd): ربط آخر مركز بالنقطة المثبتة
      // — نفس منطق onRegionChange حتى لا يبقى القياس متوقفاً عند الصفر.
      setMeasureLinePts([measureStart, { latitude: r.latitude, longitude: r.longitude }])
      setMeasureDist(haversineCalc(measureStart.latitude, measureStart.longitude, r.latitude, r.longitude))
    }
    if (activeTool === "polygon" || activeTool === "polyline") {
      // محاذاة أخيرة للخط الأبيض والمسافة بعد إفلات الإصبع: يعرف المستخدم
      // موضع نقطة الرسم التالية بدقة (آخر نقطة ↔ مؤشر المركز) قبل تثبيتها.
      refreshGhost(r, drawPts)
    } else if (ghostRef.current) {
      ghostRef.current = null; setGhostLine(null)
    }
    if (saveT.current) clearTimeout(saveT.current)
    saveT.current = setTimeout(() => {
      scheduleSaveMapState(() => ({ region: r, mapType: mapTypeRef.current, savedAt: new Date().toISOString() }))
    }, 400)
    onRegionSettle(r)
  }, [measureStart, activeTool, drawPts])

  async function refreshData() {
    try {
      const [p, w, a] = await Promise.all([
        getAllProperties(), getAllWaypoints(), getAllAreas(),
      ])
      setProperties(p); setWaypoints(w); setAreas(a)
    } catch { /* ok */ }
  }

  function animateTo(lat: number, lng: number, delta = 0.01) {
    const r = { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta }
    setRegion(r)
    // المتجهي يُحرَّك عبر جسر المحرك (WebView)، وإلا عبر الخريطة الأصلية
    if (vectorFlyRef.current) vectorFlyRef.current(r, 800)
    else mapRef.current?.animateToRegion(r, 800)
  }

  /** تسجيل محرك المتجهات ليستقبل الحركة (يُنادا عند اتصال المحرك) */
  function setVectorFly(fn: ((r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, ms?: number) => void) | null) {
    vectorFlyRef.current = fn
  }

  async function goToGps() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== "granted") { Alert.alert("الإذن", "يلزم إذن الموقع"); return }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setGpsPos(c); setGpsAcc(loc.coords.accuracy ?? null)
      animateTo(c.latitude, c.longitude, 0.01)
    } catch { Alert.alert("خطأ", "تعذر الحصول على الموقع") }
  }

  // ─── Fast, safe, non-blocking map-style switching ───────────────────────
  function selectMapType(next: MapTypeKey) {
    if (next === mapType) return
    setMapTypeSafe(next)
    scheduleSaveMapState(() => ({
      region: lastR.current, mapType: next, savedAt: new Date().toISOString(),
    }))
    // 1) إلغاء التدفئة القديمة فوراً (تبديل سريع لا يتكدس).
    warmerRef.current?.cancel()
    // 2) نافذة توضع قصيرة غير محجوبة لعرض "تحديث"، لا تعلق الواجهة.
    if (switchTimer.current) clearTimeout(switchTimer.current)
    setLayerSwitching(true)
    switchTimer.current = setTimeout(() => setLayerSwitching(false), 700)
    // 3) تدفئة صامتة للطبقة الجديدة حول المنطقة الحالية.
    warmerRef.current = warmTiles(next, lastR.current, 2, connectionOnline)
    warmerRef.current.done.catch(() => {}).finally(() => setLayerSwitching(false))
  }

  function cycleMapType() {
    const idx = MAP_TYPES.indexOf(mapType)
    selectMapType(MAP_TYPES[(idx + 1) % MAP_TYPES.length])
  }

  function onRegionSettle(reg: any) {
    if (reg?.longitudeDelta === undefined) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      warmerRef.current = warmTiles(mapTypeRef.current, reg, 1, connectionOnline)
    }, 700)
  }

  function toggleTool(id: ToolId) {
    if (activeTool === id) {
      if (drawPts.length > 0) {
        Alert.alert("إلغاء الأداة", "لديك نقاط لم تحفظها، هل تريد الإلغاء؟", [
          { text: "متابعة الرسم", style: "cancel" },
          { text: "إلغاء", style: "destructive", onPress: () => endTool() },
        ])
        return
      }
      endTool()
      return
    }
    endTool()
    setActiveTool(id)
    const c = centerNow()
    if (id === "marker") { setWpPendingCoord(c); return }
    if (id === "measure") {
      // النقطة تُثبَّت فوراً عند التفعيل ولا تتغير: في حين أن مركز الشاشة
      // المتحرك هو نقطة نهاية القياس والمسافة بينهما تُحسب حياً أثناء السحب.
      setMeasureStart(c)
      setMeasureLinePts([c, c])
      setMeasureDist(0)
      return
    }
    if (id === "polygon" || id === "polyline") {
      setDrawPts([])
      // القياس يبدأ بعد وضع أول نقطة: لا خط أبيض ولا مسافة قبلها
      ghostRef.current = null; setGhostLine(null)
    }
  }

  function endTool() {
    if (measureStart) {
      setMeasureStart(null)
      setMeasureLinePts([])
      setMeasureDist(0)
    }
    setActiveTool(null)
    setDrawPts([])
    setDrawSummary(null)
    ghostRef.current = null; setGhostLine(null)
    setWpPendingCoord(null)
  }

  function addDrawPt(coord?: LatLng) {
    if (!activeTool) return
    const c = coord ?? centerNow()
    if (activeTool === "marker") { setWpPendingCoord(c); return }
    if (activeTool === "polygon" || activeTool === "polyline") {
      setDrawPts((prev) => {
        const last = prev[prev.length - 1]
        if (last && Math.abs(last.latitude - c.latitude) < 1e-6 && Math.abs(last.longitude - c.longitude) < 1e-6) return prev
        const nx = [...prev, c]
        const from = nx[nx.length - 1]
        const to = { latitude: lastR.current.latitude, longitude: lastR.current.longitude }
        ghostRef.current = { pts: [from, to], dist: haversineCalc(from.latitude, from.longitude, to.latitude, to.longitude) }
        setGhostLine(ghostRef.current)
        return nx
      })
    }
  }

  function undoDrawPt() {
    if (!activeTool) return
    setDrawPts((prev) => {
      const nx = prev.slice(0, -1)
      if (activeTool === "polygon" || activeTool === "polyline") {
        refreshGhost(lastR.current, nx)
      }
      return nx
    })
  }

  function cancelDrawing() {
    setActiveTool(null)
    setDrawPts([])
    setDrawSummary(null)
    ghostRef.current = null; setGhostLine(null)
    setAreaPending(null)
  }

  function canFinishTool(): boolean {
    if (activeTool === "polygon") return drawPts.length >= 3
    if (activeTool === "polyline") return drawPts.length >= 2
    return false
  }

  function finishTool(): boolean {
    if (activeTool === "polygon") {
      if (drawPts.length < 3) { Alert.alert("تنبيه", "ارسم 3 نقاط"); return false }
      const a = polygonArea(drawPts)
      const p = polylineLength([...drawPts, drawPts[0]])
      setAreaPending({ coords: drawPts, area: a, perimeter: p })
      return true
    }
    if (activeTool === "polyline") {
      if (drawPts.length < 2) { Alert.alert("تنبيه", "ارسم نقطتين"); return false }
      const p = polylineLength(drawPts)
      setAreaPending({ coords: drawPts, area: 0, perimeter: p })
      return true
    }
    return false
  }

  function eraseDrawables() {
    if (drawPts.length > 0) { cancelDrawing(); return }
    // بطاقة المحو تغلق بعد الاستخدام حتى لو لم يوجد ما يُمحى
    if (activeTool === "eraser") { cancelDrawing(); return }
    Alert.alert("محو", "لا توجد عناصر مرسومة")
  }

  // ─── TRACK ──────────────────────────────────────────────────────────────
  function toggleTrack() {
    if (trackRunning) {
      setTrackRunning(false)
      if (trackIV.current) clearInterval(trackIV.current)
      Alert.alert("تم إيقاف التسجيل", `${fmtDistCalc(trackDist)} · ${trackPts.length} نقطة`)
    } else {
      setTrackRunning(true); setTrackPts([]); setTrackDist(0)
      trackIV.current = setInterval(async () => {
        try {
          const lc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          const pt = { latitude: lc.coords.latitude, longitude: lc.coords.longitude }
          setTrackPts((prev) => {
            const u = [...prev, pt]
            if (u.length >= 2) {
              const last = u[u.length - 2]
              setTrackDist((d) => d + haversineCalc(last.latitude, last.longitude, pt.latitude, pt.longitude))
            }
            return u
          })
        } catch { /* ok */ }
      }, 5000)
    }
  }

  // ─── SAVE ────────────────────────────────────────────────────────────────
  async function saveWaypoint() {
    if (!wpPendingCoord) { Alert.alert("خطأ", "لا توجد إحداثيات"); return false }
    if (!wpForm.name.trim()) { Alert.alert("تنبيه", "أدخل الاسم"); return false }
    try {
      await createWaypoint({
        name: wpForm.name.trim(), description: wpForm.description.trim(),
        latitude: wpPendingCoord.latitude, longitude: wpPendingCoord.longitude,
        type: "waypoint", media: JSON.stringify(wpForm.mediaUris),
        category: wpForm.category, rating: wpForm.rating,
        owner_name: wpForm.ownerName.trim(), owner_phone: wpForm.ownerPhone.trim(),
        owner_contact: wpForm.ownerContact.trim(), property_details: wpForm.details.trim(),
        area_sqm: parseFloat(wpForm.area) || 0, price: parseFloat(wpForm.price) || 0,
        listing_date: wpForm.listingDate, media_kind: wpForm.mediaKind,
        media_count: wpForm.mediaUris.length,
      })
      await refreshData()
      setWpForm(emptyWpForm())
      setWpPendingCoord(null)
      endTool()
      Alert.alert("تم الحفظ", "تم حفظ النقطة")
      return true
    } catch { Alert.alert("خطأ", "تعذر الحفظ"); return false }
  }

  async function saveAreaEntity() {
    if (!areaPending) { Alert.alert("خطأ", "لا توجد منطقة"); return false }
    if (!areaForm.name.trim()) { Alert.alert("تنبيه", "أدخل الاسم"); return false }
    if (areaSaveTarget === "attach" && !attachPropId) { Alert.alert("تنبيه", "اختر عقاراً"); return false }
    const gj = JSON.stringify({
      type: "Polygon",
      coordinates: [areaPending.coords.map((p) => [p.longitude, p.latitude])],
    })
    try {
      if (areaSaveTarget === "area") {
        await createArea({
          name: areaForm.name.trim(), description: areaForm.description.trim(),
          geojson: gj, area_sqm: areaPending.area, perimeter_m: areaPending.perimeter,
          category: areaForm.category, rating: areaForm.rating,
        })
      } else if (areaSaveTarget === "property") {
        const c = centroid(areaPending.coords)
        await createProperty({
          name: areaForm.name.trim(), description: areaForm.description.trim(),
          type: "land", status: "for_sale", price: 0, area: Math.round(areaPending.area),
          address: areaForm.description.trim(), latitude: c.latitude, longitude: c.longitude,
          owner_name: "", owner_phone: "", geojson: gj, category: "general",
        } as any)
      } else if (areaSaveTarget === "attach" && attachPropId) {
        await dbUpdateProperty(attachPropId, { geojson: gj } as any)
      }
      await refreshData()
      setAreaForm(emptyAreaForm())
      setAreaPending(null)
      setAreaSaveTarget(null)
      setAttachPropId(null)
      setActiveTool(null)
      setDrawPts([])
      Alert.alert("تم الحفظ", "تم حفظ المنطقة")
      return true
    } catch { Alert.alert("خطأ", "تعذر الحفظ"); return false }
  }

  async function deleteItem(id: string, kind: "property" | "waypoint" | "area") {
    try {
      if (kind === "property") await deleteProperty(id)
      else if (kind === "waypoint") await deleteWaypoint(id)
      else if (kind === "area") await deleteArea(id)
      await refreshData()
      setDetail(null)
      Alert.alert("تم", "تم الحذف")
    } catch { Alert.alert("خطأ", "تعذر الحذف") }
  }

  // ─── Derived ────────────────────────────────────────────────────────────
  const visProps = useMemo(() => {
    let l = properties.filter((p) => p.latitude && p.longitude)
    if (!layerVis.properties) return []
    if (propFilter.status !== "") l = l.filter((p) => p.status === propFilter.status)
    if (propFilter.type !== "") l = l.filter((p) => p.type === propFilter.type)
    if (propFilter.priceMax !== 0) l = l.filter((p) => Number(p.price) <= propFilter.priceMax)
    return l
  }, [properties, layerVis.properties, propFilter])
  const visWps = useMemo(() => (layerVis.waypoints ? waypoints : []), [waypoints, layerVis.waypoints])
  const visAreas = useMemo(() => (layerVis.areas ? areas : []), [areas, layerVis.areas])

  const spatial = useMemo(() => {
    const o = { latitude: region.latitude, longitude: region.longitude }
    const np = nearestItems(o, visProps, 3).map(({ item, dist }) => ({ id: item.id, name: item.name, dist }))
    const nw = nearestItems(o, visWps, 3).map(({ item, dist }) => ({ id: item.id, name: item.name, dist }))
    const inside: { id: string; name: string }[] = []
    for (const a of visAreas) {
      try {
        const g = JSON.parse(a.geojson)
        if (g.type === "Polygon" && g.coordinates[0]) {
          const coords = g.coordinates[0].map((c: number[]) => ({ latitude: c[1], longitude: c[0] }))
          if (pointInPolygon(o, coords)) inside.push({ id: a.id, name: a.name })
        }
      } catch { /* skip */ }
    }
    return { nearestProps: np, nearestWps: nw, insideAreas: inside }
  }, [region, visProps, visWps, visAreas])

  function toggleLayer(key: keyof LayerVis) {
    setLayerVis((v) => ({ ...v, [key]: !v[key] }))
  }
  function setFilter(f: Partial<PropFilter>) {
    setPropFilter((p) => ({ ...p, ...f }))
  }

  function confirmPick() {
    (route.params as any)?.onPick?.({
      latitude: region.latitude, longitude: region.longitude,
    })
    nav.goBack()
  }

  return {
    mapRef, region, ready, mapType, cycleMapType, selectMapType, layerSwitching,
    connectionOnline, setConnectionOnline, mapMoving, motionTick,
    gpsPos, gpsAcc, goToGps,
    onRegionChange, onRegionChangeComplete,
    properties, waypoints, areas, refreshData,
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
    deleteItem, animateTo, setVectorFly,
    isPick, confirmPick,
  }
}
