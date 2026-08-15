import CryptoJS from "crypto-js"
import * as FileSystem from "expo-file-system/legacy"
import * as DocumentPicker from "expo-document-picker"
import * as Sharing from "expo-sharing"
import { getDB } from "./db"

// ═══════════════════════════════════════════════════════════════════════════
// النسخ الاحتياطي الشامل (YACB1) — يحوي كل بيانات التطبيق:
//   • قاعدة البيانات بالكامل (كل الجداول: العقارات، المحادثات، الإعدادات،
//     مفاتيح الذكاء الاصطناعي، التراجع، المشاريع، مساحات العمل...)
//   • ملفات إعدادات الخريطة (map/*.json)
//   • كل ملفات التطبيق (AgentFiles/ وغيرها)
// التشفير: AES-256-CBC بمفتاح مُشتق بـ PBKDF2-SHA256 + HMAC-SHA256 للمصادقة.
// كلمة السر إلزامية عندما تشمل النسخة مفاتيح مزودي الذكاء الاصطناعي/الخرائط.
// ═══════════════════════════════════════════════════════════════════════════

const MAGIC = "YACB1"
const FORMAT_VERSION = 1
const PBKDF2_ITERATIONS = 120000 // { kdf: { iterations } } لكل ملف
const FILE_CAP_BYTES = 8 * 1024 * 1024 // سقف الملف الواحد في الأرشيف
const TOTAL_CAP_BYTES = 25 * 1024 * 1024 // سقف إجمالي الملفات
const EXCLUDE_DIRS = new Set(["backups", "exports", "SQLite"])

export type FullBackup = {
  magic: typeof MAGIC
  version: number
  app: string
  name: string
  createdAt: string
  appVersion: string
  encrypted: boolean
  includesKeys: boolean
  kdf?: { iterations: number }
  body: string // base64 — نص JSON عادي أو كتلة مشفرة (salt|iv|ct|mac)
  bodyHash?: string // SHA-256 على body لكشف العبث حتى في النسخ غير المشفرة
}

type SqliteObject = { kind: "index" | "view" | "trigger"; name: string; sql: string }
type SqliteDump = {
  order: string[] // أسماء الجداول — تُحذف بنفس الترتيب عند الاستعادة
  tables: Record<string, { sql: string; rows: any[] }>
  objects: SqliteObject[]
}

type FullPayload = {
  sqlite: SqliteDump
  files: { path: string; data: string }[] // data = base64
}

export type RestoreSummary = {
  tables: number
  rows: number
  files: number
  filesBytes: number
  includesKeys: boolean
}

function b64encode(s: string): string {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(s))
}
function b64decode(s: string): string {
  return CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8)
}

// ── التشفير ────────────────────────────────────────────────────────────────

function encryptBody(plain: string, password: string, iterations: number): string {
  const salt = CryptoJS.lib.WordArray.random(16)
  const iv = CryptoJS.lib.WordArray.random(16)
  const material = CryptoJS.PBKDF2(password, salt, { keySize: 16, iterations }) // 512-bit: 256 مفتاح AES + 256 مفتاح MAC
  const aesKey = CryptoJS.lib.WordArray.create(material.words.slice(0, 8))
  const macKey = CryptoJS.lib.WordArray.create(material.words.slice(8, 16))
  const ct = CryptoJS.AES.encrypt(plain, aesKey, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 })
  const mac = CryptoJS.HmacSHA256(ct.ciphertext, macKey)
  const blob = salt.clone().concat(iv).concat(ct.ciphertext).concat(mac)
  return CryptoJS.enc.Base64.stringify(blob)
}

function decryptBody(b64: string, password: string, iterations: number): string {
  const blob = CryptoJS.enc.Base64.parse(b64)
  const words = blob.words
  if (words.length < 20) throw new Error("ملف النسخة تالف (كتلة مشفرة قصيرة)")
  const salt = CryptoJS.lib.WordArray.create(words.slice(0, 4))
  const iv = CryptoJS.lib.WordArray.create(words.slice(4, 8))
  const ctLen = words.length - 8 - 8 // salt|iv|ct|mac(32 بايت)
  if (ctLen <= 0) throw new Error("ملف النسخة تالف")
  const ct = CryptoJS.lib.WordArray.create(words.slice(8, 8 + ctLen))
  const mac = CryptoJS.lib.WordArray.create(words.slice(8 + ctLen))
  const decrypted = CryptoJS.PBKDF2(password, salt, { keySize: 16, iterations })
  const aesKey = CryptoJS.lib.WordArray.create(decrypted.words.slice(0, 8))
  const macKey = CryptoJS.lib.WordArray.create(decrypted.words.slice(8, 16))
  const expected = CryptoJS.HmacSHA256(ct, macKey)
  if (expected.toString() !== mac.toString()) throw new Error("كلمة السر غير صحيحة أو الملف تالف")
  const text = CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: ct }), aesKey, {
    iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8)
  if (!text) throw new Error("كلمة السر غير صحيحة")
  return text
}

