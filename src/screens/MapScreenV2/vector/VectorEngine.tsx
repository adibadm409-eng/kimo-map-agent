import React, {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef,
} from "react"
import { StyleSheet, View } from "react-native"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import { buildEnginePageHtml } from "./enginePage"

/**
 * محرك الخرائط — WebView يعمل فيه MapLibre GL 3.6.2 مضمّن بالكامل
 * (المكتبة + CSS + Web Worker كـ Blob): صفر CDN، صفر خادم خلفي.
 *
 * - الأنماط النقتية (standard/satellite/terrain/...): بلاط مباشر من
 *   المزود العام عبر https.
 * - الأنماط المتجهية (ofm-* / cgl-* / 3d): تُجلب Style-JSON من OFL/Carto
 *   فورياً (fill-extrusion → مباني مجسمة عند الإمالة بإصبعين)؛ إن فشل
 *   الاتصال يَقطع إلى البلاط النقطي المضمّن تلقائياً.
 * - بوصلة دائمة أعلى الخريطة: تتلف مع الدوران وتعيد الشمال عند الضغط.
 * - إيماءات الأصابع (تحريك / قرص / دوران / إمالة) أصيلة في MapLibre.
 *
 * الجسر (JSON عبر postMessage):
 *   RN -> Web: {cmd:"init",lat,lng,zoom} {cmd:"fly",region,ms}
 *              {cmd:"render",seq,total,part}   (الحمولات الكبيرة)
 *   Web -> RN: {t:"webready"|"ready"|"rendered",n} {t:"seterr",msg}
 *              {t:"region"|"regionEnd", region}
 *              {t:"press",latitude,longitude,kind?,id?}
 *              {t:"openItem",kind,id} {t:"log",level,msg}
 */

export interface VectorRenderFeatures {
  props: { id: string; lat: number; lng: number; color: string; name?: string; type?: string; price?: string; status?: string; img?: string }[]
  waypoints: { id: string; lat: number; lng: number; name?: string }[]
  areas: { id: string; coords: [number, number][]; color?: string; stroke?: string }[]
  /** حدود العقارات (مضلعات مغلقة) */
  propBounds: { id: string; coords: [number, number][]; color?: string }[]
  drawing: { pts: [number, number][]; shape: "polygon" | "polyline" } | null
  ghost: { pts: [number, number][] } | null
  track: [number, number][]
  measure: { pts: [number, number][] } | null
  /** نقطة بداية القياس (مثبّتة على الخريطة كنقطة بنفسجية) */
  measureStart: { lat: number; lng: number } | null
  gps: { lat: number; lng: number; acc: number } | null
}

export interface VectorEngineRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
  zoom?: number
}

interface Props {
  /** مفتاح نمط الخريطة */
  styleKey: string
  features: VectorRenderFeatures
  /** آخر منطقة معلومة من RN — تُستخدم كبداية للمحرك الجديد عند إعادة التركيب
      (تبديل النمط) بدلاً من القفز للمركز الافتراضي */
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number; zoom?: number }
  /** وضع الاتصال: تشغيل = بلاط مباشر + تخزين تلقائي؛ إيقاف = كاش محلي فقط بلا إنترنت */
  online?: boolean
  onRegionChange: (r: VectorEngineRegion) => void
  onRegionChangeComplete: (r: VectorEngineRegion) => void
  onEnginePress: (p: { latitude: number; longitude: number; kind?: string; id?: number | string }) => void
  /** فتح بطاقة التفاصيل من زر داخل البطاقة السريعة */
  onEngineOpenItem: (kind: string, id: string) => void
  /** مشاركة سريعة من زر المشاركة داخل البطاقة السريعة */
  onEngineShareItem: (kind: string, id: string) => void
  onEngineReady: () => void
  onEngineError: (msg: string) => void
}

export interface VectorEngineHandle {
  animateToRegion: (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, ms?: number) => void
}


/* ═══════════════ مكوّن React — جسر RN ⇄ صفحة المحرك ═══════════════ */

interface EngMsg {
  t?: string
  msg?: string
  n?: number
  region?: VectorEngineRegion
  latitude?: number
  longitude?: number
  kind?: string
  id?: number | string
  level?: string
}

const DEFAULT_REGION = { latitude: 24.7136, longitude: 46.6753 }

