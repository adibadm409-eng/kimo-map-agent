#!/usr/bin/env node
/**
 * Tile cache / proxy server for offline-capable map.
 *
 *   GET /tile/{z}/{x}/{y}.png?style=standard[&mode=online|offline]
 *
 * - mode=online  : fetch from upstream tile server, save into local cache, serve it.
 * - mode=offline : serve only from the local cache; missing tile => blank PNG.
 *
 * The app toggles `mode` to control whether tiles get downloaded/updated.
 * Everything fetched while online is persisted on disk, so the map keeps
 * working with or without internet.
 *
 * Upstream sources per style (512px tiles optional via ?size=512):
 *   standard  -> OpenStreetMap (256)
 *   satellite -> Esri World Imagery (256/512)
 *   terrain   -> OpenTopoMap (256)
 */
const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const { URL } = require("node:url")

const PORT = Number(process.env.TILE_PORT || 8383)
const CACHE_ROOT = process.env.TILE_CACHE || path.join(__dirname, ".tilecache")

// الصلاحية الزمنية للطوب المُخزّن: عند انقضائها في وضع "online" يُعاد جلبها
// من المزود لتحديث الطبقات (مهم لخريطة التضاريس الحديثة). الافتراضي 7 أيام.
const TTL_MS = (Number(process.env.TILE_TTL_DAYS) || 7) * 24 * 60 * 60 * 1000

const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

// CORS مفتوح دائماً على استجابات الخادم المحلي (صفحة المحرك تُبنى من مصدر same
// لكن تستقبل البلاط هنا؛ بدون هذه الرؤوس ترفض المتصفحات داخل WebView عرضها).
const CORS = { "Access-Control-Allow-Origin": "*" }