// ── تفريغ قاعدة البيانات (كل الجداول عبر sqlite_master) ─────────────────────

async function dumpSqlite(): Promise<SqliteDump> {
  const db = await getDB()
  const master = await db.getAllAsync<{ type: string; name: string; sql: string | null }>(
    "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
  )
  const order: string[] = []
  const tables: Record<string, { sql: string; rows: any[] }> = {}
  const objects: SqliteObject[] = []
  for (const m of master) {
    if (!m.sql) continue
    if (m.type === "table") {
      order.push(m.name)
      try {
        const rows = await db.getAllAsync<any[]>(`SELECT * FROM "${m.name.replace(/"/g, '""')}"`)
        tables[m.name] = { sql: m.sql, rows }
      } catch { /* جدول غير قابل للقراءة — نتخطاه */ }
    } else if (m.type === "view" || m.type === "trigger" || m.type === "index") {
      objects.push({ kind: m.type, name: m.name, sql: m.sql })
    }
  }
  return { order, tables, objects }
}

// ── لقطة ملفات التطبيق ─────────────────────────────────────────────────────

async function snapshotFiles(): Promise<FullPayload["files"]> {
  const root = FileSystem.documentDirectory || ""
  if (!root) return []
  const out: FullPayload["files"] = []
  let total = 0
  const walk = async (dir: string, rel: string) => {
    let entries: string[] = []
    try { entries = await FileSystem.readDirectoryAsync(dir) } catch { return }
    for (const e of entries) {
      if (e.startsWith(".")) continue
      if (/\.db(-shm|-wal)?$/.test(e)) continue
      const full = dir + e
      const r = rel ? rel + "/" + e : e
      let info: { exists?: boolean; isDirectory?: boolean; size?: number } = {}
      try { info = await FileSystem.getInfoAsync(full) as any } catch { continue }
      if (!info.exists) continue
      if (info.isDirectory) {
        if (EXCLUDE_DIRS.has(e)) continue
        await walk(full, r)
        continue
      }
      if ((info.size ?? 0) > FILE_CAP_BYTES || total + (info.size ?? 0) > TOTAL_CAP_BYTES) continue
      try {
        const data = await FileSystem.readAsStringAsync(full, { encoding: "base64" })
        out.push({ path: r, data })
        total += info.size ?? 0
      } catch { /* ملف غير قابل للقراءة */ }
    }
  }
  await walk(root, "")
  return out
}

// ── كشف المفاتيح وتجريدها ─────────────────────────────────────────────────

/** هل النسخة تشمل مفاتيح (ذكاء اصطناعي / خرائط)؟ */
function payloadHasSecrets(p: FullPayload): boolean {
  const settings = p.sqlite.tables["agent_settings"]
  if (settings) {
    for (const r of settings.rows) {
      const row = r as any
      if (row.key === "keys") {
        try {
          const keys = JSON.parse(String(row.value || "{}"))
          if (Object.values(keys).some((v) => !!v)) return true
        } catch { /* json معطوب */ }
      }
      if (row.key === "customProviders") {
        try {
          const list = JSON.parse(String(row.value || "[]")) as any[]
          if (list.some((p) => p && typeof p.apiKey === "string" && p.apiKey.trim())) return true
        } catch { /* json معطوب */ }
      }
    }
  }
  const providerFile = p.files.find((f) => f.path === "map/mapa_provider_v1.json")
  if (providerFile) {
    try {
      const j = JSON.parse(b64decode(providerFile.data))
      if (j && typeof j === "object" && j.keys && Object.values(j.keys).some((v) => !!v)) return true
    } catch { /* json معطوب */ }
  }
  return false
}

/** تجريد كل المفاتيح من النسخة (عند اختيار عدم تضمينها). */
function stripSecrets(p: FullPayload): FullPayload {
  const out: FullPayload = { sqlite: { ...p.sqlite, tables: {} }, files: [] }
  for (const [t, d] of Object.entries(p.sqlite.tables)) {
    if (t === "agent_settings") {
      out.sqlite.tables[t] = {
        sql: d.sql,
        rows: d.rows
          .map((r: any) => {
            if (r.key === "keys") return { ...r, value: "{}" }
            if (r.key === "customProviders") {
              try {
                const list = JSON.parse(String(r.value || "[]")) as any[]
                return { ...r, value: JSON.stringify(list.map((p) => ({ ...p, apiKey: "" }))) }
              } catch { return r }
            }
            return r
          })
          .filter((r: any) => !(r.key === "keys" && "")),
      }
    } else {
      out.sqlite.tables[t] = d
    }
  }
  for (const f of p.files) {
    if (f.path === "map/mapa_provider_v1.json") {
      try {
        const j = JSON.parse(b64decode(f.data))
        out.files.push({ path: f.path, data: b64encode(JSON.stringify({ ...j, keys: {} })) })
      } catch { out.files.push(f) }
    } else {
      out.files.push(f)
    }
  }
  return out
}

