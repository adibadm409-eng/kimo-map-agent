/*
 * صفحة محرك الخريطة (WebView): HTML + CSS + JavaScript — نص خالص يُبنى
 * لتشغيل MapLibre GL المضمّن مع الطبقات والنقر والجسر وكاش عدم الاتصال.
 * منفصلة عن VectorEngine.tsx (جسر RN فقط) لفصل الاهتمامات وعدم تداخل التعديلات.
 */
import {
  MAPLIBRE_CSS_B64, MAPLIBRE_JS_B64, MAPLIBRE_WORKER_B64,
} from "./maplibreBundle"
import { VECTOR_STYLES } from "./vectorStyles"

/** خرائط البلاط المباشرة من المزودين العامين — بلا خادم خلفي.
 *  hot/wikimedia استبعدناها (فشل مستمر) واستُبدلت بأنماط Carto/OSM مستقرة. */
const TILE_PROVIDERS: Record<string, string> = {
  standard: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  latest: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "esri-clarity": "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "esri-streets": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  terrain: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  "3d": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  hot: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  wikimedia: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  "carto-positron": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "carto-dark": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "carto-positron-nl": "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "carto-dark-nl": "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
  "carto-voyager-nl": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
  sentinel2: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
  "sentinel2-2021": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  "usgs-imagery": "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
  "gibs-marble": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
  "gibs-lights": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
  "ofm-positron": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "ofm-bright": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  "ofm-liberty": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  "ofm-dark": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "ofm-fiord": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "ofm-3d": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
  "cgl-positron": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "cgl-voyager": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
  "cgl-dark": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
}

/** أي النمط المتجهي (بدعم مجسمات) نحمّلها Style-JSON حقيقية؛ البقية بلاط. */
function vectorStyleUrl(key: string): string | null {
  if (key in VECTOR_STYLES) return VECTOR_STYLES[key as keyof typeof VECTOR_STYLES].url
  if (key === "3d") return "https://tiles.openfreemap.org/styles/liberty"
  if (key === "ofm-3d") return "https://tiles.openfreemap.org/styles/liberty"
  return null
}

/** يوسّع {s} إلى مصفوفة subdomains صريحة. */
function makeTiles(url: string): string[] {
  if (url.indexOf("{s}") >= 0) {
    return ["a", "b", "c", "d"].map((s) => url.replace(/\{s\}/g, s))
  }
  return [url]
}