// Per-style upstream templates (arrays = fallback chain; first success wins).
const UPSTREAM = {
  standard: [
    ({ z, x, y }) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  ],
  terrain: [
    ({ z, x, y }) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  ],
  satellite: [
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  "3d": [
    // تضاريس مرتفعات بتخفيف ثلاثي الأبعاد (بدون مفاتيح)
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
  ],
  dark: [
    // Esri no-key dark canvas is far more reliable than Carto's (which often 404s).
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/rastertiles/dark_matter/${z}/${x}/${y}.png`,
  ],
  hot: [
    ({ z, x, y }) => `https://{s}.tile.openstreetmap.fr/hot/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  ],
  wikimedia: [
    ({ z, x, y }) => `https://maps.wikimedia.org/osm-intl/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  ],
  // ── قمر صناعي حر ومفتوح (بدون مفاتيح) ─────────────────────────────────────
  "esri-clarity": [
    // Esri Clarity (World Imagery المعالجة) — أعلى وضوح بصرياً من العادي
    ({ z, x, y }) => `https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  sentinel2: [
    // EOX Sentinel-2 cloudless mosaic — فسيفساء سينتينل-2 بدون غيوم
    ({ z, x, y }) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/${z}/${y}/${x}.jpg`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  "usgs-imagery": [
    // USGS National Map (تغطية أمريكية شبه عالمية)
    ({ z, x, y }) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  "gibs-marble": [
    // NASA GIBS Blue Marble (كرة زرقاء من الأقمار الصناعية؛ تدعم z0–z8 فقط)
    ({ z, x, y }) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpg`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  "gibs-lights": [
    // NASA VIIRS Earth at Night (أضواء المدينة ليلاً من القمر الصناعي؛ z0–z8)
    ({ z, x, y }) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpg`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  // ── أحدث سالطة IPSRI المتجددة شهرياً (Mosaic رسمي يحدّث كل 3-4 أسابيع) ──
  "latest": [
    // Esri World Imagery هي الطبقة المجانية الوحيدة المحدّثة بانتظام:
    // 1000+ منطقة حضرية جديدة سنوياً (Maxar Vivid 30cm) ونطاقات إقليمية 30-120cm.
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
  // ── أساس الخرائط المجانية المفتوحة (بدون مفاتيح) ─────────────────────────
  osm: [
    // OpenStreetMap رسمي — البنية الأصلية "Standard" (يخضع لسياسة الاستخدام)
    ({ z, x, y }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  ],
  "carto-positron": [
    // Carto Positron — خريطة أوراقية فاتحة نظيفة (صورة PNG ترسل مباشرة)
    ({ z, x, y }) => `https://{s}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
  ],
  "carto-dark": [
    // Carto Dark Matter — خريطة داكنة السادة (بديل حر عن Esri dark)
    ({ z, x, y }) => `https://{s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
  ],
  // ── إصدارات Carto بدون تسميات (مثبتة يدوياً: 200/PNG) ───────────────────
  "carto-positron-nl": [
    ({ z, x, y }) => `https://{s}.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`,
  ],
  "carto-dark-nl": [
    ({ z, x, y }) => `https://{s}.basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}.png`,
  ],
  "carto-voyager-nl": [
    ({ z, x, y }) => `https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}.png`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}.png`,
  ],
  // ── Esri World Street Map (مثبتة: 200, JPG وبدون مفتاح) ─────────────────
  "esri-streets": [
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
    ({ z, x, y }) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  ],
  // ── EOX Sentinel-2 نسخة 2021 (مثبتة: 200/JPG) ───────────────────────────
  "sentinel2-2021": [
    ({ z, x, y }) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/${z}/${y}/${x}.jpg`,
    ({ z, x, y }) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/${z}/${y}/${x}.jpg`,
    ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  ],
}

function safeStyle(s) {
  return UPSTREAM[s] ? s : "standard"
}

// Some tile servers (Wikimedia, OSM-FR) only answer with a real tile when a
// descriptive User-Agent / Referer is present.
const UP_HEADERS = {
  hot: { "Referer": "https://www.openstreetmap.fr/" },
  wikimedia: { "Referer": "https://maps.wikimedia.org/" },
}

function cachePath(style, z, x, y) {
  return path.join(CACHE_ROOT, style, String(z), String(x), `${y}.png`)
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
}

// Detect image type from magic bytes so JPEG (Esri) / WebP tiles render correctly
// even though the cache path ends in ".png".
function imgType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png"
  if (buf.length > 12 && buf[0] === 0x52 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp"
  if (buf.length > 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif"
  return null
}

// Only accept real image payloads. This also stops placeholder/error bodies
// (e.g. Carto/Clean 80-byte "no data" tiles, 403 pages) from being persisted
// into the cache, which previously caused whole styles to stay blank for a TTL.
function isTile(buf) {
  return buf && buf.length > 128 && !!imgType(buf)
}

function tileHeaders(buf) {
  return {
    "Content-Type": imgType(buf) || "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
    // CORS مفتوح للخادم المحلي: محرك الخريطة (WebView) يبني الصفحة من مصدر مختلف
    // ويجلب البلاط عبر fetch — بدون هذا الرأس تُرفض البلاطات داخل المحرك.
    "Access-Control-Allow-Origin": "*",
  }
}

function fetchUpstream(url, timeoutMs = 12000, headers = {}) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const httpMod = url.startsWith("https:") ? require("node:https") : require("node:http")
    httpMod
      .get(
        url,
        {
          signal: ctrl.signal,
          headers: {
            "User-Agent": "realestate-map/1.0 (mobile offline-cache)",
            "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
            ...headers,
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const chunks = []
            res.on("data", (c) => chunks.push(c))
            res.on("end", () => resolve(Buffer.concat(chunks)))
          } else if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
            const next = new URL(res.headers.location, url)
            res.resume()
            fetchUpstream(next.href, timeoutMs, headers).then(resolve, reject)
          } else {
            res.resume()
            reject(new Error(`upstream ${res.statusCode}`))
          }
        },
      )
      .on("error", reject)
    t.unref()
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const m = u.pathname.match(/^\/tile\/(\d+)\/(\d+)\/(\d+)\.png$/)
    if (!m) {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      res.end(JSON.stringify({ ok: true, name: "tile-cache", cache: CACHE_ROOT, port: PORT }))
      return
    }
    const [, zs, xs, ys] = m
    const z = parseInt(zs, 10)
    const x = parseInt(xs, 10)
    const y = parseInt(ys, 10)
    const style = safeStyle(u.searchParams.get("style") || "standard")
    const mode = u.searchParams.get("mode") === "offline" ? "offline" : "online"

    if (!(z >= 0 && x >= 0 && y >= 0)) {
      res.writeHead(400); res.end("bad tile")
      return
    }

    const file = cachePath(style, z, x, y)
    const cached = fs.existsSync(file)

const upHdrs = UP_HEADERS[style] || {}

    if (mode === "offline") {
      if (cached) {
        const cachedBuf = fs.readFileSync(file)
        res.writeHead(200, tileHeaders(cachedBuf))
        res.end(cachedBuf)
        return
      }
      res.writeHead(200, Object.assign({ "Content-Type": "image/png" }, CORS))
      res.end(BLANK_PNG)
      return
    }

    // online: serve cached if fresh; re-fetch stale to keep layers up-to-date.
    // نمط "latest" يُحدِّث يومياً تقريباً (TTL قصير جداً) فيصل لأحدث طوب المزود
    // (Esri يحدّث فسيفساء القمر كل ~3-4 أسابيع)، مع الاحتفاظ بنسخة الكاش
    // كسقوط فوري عند ضعف الشبكة، بلا إعادة تحميل كاملة.
    const LIVE_TTL_MS = 6 * 60 * 60 * 1000
    const styleTtl = style === "latest" ? LIVE_TTL_MS : TTL_MS
    if (cached) {
      const cachedBuf = fs.readFileSync(file)
      let age = Infinity
      try { age = Date.now() - fs.statSync(file).mtimeMs } catch {}
      if (age < styleTtl) {
        res.writeHead(200, tileHeaders(cachedBuf))
        res.end(cachedBuf)
        return
      }
      // stale → re-fetch; fall back to the stale copy if upstream unreachable
      const chain = UPSTREAM[style]
      let refreshed = false
      for (const build of chain) {
        if (refreshed) break
        try {
          let u = build({ z, x, y })
          u = u.replace(/\{s\}/g, ["a", "b", "c", "d"][Math.floor(Math.random() * 4)])
          const candidate = await fetchUpstream(u, 12000, upHdrs)
          if (isTile(candidate)) {
            ensureDir(file); fs.writeFileSync(file, candidate)
            res.writeHead(200, tileHeaders(candidate)); res.end(candidate)
            refreshed = true
          }
        } catch (err) { /* next provider */ }
      }
      if (!refreshed) {
        res.writeHead(200, Object.assign(tileHeaders(cachedBuf), { "Cache-Control": "public, max-age=86400" }))
        res.end(cachedBuf)
      }
      return
    }

    // Fetch through the provider fallback chain (rarely returns blank).
    const chain = UPSTREAM[style]
    let buf = null
    for (const build of chain) {
      try {
        let u = build({ z, x, y })
        // تدوير النطاق الفرعي {s} لتسريع التحميل وتجنب الحظر
        u = u.replace(/\{s\}/g, ["a", "b", "c", "d"][Math.floor(Math.random() * 4)])
        const candidate = await fetchUpstream(u, 12000, upHdrs)
        if (isTile(candidate)) { buf = candidate; break }
      } catch (err) { /* try next provider */ }
    }
    if (buf) {
      ensureDir(file)
      fs.writeFileSync(file, buf)
      res.writeHead(200, tileHeaders(buf))
      res.end(buf)
    } else {
      res.writeHead(200, Object.assign({ "Content-Type": "image/png" }, CORS))
      res.end(BLANK_PNG)
    }
  } catch {
    res.writeHead(500)
    res.end("err")
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[tile-server] listening on http://127.0.0.1:${PORT} · cache=${CACHE_ROOT}`)
})

// A tile-cache proxy is already running on this port → keep it, exit quietly.
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    setTimeout(() => process.exit(0), 0)
  } else {
    console.error("[tile-server] error:", err)
  }
})