// ── البناء (إنشاء نسخة) ────────────────────────────────────────────────────

export async function buildFullBackup(
  name: string,
  opts: { includeKeys: boolean; password?: string } = { includeKeys: true }
): Promise<string> {
  const sqlite = await dumpSqlite()
  const files = await snapshotFiles()
  let payload: FullPayload = { sqlite, files }

  const secrets = payloadHasSecrets(payload)
  const includesKeys = opts.includeKeys && secrets
  if (!opts.includeKeys) payload = stripSecrets(payload)

  if (opts.includeKeys && secrets && !opts.password) {
    throw new Error("هذه النسخة تتضمن مفاتيح مزودي الذكاء الاصطناعي/الخرائط — كلمة السر إلزامية")
  }

  const plain = JSON.stringify(payload)
  const now = new Date().toISOString()
  const body = opts.password
    ? encryptBody(plain, opts.password, PBKDF2_ITERATIONS)
    : b64encode(plain)
  const file: FullBackup = {
    magic: MAGIC,
    version: FORMAT_VERSION,
    app: "realestate",
    name: name || `نسخة احتياطية ${new Date().toLocaleString("ar")}`,
    createdAt: now,
    appVersion: "1.0.0",
    encrypted: !!opts.password,
    includesKeys,
    body,
    bodyHash: CryptoJS.SHA256(body).toString(),
  }
  if (opts.password) file.kdf = { iterations: PBKDF2_ITERATIONS }
  return JSON.stringify(file)
}

// ── القراءة وفتح (فك التشفير) ──────────────────────────────────────────────

export function parseFullBackup(text: string): FullBackup {
  let file: FullBackup
  try {
    file = JSON.parse(text.trim()) as FullBackup
  } catch {
    throw new Error("الملف المحدد ليس نسخة احتياطية صالحة")
  }
  if (file.magic !== MAGIC) throw new Error("الملف المحدد ليس نسخة احتياطية صالحة (YACB1)")
  if (file.version !== FORMAT_VERSION) throw new Error(`إصدار النسخة (${file.version}) غير متوافق مع هذا الإصدار من التطبيق`)
  if (!file.body) throw new Error("ملف النسخة تالف — لا يحتوي على بيانات")
  if (file.bodyHash && CryptoJS.SHA256(file.body).toString() !== file.bodyHash) throw new Error("ملف النسخة عُدّل أو تالف — فشل التحقق من سلامة المحتوى")
  return file
}

export function unlockFullBackup(file: FullBackup, password?: string): FullPayload {
  let plain: string
  if (file.encrypted) {
    if (!password) throw new Error("النسخة مشفرة — أدخل كلمة السر لفتحها")
    plain = decryptBody(file.body, password, file.kdf?.iterations || PBKDF2_ITERATIONS)
  } else {
    plain = b64decode(file.body)
  }
  const payload = JSON.parse(plain) as FullPayload
  if (!payload || !payload.sqlite || !payload.sqlite.tables) throw new Error("محتويات النسخة تالفة")
  return payload
}

/** ملخص ظاهر (بدون فك التشفير إلا عند الحاجة). */
export function summarizeFullBackup(file: FullBackup, password?: string): RestoreSummary & { name: string; createdAt: string; encrypted: boolean } {
  const payload = file.encrypted ? (password ? unlockFullBackup(file, password) : null) : unlockFullBackup(file)
  const tables = payload ? Object.keys(payload.sqlite.tables).length : 0
  const rows = payload ? Object.values(payload.sqlite.tables).reduce<number>((s, t) => s + t.rows.length, 0) : 0
  const filesBytes = payload ? payload.files.reduce<number>((s, f) => s + Math.floor((f.data.length * 3) / 4), 0) : 0
  return {
    name: file.name,
    createdAt: file.createdAt,
    encrypted: file.encrypted,
    includesKeys: file.includesKeys,
    tables,
    rows,
    files: payload ? payload.files.length : 0,
    filesBytes,
  }
}

// ── الاستعادة ──────────────────────────────────────────────────────────────