export const VectorEngine = forwardRef<VectorEngineHandle, Props>((props, ref) => {
  const webRef = useRef<WebView>(null)
  /** مرجع أحدث الخصائص — يعالج رسائل المحرك دائماً بأحدث دوال RN
      (يمنع أي closure قديم من إيقاف التحديثات الحية كالقياس) */
  const propsRef = useRef(props)
  propsRef.current = props
  const featuresRef = useRef(props.features)
  featuresRef.current = props.features
  const loadedRef = useRef(false)
  const readyRef = useRef(false)
  /** يبدأ من آخر منطقة معروفة في RN (لا قفزة للمركز الافتراضي عند إعادة التركيب) */
  const regionRef = useRef(props.initialRegion ?? DEFAULT_REGION)
  const pendingInit = useRef(false)

  const html = useMemo(() => buildEnginePageHtml(props.styleKey), [props.styleKey])
  const p = props

  /** post إلى صفحة المحرك (window.postMessage) */
  const post = useMemo(() => (obj: any) => {
    webRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(obj))}, "*"); true`)
  }, [])

  /** zoom أولي متسق مع عرض درجات الطول وخط العرض (تناظر صفحة المحرك deltaToZoom) */
  const initialZoom = useMemo(() => (r: { latitude: number; latitudeDelta?: number; longitudeDelta?: number; zoom?: number }) => {
    if (r.zoom != null) return r.zoom
    const cosLat = Math.cos(((r.latitude ?? 0) * Math.PI) / 180)
    const c = Math.max(0.05, Math.min(1, cosLat))
    return Math.max(2, Math.min(19, Math.round(Math.log2((360 / Math.max(r.longitudeDelta ?? 0.1, 1e-8)) * c))))
  }, [])

  /** توزيع features مقطّعة (تجنّب تجاوز حدود الرسالة) */
  const postFeatures = useMemo(() => (f: VectorRenderFeatures | undefined) => {
    if (!f || !loadedRef.current) return
    try {
      const json = JSON.stringify(f)
      const CHUNK = 24000
      const total = Math.max(1, Math.ceil(json.length / CHUNK))
      for (let i = 0; i < total; i++) {
        post({ cmd: "render", seq: i, total, part: json.slice(i * CHUNK, (i + 1) * CHUNK) })
      }
    } catch (e) { /* ignore */ }
  }, [post])

  const sendInit = useMemo(() => () => {
    if (!loadedRef.current) return
    const r = regionRef.current
    post({ cmd: "init", lat: r.latitude, lng: r.longitude, zoom: initialZoom(r) })
  }, [post, initialZoom])

  /** إعادة إرسال init + الميزات (يُستخدم لإعادة التشغيل بعد وصول الصفحة أو خطأ) */
  const reinit = useMemo(() => () => {
    if (!loadedRef.current) return
    sendInit()
    postFeatures(featuresRef.current)
  }, [sendInit, postFeatures])

  useEffect(() => {
    featuresRef.current = props.features
    if (loadedRef.current) postFeatures(props.features)
  }, [props.features, postFeatures])

  /** قناة خفيفة للأشكال اللحظية (خط البداية/القياس + نقطة البداية المثبتة)
      تُحدّث مباشرة دون إعادة إرسال كل الميزات — فتظهر الخطوط المتقطعة بشكل حقيقي */
  useEffect(() => {
    if (!loadedRef.current) return
    post({ cmd: "overlay", data: { ghost: props.features.ghost, measure: props.features.measure, measureStart: props.features.measureStart } })
  }, [props.features.ghost, props.features.measure, props.features.measureStart, post])

  /** مزامنة وضع الاتصال مع صفحة المحرك (كاش عدم الاتصال مرتبط بزر الاتصال) */
  useEffect(() => {
    if (!loadedRef.current) return
    post({ cmd: "setOnline", online: props.online !== false })
  }, [props.online, post])

  /** معالجة رسائل المحرك — يقرأ دوال RN من propsRef (أحدث رندر دائماً) */
  const onMessage = (ev: WebViewMessageEvent) => {
    const pr = propsRef.current
    let m: EngMsg | null = null
    try { m = JSON.parse(ev.nativeEvent.data) } catch { return }
    if (!m) return
    switch (m.t) {
      case "webready":
        loadedRef.current = true
        readyRef.current = false
        post({ cmd: "setOnline", online: pr.online !== false })
        sendInit()
        postFeatures(featuresRef.current)
        return
      case "ready":
        readyRef.current = true
        pr.onEngineReady?.()
        postFeatures(featuresRef.current)
        return
      case "seterr":
        pr.onEngineError?.(m.msg || "خطأ في محرك الرسم")
        return
      case "region":
        if (m.region) { regionRef.current = m.region; pr.onRegionChange?.(m.region) }
        return
      case "regionEnd":
        if (m.region) { regionRef.current = m.region; pr.onRegionChangeComplete?.(m.region) }
        return
      case "press":
        pr.onEnginePress?.({ latitude: m.latitude ?? 0, longitude: m.longitude ?? 0, kind: m.kind, id: m.id != null ? String(m.id) : undefined })
        return
      case "openItem":
        if (m.kind != null && m.id != null) pr.onEngineOpenItem?.(String(m.kind), String(m.id))
        return
      case "shareItem":
        if (m.kind != null && m.id != null) pr.onEngineShareItem?.(String(m.kind), String(m.id))
        return
      case "rendered":
        // تُستخدم للتشخيص؛ ليس لها إجراء هنا
        return
      case "log":
        // يعرض رسائل صفحة المحرك في سجل الجهاز (metro/لوقش)
        console.log("[vecWeb]", m.level, m.msg)
        return
      default:
        return
    }
  }

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, ms = 600) => {
      regionRef.current = region
      if (!loadedRef.current) return
      post({ cmd: "fly", region, ms })
    },
  }))

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: "https://kimo-maps.local/" }}
        style={StyleSheet.absoluteFill}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        onLoad={() => { /* الصفحة تُرسل webready بنفسها */ }}
        onMessage={onMessage}
        onError={(e) => p.onEngineError?.("تعذر تحميل صفحة المحرك: " + (e.nativeEvent?.description || ""))}
      />
    </View>
  )
})