export function buildEnginePageHtml(styleKey: string): string {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline' data:",
    "style-src 'unsafe-inline' data:",
    "img-src https: data: blob:",
    "connect-src https: data: blob:",
    "font-src data:",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src blob: data:",
  ].join(";")

  const INIT_JSON = JSON.stringify({ lat: 24.7136, lng: 46.6753, zoom: 12 })
  const TILES_JSON = JSON.stringify(makeTiles(TILE_PROVIDERS[styleKey] || TILE_PROVIDERS.standard))
  const VECTOR_URL_JSON = JSON.stringify(vectorStyleUrl(styleKey))
  const WORKER_JSON = JSON.stringify(MAPLIBRE_WORKER_B64)
  const STYLE_KEY_JSON = JSON.stringify(styleKey)

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="data:text/css;base64,${MAPLIBRE_CSS_B64}">
<script src="data:text/javascript;base64,${MAPLIBRE_JS_B64}"></script>
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;touch-action:none;background:#0f172a}
  #map{position:absolute;inset:0}
  #err{display:none;position:absolute;inset:0;align-items:center;justify-content:center;
       background:rgba(15,23,42,.88);color:#fff;font-size:14px;z-index:198;text-align:center;padding:24px;box-sizing:border-box}
  .maplibregl-map{width:100%;height:100%}
  .maplibregl-ctrl-attrib{font-size:7px!important;background:rgba(255,255,255,.45)!important}
  .maplibregl-popup-content{font-family:'Noto Sans Arabic','Tajawal',sans-serif;text-align:right;border-radius:12px;padding:10px 12px}
  .maplibregl-popup-tip{display:none}
  /* البوصلة — قطعة دائمة أعلى الشمالة، تدور مع الدوران وتعيد الشمال عند الضغط */
  .compass{position:absolute;top:16px;right:14px;z-index:100;width:42px;height:42px;border-radius:22px;
           background:rgba(255,255,255,.94);box-shadow:0 2px 8px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;cursor:pointer}
  .compass svg{width:30px;height:30px;transition:transform .12s linear}
  .compass .ring{stroke:#94a3b8;stroke-width:1;fill:none}
  .compass .n{font:700 8px/1 sans-serif;fill:#dc2626}
  .compass .needle-red{fill:#dc2626}
  .compass .needle-wht{fill:#fff;stroke:#cbd5e1;stroke-width:.5}
</style>
</head>
<body>
<div id="map"></div>
<div id="compass" class="compass"><svg id="compasssvg" viewBox="0 0 32 32">
  <circle class="ring" cx="16" cy="16" r="14"/>
  <path class="needle-red" d="M16 2 L19 17 L16 14 L13 17 Z"/>
  <path class="needle-wht" d="M16 30 L13 17 L16 20 L19 17 Z"/>
  <text class="n" x="16" y="9" text-anchor="middle">N</text>
</svg></div>
<div id="err"><div>تعذّر تشغيل محرك الرسم.</div></div>
<script>
window.__fail = function () { try { window.ReactNativeWebView.postMessage(JSON.stringify({ t: "seterr", msg: "فشل تشغيل محرك الرسم" })) } catch (e) {} }
;(function () {
  function post(o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)) } catch (e) {} }
  ;["log", "warn", "error"].forEach(function (lv) {
    var orig = console[lv]
    console[lv] = function () {
      try { post({ t: "log", level: lv, msg: Array.prototype.map.call(arguments, String).join(" ") }) } catch (e) {}
      if (orig) orig.apply(console, arguments)
    }
  })
  window.addEventListener("error", function (ev) { post({ t: "log", level: "error", msg: "page: " + (ev.message || "") }) })
})()
</script>
<script>
(function () {
  "use strict"
  var DEV = false
  var INIT = ${INIT_JSON}
  var TILES = ${TILES_JSON}
  var VECTOR_URL = ${VECTOR_URL_JSON}
  var WORKER_B64 = ${WORKER_JSON}
  var STYLE_KEY = ${STYLE_KEY_JSON}
  var map = null
  var wired = false
  var moveT = null
  var lastErrAt = 0
  var pending = null
  var inited = false
  var LAYERS_INIT = false
  /* ── كاش البلاط المحلي: ذاكرة (متزامنة) + IndexedDB (دائمة) ──
     الوضع روتيني تماماً كما في أي تطبيق خرائط:
     - عند الاتصال: كل بلاطة تُعرض تُخزَّن تلقائياً (تحديث مستمر مع التصفح).
     - عند الإيقاف: لا أي شبكة — البلاط يُقرأ من الكاش فقط. */
  var OFFLINE = false
  var MEM = new Map()
  var MEM_MAX = 1000
  var DB_NAME = "map_tiles_v1"
  var DB_STORE = "tiles"
var _db = null
  var _dbOpened = false
  var _dbQueue = []
  var _writes = 0
  var TRANSPARENT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  function mimeFor(url) {
    if (/\\\.webp(\\?|$)/i.test(url)) return "image/webp"
    if (/\\\.jpe?g(\\?|$)/i.test(url)) return "image/jpeg"
    return "image/png"
  }
  function openDb() {
    if (_db || _dbOpened) return
    _dbOpened = true
    try {
      var req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = function (e) { var d = e.target.result; if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: "k" }) }
      req.onsuccess = function () {
        _db = req.result
        var q = _dbQueue
        _dbQueue = []
        for (var i = 0; i < q.length; i++) dbPut(q[i][0], q[i][1])
      }
      req.onerror = function () { _db = null }
    } catch (e) { _db = null }
  }
  function memSet(url, dataUrl) {
    if (MEM.has(url)) MEM.delete(url)
    MEM.set(url, dataUrl)
    while (MEM.size > MEM_MAX) { var fk = MEM.keys().next().value; MEM.delete(fk) }
  }
  function dbPut(url, b64) {
    if (!_db) { _dbQueue.push([url, b64]); return }
    try {
      _db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put({ k: url, b: b64, t: Date.now() })
      _writes = (_writes + 1) % 64
      if (_writes === 0) dbTrim()
    } catch (e) {}
  }
  /** تنظيف دوري بسيط: حذف البلاطات الأقدم من 30 يوماً (لا تعقيد) */
  function dbTrim() {
    if (!_db) return
    try {
      var cutoff = Date.now() - 30 * 24 * 3600 * 1000
      var tx = _db.transaction(DB_STORE, "readwrite")
      var cur = tx.objectStore(DB_STORE).openCursor()
      cur.onsuccess = function () {
        var c = cur.result
        if (c) { var v = c.value; if (!v || !v.t || v.t < cutoff) { try { c.delete() } catch (e) {} } c.continue() }
      }
    } catch (e) {}
  }
  /** يعبّئ الذاكرة بأحدث البلاطات المخزنة (لخدمة transformRequest المتزامنة) */
  function warmMem(limit, done) {
    if (!_db) { if (done) done(0); return }
    var items = []
    try {
      var tx = _db.transaction(DB_STORE, "readonly")
      var cur = tx.objectStore(DB_STORE).openCursor()
      cur.onsuccess = function () {
        var c = cur.result
        if (!c) {
          items.sort(function (a, b) { return (b.t || 0) - (a.t || 0) })
          for (var i = 0; i < items.length && i < limit; i++) memSet(items[i].k, items[i].v)
          if (done) done(items.length)
          return
        }
        var r = c.value
        if (r && r.k && r.b) items.push({ k: r.k, v: "data:" + mimeFor(r.k) + ";base64," + r.b, t: r.t || 0 })
        c.continue()
      }
      cur.onerror = function () { if (done) done(0) }
    } catch (e) { if (done) done(0) }
  }
  /** تبديل وضع الاتصال: تشغيل = شبكة فقط (وتُخزَّن البلاطات تلقائياً)؛
      إيقاف = كاش الذاكرة فقط، صفر إنترنت — والتحديث يحدث روتينياً عند العودة */
  function setOnline(on) {
    if (on && OFFLINE) {
      OFFLINE = false
      MEM.clear()
      if (map) { try { map.triggerRepaint() } catch (e) {} }
    }
    else if (!on && !OFFLINE) {
      OFFLINE = true
      warmMem(MEM_MAX, function () {
        if (!map) return
        try { map.triggerRepaint() } catch (e) {}
      })
    }
  }
  function tileUrlFor(url) {
    if (!OFFLINE) return url
    var v = MEM.get(url)
    return v || TRANSPARENT
  }
  /* اعتراض جلب البلاط: عند الاتصال تُخزَّن كل بلاطة تُعرض (تحديث روتيني) */
  var REAL_FETCH = null
  try { REAL_FETCH = window.fetch.bind(window) } catch (e) {}
  if (REAL_FETCH) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || ""
      var isHttp = url && url.indexOf("http") === 0
      if (isHttp && OFFLINE) return Promise.resolve(new Response(null, { status: 204, statusText: "Offline" }))
      if (url && url.indexOf("data:") !== 0 && url.indexOf("blob:") !== 0 && /\\\.(png|jpe?g|webp)(\\?|$)/i.test(url)) {
        return REAL_FETCH(input, init).then(function (res) {
          if (res && res.ok) {
            try {
              res.clone().arrayBuffer().then(function (buf) {
                try {
                  var bin = ""
                  var u8 = new Uint8Array(buf)
                  for (var i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192))
                  var b64 = btoa(bin)
                  memSet(url, "data:" + mimeFor(url) + ";base64," + b64)
                  openDb(); dbPut(url, b64)
                } catch (e) {}
              }).catch(function () {})
            } catch (e) {}
          }
          return res
        })
      }
      return REAL_FETCH(input, init)
    }
  }

  function post(o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)) } catch (e) {} }
  function warn(msg) {
    var now = Date.now()
    if (now - lastErrAt < 3000) return
    lastErrAt = now
    post({ t: "seterr", msg: msg })
  }

  function regionOf() {
    if (!map) return null
    var c = map.getCenter()
    var b = map.getBounds()
    return {
      latitude: +c.lat.toFixed(7), longitude: +c.lng.toFixed(7),
      latitudeDelta: +Math.abs(b.getNorth() - b.getSouth()).toFixed(7) + 1e-9,
      longitudeDelta: +Math.abs(b.getEast() - b.getWest()).toFixed(7) + 1e-9,
      zoom: Math.round(map.getZoom() * 100) / 100,
    }
  }
  function emitRegion(end) { var r = regionOf(); if (r) post({ t: end ? "regionEnd" : "region", region: r }) }

  /** تحويل عرض درجة (longitudeDelta) إلى zoom مع مراعاة خط العرض — Mercator حقيقي */
  function deltaToZoom(deltaLng, lat) {
    var c = Math.cos((lat == null ? 0 : lat) * Math.PI / 180)
    c = Math.max(0.05, Math.min(1, c))
    return Math.max(2, Math.min(19, Math.log2((360 / Math.max(deltaLng, 1e-8)) * c)))
  }

  /* ── إضافة الطبقات (تُرسَّع مرة واحدة لكل إصدار Style/إعادة إعداده) ── */
  function addCircle(id, color, radius) {
    if (map.getLayer(id)) return
    map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
    map.addLayer({
      id: id, type: "circle", source: id,
      paint: {
        "circle-radius": radius,
        "circle-color": ["coalesce", ["get", "color"], color],
        "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff",
      },
    })
  }
  function addLine(id, color, width, opacity, dash) {
    if (map.getLayer(id)) return
    map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
    var paint = {
      "line-color": ["coalesce", ["get", "color"], color],
      "line-width": (width == null) ? 3 : width,
      "line-opacity": (opacity == null) ? 1 : opacity,
    }
    if (dash && dash.length) paint["line-dasharray"] = dash
    map.addLayer({
      id: id, type: "line", source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: paint,
    })
  }
  function addPoly(id, color, fillOpacity, width) {
    if (map.getLayer(id + "-fill")) return
    map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
    map.addLayer({
      id: id + "-fill", type: "fill", source: id,
      paint: { "fill-color": ["coalesce", ["get", "fill"], color], "fill-opacity": (fillOpacity == null) ? 0.25 : fillOpacity },
    })
    map.addLayer({
      id: id + "-line", type: "line", source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["coalesce", ["get", "color"], color], "line-width": 2, "line-opacity": 1 },
    })
  }

  function ensureLayers() {
    if (!map) return
    LAYERS_INIT = true
    addCircle("src-props", "#16A34A", 7)
    addCircle("src-wp", "#EF4444", 5.5)
    addCircle("src-gps", "#10B981", 3.5)
    addLine("src-bounds", "#16A34A", 2, 1, null)
    addPoly("src-areas", "#3B82F6", 0.25, 2)
    addPoly("src-drawing", "#2563EB", 0.25, 2)
    addLine("src-ghost", "#FFFFFF", 2.5, 0.85, [7, 5])
    addLine("src-track", "#3B82F6", 4, 0.8, null)
    addLine("src-measure", "#8B5CF6", 3, 1, [8, 5])
    addCircle("src-measure-start", "#8B5CF6", 6)
    wireClick()
  }

  /* ── النقر: لا بوب-أب داخل الصفحة؛ كل نقر يُحال إلى RN كـ press واحد،
       وRN هو من يقرر (رسم نقاط / فتح بطاقة تفاصيل / إغلاق اللوحات). ── */

  function feature(type, coords, props) {
    return { type: "Feature", properties: props || {}, geometry: { type: type, coordinates: coords } }
  }

  /* ── الرسم: يُعاد بعد كل تبديل نمط ── */
  function flush() {
    if (!map || !pending) return
    var D = pending
    function setData(id, feats) {
      var s = map.getSource(id)
      if (s) s.setData({ type: "FeatureCollection", features: feats })
    }
    setData("src-props", (D.props || []).map(function (p) {
      return feature("Point", [p.lng, p.lat], {
        kind: "props", id: p.id, name: p.name, color: p.color || "#16A34A",
        type: p.type || "", price: p.price || "", status: p.status || "", img: p.img || "",
      })
    }))
    setData("src-wp", (D.waypoints || []).map(function (w) {
      return feature("Point", [w.lng, w.lat], { kind: "waypoint", id: w.id, name: w.name, color: "#EF4444" })
    }))
    setData("src-gps", D.gps ? [feature("Point", [D.gps.lng, D.gps.lat], { color: "#10B981" })] : [])

    setData("src-bounds", (D.propBounds || []).filter(function (pb) { return pb.coords && pb.coords.length >= 2 })
      .map(function (pb) { return feature("Polygon", [pb.coords], { color: pb.color || "#16A34A", id: pb.id }) }))
    setData("src-areas", (D.areas || []).filter(function (a) { return a.coords && a.coords.length >= 3 })
      .map(function (a) { return feature("Polygon", [a.coords], { color: a.color || "#3B82F6", fill: a.color || "#3B82F6", id: a.id }) }))

    setData("src-drawing", (D.drawing && D.drawing.pts && D.drawing.pts.length >= 2)
      ? [feature(D.drawing.shape === "polygon" ? "Polygon" : "LineString",
          D.drawing.shape === "polygon" ? [D.drawing.pts] : D.drawing.pts, { color: "#2563EB", fill: "#2563EB" })] : [])
    setData("src-ghost", (D.ghost && D.ghost.pts && D.ghost.pts.length === 2) ? [feature("LineString", D.ghost.pts, { color: "#FFFFFF" })] : [])
    setData("src-track", (D.track && D.track.length >= 2) ? [feature("LineString", D.track, { color: "#3B82F6" })] : [])
    setData("src-measure", (D.measure && D.measure.pts && D.measure.pts.length >= 2) ? [feature("LineString", D.measure.pts, { color: "#8B5CF6" })] : [])
    setData("src-measure-start", D.measureStart ? [feature("Point", [D.measureStart.lng, D.measureStart.lat], { color: "#8B5CF6" })] : [])

    post({ t: "rendered", n: (D.props || []).length + (D.waypoints || []).length })
  }

  /** نقرة موحدة للخريطة: أي نقر (دبّ/مضلع/حد/أرض فارغة) يُرسل press واحداً
      مع kind/id للعنصر إن وُجد — القرار النهائي في RN. */
  function wireClick() {
    if (!map || map._clickWired) return
    map._clickWired = true
    map.on("click", function (e) {
      if (!e || !e.lngLat) return
      var kind = null
      var fid = null
      try {
        var feats = map.queryRenderedFeatures(e.point, {
          layers: ["src-props", "src-wp", "src-areas-fill", "src-bounds"],
        })
        if (feats && feats.length > 0) {
          var f = feats[0]
          var lid = f.layer && f.layer.id
          var pr = f.properties || {}
          if (lid === "src-props") { kind = "props"; fid = pr.id }
          else if (lid === "src-wp") { kind = "waypoint"; fid = pr.id }
          else if (lid === "src-areas-fill") { kind = "areas"; fid = pr.id }
          else if (lid === "src-bounds") { kind = "propBounds"; fid = pr.id }
        }
      } catch (e3) { /* قبل اكتمال النمط — تُعتبر النقرة على الأرض */ }
      post({
        t: "press",
        latitude: e.lngLat.lat, longitude: e.lngLat.lng,
        kind: kind,
        id: fid,
      })
    })
  }

  function wireEvents() {
    if (wired) return
    wired = true
    // إرسال متدرّج أثناء السحب (لا debounce يُلغى باستمرار الحركة):
    // بدون هذا لا تصل رسائل region أصلاً أثناء حركة الإصبع، فيبدو القياس
    // كنقطة معزولة لا ترتبط بمركز الشاشة.
    var lastMoveAt = 0
    map.on("move", function () {
      var now = Date.now()
      if (now - lastMoveAt >= 80) { lastMoveAt = now; emitRegion(false) }
      if (moveT) clearTimeout(moveT)
      moveT = setTimeout(function () { emitRegion(false) }, 90)
    })
    map.on("moveend", function () { if (moveT) clearTimeout(moveT); emitRegion(true) })
    // البوصلة: تلتقط الدوران وتلف الإبرة
    map.on("rotate", updateCompass)
    map.on("zoom", updateCompass)
  }

  var compassEl = null
  var compassSvg = null
  function updateCompass() {
    if (!map) return
    var b = map.getBearing ? map.getBearing() : 0
    if (!compassSvg) { compassSvg = document.getElementById("compasssvg"); return }
    compassSvg.style.transform = "rotate(" + (-b) + "deg)"
  }

  /** تحميل النمط المتجهي مع fallback أنتوميتيك للنقطي المضمّن */
  function applyVector() {
    return new Promise(function (resolve, reject) {
      if (OFFLINE) return reject({ code: 0, msg: "غير متصل — يبقى النقطي المخزّن" })
      if (!VECTOR_URL) return reject({ code: 0, msg: "غير متجه" })
      fetch(VECTOR_URL, { headers: { "user-agent": "Mozilla/5.0" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json() })
        .then(function (styleJson) {
          map.setStyle(styleJson, { diff: false })
          map.once("style.load", function () {
            // إمالة 3D للمباني المجسمة
            if (STYLE_KEY === "3d" || STYLE_KEY === "ofm-3d") { try { map.setPitch(55) } catch (e0) {} }
            // ضمان طبقات بياناتنا فوق المتجهي (fill-extrusion للمجسمات)
            try { ensureLayers(); flush() } catch (e3) { warn(String(e3 && e3.message)) }
            resolve(true)
          })
        })
        .catch(function (e) { reject(e) })
    })
  }

  function init() {
    if (map || inited) return
    if (typeof maplibregl === "undefined" || !maplibregl.Map) { warn("مكتبة الرسم غير محمولة"); return }
    inited = true
    try {
      // Web Worker مضمّن (base64 → Blob)
      if (maplibregl.setWorkerUrl) {
        try {
          var bw = atob(WORKER_B64)
          var data = new Uint8Array(bw.length)
          for (var k = 0; k < bw.length; k++) data[k] = bw.charCodeAt(k) & 0xff
          maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([data], { type: "text/javascript" })))
        } catch (e2) { warn("فشل تجهيز عامل الرسم: " + String(e2 && e2.message)) }
      }

      var create = function () {
        map = new maplibregl.Map({
        container: document.getElementById("map"),
        // يبدأ دائماً ببلاط مضمّن لضمان ظهور فوري؛ يُبدّل بالنمط المتجاري عند التحميل
        style: {
          version: 8,
          sources: { base: { type: "raster", tiles: TILES, tileSize: 256, attribution: "" } },
          layers: [ { id: "base", type: "raster", source: "base" } ],
        },
        center: [INIT.lng, INIT.lat],
        zoom: INIT.zoom,
        pitch: 0,
        bearing: 0,
        dragPan: true, dragRotate: true, touchZoomRotate: true, touchPitch: true,
        rotateWithKeys: false, boxZoom: false, keyboard: false, doubleClickZoom: false,
        attributionControl: false, hash: false, fadeDuration: 0,
        maxZoom: 19, minZoom: 2, trackResize: true,
        transformRequest: function (url, rt) { return { url: tileUrlFor(url) } },
      })

      wireEvents()
      compassEl = document.getElementById("compass")
      if (compassEl) compassEl.addEventListener("click", function () {
        if (map) { map.easeTo({ bearing: 0, duration: 400 }); }
      })
      updateCompass()

      var start = function () {
        try {
          ensureLayers()
          flush()
          post({ t: "ready" })
          emitRegion(true)
        } catch (e4) { warn(String(e4 && e4.message)) }
        // النمط المتجاري إن وجد → يحل محل بلاط الـ fallback
        applyVector().then(function () {
          try { ensureLayers(); flush(); post({ t: "rendered", n: (pending || {}).props ? pending.props.length + (pending.waypoints || []).length : 0 }) } catch (e5) { warn(String(e5 && e5.message)) }
        }).catch(function (e6) {
          if (VECTOR_URL && DEV) console.log("[vecWeb] المتجهي فشل، يبقى النقطي: " + String(e6 && e6.message))
        })
      }
      if (map.loaded && map.loaded()) start()
        else map.once("load", start)
      }
      // عند بدء دون اتصال: تُعبَّأ ذاكرة الكاش أولاً ثم تُنشأ الخريطة حتى
      // تُرسم البلاطات المخزّنة مباشرة — بلا أي طلب شبكة.
      if (OFFLINE) warmMem(MEM_MAX, function () { if (!map) { try { create() } catch (e2) { warn(String(e2 && e2.message)) } } })
      else create()
    } catch (err) {
      warn(err && err.message ? String(err.message) : "فشل تهيئة الخريطة")
    }
  }

  // ── تجميع رسائل التوزيع ──
  var partsList = null
  var partsTotal = 0
  var partsRecv = 0

  window.addEventListener("message", function (ev) {
    var m
    try { m = JSON.parse(String(ev.data)) } catch (e) { return }
    if (!m || !m.cmd) return
    if (m.cmd === "init") {
      if (!map) { INIT.lat = m.lat || INIT.lat; INIT.lng = m.lng || INIT.lng; INIT.zoom = m.zoom || INIT.zoom }
      init()
    } else if (m.cmd === "fly") {
      if (!map || !m.region) return
      var z = m.region.zoom !== undefined ? m.region.zoom : Math.round(deltaToZoom(m.region.longitudeDelta, m.region.latitude))
      map.flyTo({ center: [m.region.longitude, m.region.latitude], zoom: Math.max(2, Math.min(19, z)), duration: (m.ms || 600) / 1000 })
    } else if (m.cmd === "render") {
      var seq = m.seq || 0
      if (seq === 0) { partsTotal = m.total || 1; partsList = new Array(partsTotal); partsRecv = 0 }
      if (!partsList || seq < 0 || seq >= partsList.length || partsList[seq] !== undefined) return
      partsList[seq] = m.part
      partsRecv++
      if (partsRecv === partsTotal) {
        var full = ""
        for (var i = 0; i < partsTotal; i++) {
          if (!partsList[i]) return
          full = full + partsList[i]
        }
        try { pending = JSON.parse(full) } catch (e) {
          warn("حمولة رسم غير سليمة: " + String(e && e.message))
          return
        }
        flush()
      }
    } else if (m.cmd === "setOnline") {
      setOnline(m.online === true)
    } else if (m.cmd === "overlay") {
      // قناة خفيفة للأشكال اللحظية (المسافات) — تُحدّث مباشرة دون إعادة إرسال كل الميزات
      try {
        var o = m.data || {}
        var g = map.getSource("src-ghost")
        if (g) g.setData({ type: "FeatureCollection", features: (o.ghost && o.ghost.pts && o.ghost.pts.length === 2) ? [feature("LineString", o.ghost.pts, { color: "#FFFFFF" })] : [] })
        var me = map.getSource("src-measure")
        if (me) me.setData({ type: "FeatureCollection", features: (o.measure && o.measure.pts && o.measure.pts.length >= 2) ? [feature("LineString", o.measure.pts, { color: "#8B5CF6" })] : [] })
        var ms = map.getSource("src-measure-start")
        if (ms) ms.setData({ type: "FeatureCollection", features: (o.measureStart && o.measureStart.lng != null) ? [feature("Point", [o.measureStart.lng, o.measureStart.lat], { color: "#8B5CF6" })] : [] })
      } catch (e2) { /* الخريطة لم تُحمّل بعد — سيُغطّى في flush */ }
    }
  })

  post({ t: "webready" })
  console.log("[vecWeb] loads, " + (typeof maplibregl !== "undefined" && maplibregl.Map ? "maplibregl=OK" : "مفقود"))
  // الخريطة تُنشأ عند وصول init من RN (يحمّل آخر منطقة معروفة بدل المركز الافتراضي).
  // احتياط: إن لم تصل init خلال ثانيتين → البدء بالافتراضيات.
  setTimeout(function () { if (!map) init() }, 2000)
})()
</script>
</body>
</html>`
}