export async function restoreFullBackup(file: FullBackup, password?: string): Promise<RestoreSummary> {
  const payload = unlockFullBackup(file, password)
  const db = await getDB()

  // 1) قاعدة البيانات: حذف + إنشاء + إدراج (في معاملة واحدة)
  await db.withTransactionAsync(async () => {
    const { order, tables, objects } = payload.sqlite
    // الكائنات المشتقة أولاً (العروض/المشغلات تشير إلى الجداول)
    for (const o of [...objects].reverse()) {
      const kw = o.kind === "view" ? "VIEW" : o.kind === "trigger" ? "TRIGGER" : "INDEX"
      try { await db.runAsync(`DROP ${kw} IF EXISTS "${o.name}"`) } catch { /* قد لا يوجد */ }
    }
    for (const t of order) {
      try { await db.runAsync(`DROP TABLE IF EXISTS "${t}"`) } catch { /* قد لا يوجد */ }
    }
    for (const t of order) {
      const d = tables[t]
      if (!d) continue
      try {
        await db.runAsync(d.sql)
        if (d.rows.length > 0) {
          for (const r of d.rows) {
            const cols = Object.keys(r)
            if (cols.length === 0) continue
            const ph = cols.map(() => "?").join(",")
            const vals = cols.map((c) => (r as any)[c])
            await db.runAsync(`INSERT OR REPLACE INTO "${t}" (${cols.join(",")}) VALUES (${ph})`, vals)
          }
        }
      } catch { throw new Error(`فشل استعادة الجدول «${t}» — النسخة غير متوافقة مع هذا الإصدار`) }
    }
    for (const o of objects) {
      try { await db.runAsync(o.sql) } catch { /* كائن اختياري */ }
    }
  })

  // 2) ملفات التطبيق + إعدادات الخريطة
  const root = FileSystem.documentDirectory || ""
  if (payload.files.length > 0 && !root) throw new Error('تعذر تحديد مجلد ملفات التطبيق؛ أُعيدت قاعدة البيانات ولم تُكتب الملفات.')
  let written = 0
  for (const f of payload.files) {
    try {
      const dest = root + f.path
      const dir = dest.substring(0, dest.lastIndexOf("/"))
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {})
      await FileSystem.writeAsStringAsync(dest, f.data, { encoding: "base64" })
      written++
    } catch (e: any) {
      throw new Error(`فشل استعادة الملف «${f.path}»: ${e?.message ?? String(e)}`)
    }
  }
  if (written !== payload.files.length) throw new Error('لم تُستعد كل ملفات النسخة؛ لم يُعلن نجاح الاستعادة.')

  // 3) إبطال الكاش حتى تُقرأ القيم الجديدة فوراً
  const { resetSettingsCache } = await import("../screens/MapScreenV2/settings")
  const { resetProviderSettingsCache } = await import("../screens/MapScreenV2/mapProviders")
  resetSettingsCache()
  resetProviderSettingsCache()

  return {
    tables: Object.keys(payload.sqlite.tables).length,
    rows: Object.values(payload.sqlite.tables).reduce<number>((s, t) => s + t.rows.length, 0),
    files: written,
    filesBytes: payload.files.reduce<number>((s, f) => s + Math.floor((f.data.length * 3) / 4), 0),
    includesKeys: file.includesKeys,
  }
}

// ── الحفظ كملف على الجهاز (المستخدم يختار الموقع) ──────────────────────────

export function backupFileName(name?: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})/, "$1_$2")
  const safe = (name || "Kimo").replace(/[^\w\u0600-\u06FF-]+/g, "_").slice(0, 40) || "Kimo"
  return `${safe}-${stamp}.yacb`
}

export async function saveBackupAsDeviceFile(
  text: string,
  fileName: string
): Promise<{ cancelled: boolean; uri?: string; shared?: boolean }> {
  // Android: مجلّد يختاره المستخدم عبر منتقي النظام
  const saf = (FileSystem as any).StorageAccessFramework as typeof FileSystem.StorageAccessFramework | undefined
  if (saf && typeof saf.requestDirectoryPermissionsAsync === "function") {
    const perm = await saf.requestDirectoryPermissionsAsync()
    if (!perm.granted) return { cancelled: true }
    const uri = await saf.createFileAsync(perm.directoryUri!, fileName, "application/json")
    await saf.writeAsStringAsync(uri, text, { encoding: "utf8" })
    return { cancelled: false, uri }
  }
  // iOS/بديل: ملف داخل التطبيق ثم ورقة المشاركة لحفظه في الملفات
  const dir = (FileSystem.documentDirectory || "") + "backups/"
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {})
  const path = dir + fileName
  await FileSystem.writeAsStringAsync(path, text, { encoding: "utf8" })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "حفظ نسخة احتياطية" })
    return { cancelled: false, uri: path, shared: true }
  }
  return { cancelled: false, uri: path }
}

// ── اختيار ملف نسخة من الجهاز ──────────────────────────────────────────────

export async function pickBackupFileFromDevice(): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true })
  if (res.canceled || res.assets.length === 0) return null
  const asset = res.assets[0]
  const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: "utf8" })
  return { name: asset.name || "نسخة", text }
}