import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as Print from 'expo-print'
import { Platform } from 'react-native'

// الملفات المولّدة تُكتب في مجلد مؤقت (cache) — تظهر في المحادثة كبطاقة ولا تُحفظ
// في مجلدات ظاهرة تلقائياً؛ الحفظ في ملفات التطبيق قرار المستخدم عبر saveFileToDocuments.
const AGENT_DIR = `${FileSystem.cacheDirectory}agent_files/`
const SAVED_DIR = `${FileSystem.documentDirectory}AgentFiles/`

const MIME_BY_EXT: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
}

function mimeTypeForFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function webDataUri(name: string, base64: string): string {
  return `data:${mimeTypeForFilename(name)};base64,${base64}`
}

function webDownload(uri: string, filename: string): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false
  const anchor = document.createElement('a')
  anchor.href = uri
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  return true
}

let dirReady = false
async function ensureDir(): Promise<void> {
  if (dirReady) return
  try {
    const info = await FileSystem.getInfoAsync(AGENT_DIR)
    if (!info.exists) await FileSystem.makeDirectoryAsync(AGENT_DIR, { intermediates: true })
    dirReady = true
  } catch {
    dirReady = true
  }
}

/** نسخ ملف مولّد إلى مجلد ظاهر في ملفات التطبيق — إجراء المستخدم نفسه، ولا يُستدعى تلقائياً. */
export async function saveFileToDocuments(uri: string, name?: string): Promise<{ uri: string; name: string }> {
  const info = await FileSystem.getInfoAsync(SAVED_DIR)
  if (!info.exists) await FileSystem.makeDirectoryAsync(SAVED_DIR, { intermediates: true })
  const clean = sanitizeFilename(name || (uri.split('/').pop() ?? 'ملف'))
  const dest = `${SAVED_DIR}${Date.now()}_${clean}`
  await FileSystem.copyAsync({ from: uri, to: dest })
  return { uri: dest, name: clean }
}

export function sanitizeFilename(name: string): string {
  const base = (name || 'ملف')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
  return base || 'ملف'
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** تحويل ArrayBuffer إلى Base64 بدون الاعتماد على btoa (يعمل في Hermes). */
export function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined
    out += B64_ALPHABET[b0 >> 2]
    out += B64_ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 63]
  }
  return out
}

function bufferToBase64(buf: Uint8Array | ArrayBuffer): string {
  if (buf instanceof Uint8Array) {
    return base64FromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  }
  return base64FromArrayBuffer(buf)
}

async function writeBase64(name: string, base64: string): Promise<{ uri: string; name: string }> {
  const clean = sanitizeFilename(name)
  // expo-file-system/legacy intentionally exposes no writeAsStringAsync on Web.
  // Keep generated files self-contained in SQLite as a data URI so they remain
  // downloadable and reviewable after a reload, without any cloud storage.
  if (Platform.OS === 'web') {
    return { uri: webDataUri(clean, base64), name: clean }
  }
  await ensureDir()
  const uri = `${AGENT_DIR}${Date.now()}_${clean}`
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 })
  return { uri, name: clean }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function sheetCellValue(v: any): any {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}

export interface ExcelSheetSpec {
  name?: string
  columns?: string[]
  rows?: (string | number)[][]
  columnWidths?: number[]
}

export interface ExcelFileSpec {
  title?: string
  sheets?: ExcelSheetSpec[]
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function excelColumnRef(index: number): string {
  let n = index + 1
  let ref = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    ref = String.fromCharCode(65 + remainder) + ref
    n = Math.floor((n - 1) / 26)
  }
  return ref
}

function safeSheetName(name: string, index: number, used: Set<string>): string {
  const base = (name || `ورقة ${index + 1}`)
    .replace(/[\\/:?*\[\]]/g, '_')
    .slice(0, 31)
    .trim() || `ورقة ${index + 1}`
  let result = base
  let suffix = 2
  while (used.has(result)) result = `${base.slice(0, Math.max(1, 31 - String(suffix).length - 1))}_${suffix++}`
  used.add(result)
  return result
}

function xlsxCell(value: unknown, ref: string, style = ''): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`
  }
  const text = xmlEscape(value)
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${text}</t></is></c>`
}

function xlsxSheetXml(spec: ExcelSheetSpec, title: string | undefined): string {
  const rows: string[][] = []
  if (title) rows.push([title])
  if (spec.columns?.length) rows.push(spec.columns)
  for (const row of spec.rows ?? []) rows.push(row.map((value) => String(value ?? '')))
  const rowXml = rows.map((row, rowIndex) => {
    const style = title && rowIndex === 0 ? '2' : title && rowIndex === 1 && spec.columns?.length ? '1' : !title && rowIndex === 0 && spec.columns?.length ? '1' : ''
    const cells = row.map((value, colIndex) => xlsxCell(value, `${excelColumnRef(colIndex)}${rowIndex + 1}`, style)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const cols = spec.columnWidths?.length
    ? `<cols>${spec.columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(4, Number(width) || 12)}" customWidth="1"/>`).join('')}</cols>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>${cols}<sheetData>${rowXml || '<row r="1"/>'}</sheetData><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`
}

function xlsxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="15"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
}

async function generateExcelFileWeb(spec: ExcelFileSpec, filename: string): Promise<{ uri: string; name: string }> {
  const module = await import('jszip')
  const JSZip = (module as any).default ?? module
  const zip = new JSZip()
  const sheets = spec.sheets?.length ? spec.sheets : [{ rows: [[]] }]
  const usedNames = new Set<string>()
  const names = sheets.map((sheet, index) => safeSheetName(sheet.name ?? '', index, usedNames))
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  zip.file('xl/workbook.xml', workbook)
  zip.file('xl/_rels/workbook.xml.rels', workbookRels)
  zip.file('xl/styles.xml', xlsxStylesXml())
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, xlsxSheetXml(sheet, spec.title)))
  const now = new Date().toISOString()
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(spec.title ?? filename)}</dc:title><dc:creator>Kimo</dc:creator><dcterms:created xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`)
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Kimo</Application><AppVersion>1.0</AppVersion></Properties>`)
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
  return writeBase64(filename.endsWith('.xlsx') ? filename : `${sanitizeFilename(filename)}.xlsx`, base64)
}

export async function generateExcelFile(spec: ExcelFileSpec, filename: string): Promise<{ uri: string; name: string }> {
  // ExcelJS evaluates a large CommonJS bundle in the browser and can leave the
  // ReAct task pending indefinitely. Use a deterministic, local XLSX writer on
  // Web; keep ExcelJS for native where the file-system path is available.
  if (Platform.OS === 'web') return generateExcelFileWeb(spec, filename)

  const { Workbook } = await import('exceljs/dist/exceljs.bare.js')
  const wb = new Workbook()
  const sheets = spec.sheets?.length ? spec.sheets : [{ rows: [[]] }]

  sheets.forEach((sheetSpec, si) => {
    const ws = wb.addWorksheet(sheetSpec.name || `ورقة ${si + 1}`)
    ws.views = [{ rightToLeft: true }]
    ws.properties.defaultRowHeight = 20

    let rowIndex = 1
    if (spec.title) {
      ws.mergeCells(1, 1, 1, Math.max(sheetSpec.columns?.length ?? 2, 1))
      const t = ws.getCell(1, 1)
      t.value = spec.title
      t.font = { bold: true, size: 15, name: 'Tajawal' }
      t.alignment = { horizontal: 'center', vertical: 'middle' }
      rowIndex = 2
    }

    if (sheetSpec.columns?.length) {
      const header = ws.getRow(rowIndex)
      sheetSpec.columns.forEach((col, ci) => {
        const cell = header.getCell(ci + 1)
        cell.value = col
        cell.font = { bold: true, name: 'Tajawal' }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Tajawal' }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      header.height = 24
      header.eachCell({ includeEmpty: true }, (cell: any) => {
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
      })
      rowIndex++
    }

    ;(sheetSpec.rows ?? []).forEach((rawRow) => {
      const r = ws.getRow(rowIndex)
      rawRow.forEach((val, ci) => {
        const cell = r.getCell(ci + 1)
        cell.value = sheetCellValue(val)
        cell.font = { name: 'Tajawal', size: 11 }
        cell.alignment = { vertical: 'middle' }
      })
      rowIndex++
    })

    if (sheetSpec.columnWidths?.length) {
      sheetSpec.columnWidths.forEach((w, ci) => {
        ws.getColumn(ci + 1).width = w
      })
    } else if (sheetSpec.columns?.length) {
      sheetSpec.columns.forEach((_, ci) => {
        ws.getColumn(ci + 1).width = Math.max(
          ...Array.from({ length: ws.rowCount }, (_, ri) => {
            const v = ws.getCell(ri + 1, ci + 1).value
            return v ? String(v).length + 2 : 10
          }).concat([10]),
          12
        )
      })
    }
  })

  const buf = await wb.xlsx.writeBuffer()
  const base64 = bufferToBase64(buf)
  return writeBase64(filename.endsWith('.xlsx') ? filename : `${sanitizeFilename(filename)}.xlsx`, base64)
}

export interface WordParagraphSpec {
  text: string
  bold?: boolean
  size?: number
  align?: 'right' | 'center' | 'both'
  color?: string
}

export interface WordTableSpec {
  headers: string[]
  rows: (string | number)[][]
}

export interface WordFileSpec {
  title?: string
  subtitle?: string
  paragraphs?: (WordParagraphSpec | string)[]
  tables?: WordTableSpec[]
}

export async function generateWordFile(spec: WordFileSpec, filename: string): Promise<{ uri: string; name: string }> {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } =
    await import('docx')

  const paras: any[] = []

  if (spec.title) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: spec.title, bold: true, size: 36, font: 'Tajawal' })],
      })
    )
  }
  if (spec.subtitle) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: spec.subtitle, size: 24, color: '666666', font: 'Tajawal' })],
      })
    )
  }

  for (const p of spec.paragraphs ?? []) {
    const para = typeof p === 'string' ? { text: p } : p
    paras.push(
      new Paragraph({
        alignment: para.align === 'center' ? AlignmentType.CENTER : para.align === 'both' ? AlignmentType.JUSTIFIED : AlignmentType.RIGHT,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: para.text ?? '',
            bold: para.bold,
            size: (para.size ?? 22) * 2,
            color: para.color,
            font: 'Tajawal',
          }),
        ],
      })
    )
  }

  for (const table of spec.tables ?? []) {
    const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' }
    const rows: any[] = [
      new TableRow({
        children: (table.headers ?? []).map(
          (h) =>
            new TableCell({
              width: { size: 100 / ((table.headers ?? []).length || 1), type: WidthType.PERCENTAGE },
              shading: { fill: '1E3A8A' },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(h), bold: true, color: 'FFFFFF', font: 'Tajawal', size: 22 })] })],
            })
        ),
      }),
    ]
    ;(table.rows ?? []).forEach((row) => {
      rows.push(
        new TableRow({
          children: (row ?? []).map(
            (cell) =>
              new TableCell({
                width: { size: 100 / ((table.headers ?? []).length || 1), type: WidthType.PERCENTAGE },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(cell), font: 'Tajawal', size: 22 })] })],
              })
          ),
        })
      )
    })

    paras.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, borders: { top: border, bottom: border, left: border, right: border } }))
    paras.push(new Paragraph({ spacing: { after: 200 }, children: [] }))
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Tajawal' } } } },
    sections: [{ properties: {}, children: paras }],
  })

  const base64 = await Packer.toBase64String(doc)
  return writeBase64(filename.endsWith('.docx') ? filename : `${sanitizeFilename(filename)}.docx`, base64)
}

export async function generatePdfFile(html: string, filename: string): Promise<{ uri: string; name: string }> {
  const { uri } = await Print.printToFileAsync({ html })
  const clean = sanitizeFilename(filename).replace(/\.pdf$/i, '')
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  return writeBase64(`${clean}.pdf`, base64)
}

export async function shareFile(uri: string, name?: string): Promise<void> {
  const cleanName = sanitizeFilename(name || 'ملف')
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('فتح الملفات غير متاح خارج المتصفح')
    const opened = webDownload(uri, cleanName)
    if (!opened) throw new Error('تعذر فتح تنزيل الملف في المتصفح')
    return
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('المشاركة غير متاحة على هذا الجهاز')
  }
  const mimeType = mimeTypeForFilename(cleanName)
  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: name ? `فتح أو مشاركة ${name}` : 'فتح أو مشاركة الملف',
  })
}

/** حفظ الملف في مجلد التحميلات بجهاز المستخدم دون إظهار مسارات داخلية. */
export async function saveToDownloads(uri: string, name?: string): Promise<{ ok: boolean; savedName: string }> {
  const cleanName = sanitizeFilename(name || (uri.split('/').pop() ?? 'ملف'))
  if (Platform.OS === 'web') {
    return { ok: webDownload(uri, cleanName), savedName: cleanName }
  }
  if (Platform.OS === 'android') {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (permissions.granted) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        const mimeType = mimeTypeForFilename(cleanName)
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          cleanName,
          mimeType
        )
        await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 })
        return { ok: true, savedName: cleanName }
      }
    } catch {
      // التراجع إلى قائمة المشاركة/الحفظ في حال إلغاء الصلاحيات
    }
  }
  if (await Sharing.isAvailableAsync()) {
    const mimeType = mimeTypeForFilename(cleanName)
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: `تحميل ${cleanName}`,
    })
    return { ok: true, savedName: cleanName }
  }
  return { ok: false, savedName: cleanName }
}

/** تحويل مصفوفة صفوف/أعمدة إلى HTML بسيط لتوليد PDF. */
export function buildHtml(title: string, columns: string[] | null, rows: (string | number)[][], subtitle?: string): string {
  const esc = (v: any) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const head = columns
    ? `<tr>${columns.map((c) => `<th style="background:#1E3A8A;color:#fff;padding:8px;border:1px solid #cbd5e1;">${esc(c)}</th>`).join('')}</tr>`
    : ''
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c) =>
              `<td style="padding:6px 8px;border:1px solid #cbd5e1;${typeof c === 'number' ? 'text-align:center;' : ''}">${esc(c)}</td>`
          )
          .join('')}</tr>`
    )
    .join('')
  return `
  <html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <style>
    body { font-family: 'DejaVu Sans', 'Noto Naskh Arabic', sans-serif; padding: 24px; color: #0f172a; }
    h1 { text-align:center; color:#1e3a8a; margin-bottom:4px; font-size:22px; }
    .sub { text-align:center; color:#64748b; margin-bottom:20px; font-size:12px; }
    table { width:100%; border-collapse: collapse; font-size:12px; }
    th, td { font-size:12px; }
  </style></head><body>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
    <table>${head}${body}</table>
  </body></html>`
}

// ---------- المرفقات ----------

export interface AttachmentData {
  name: string
  size: number
  mimeType?: string
  uri: string
  base64: string
  truncated: boolean
}

export async function readAttachmentBase64(uri: string, maxBytes = 1_200_000): Promise<AttachmentData> {
  const info = await FileSystem.getInfoAsync(uri)
  const size = info.exists && 'size' in info ? (info.size ?? 0) : 0
  let base64 = ''
  try {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  } catch {
    throw new Error('تعذر قراءة الملف المرفق')
  }
  const maxBase64Len = Math.floor(maxBytes * 1.34)
  const truncated = base64.length > maxBase64Len
  if (truncated) {
    base64 = base64.slice(0, maxBase64Len)
  }
  return { uri, name: info.exists && 'uri' in info ? (info.uri ?? 'ملف').split('/').pop() ?? 'ملف' : 'ملف', size, base64, truncated }
}

export interface AudioInputData {
  uri: string
  name: string
  size: number
  base64: string
  format: 'm4a' | 'wav' | 'mp3' | 'webm'
}

/** يقرأ التسجيل كاملاً؛ لا يسمح بالقص الصامت الذي قد يجعل التفريغ أو الفهم خاطئاً. */
export async function readAudioInput(uri: string, format: AudioInputData['format'] = 'm4a', maxBytes = 6_000_000): Promise<AudioInputData> {
  const info = await FileSystem.getInfoAsync(uri)
  const size = info.exists && 'size' in info ? (info.size ?? 0) : 0
  if (!info.exists || !size) throw new Error('التسجيل الصوتي فارغ أو لم يعد موجوداً في الجهاز.')
  if (size > maxBytes) throw new Error(`حجم التسجيل ${(size / 1024 / 1024).toFixed(1)} ميغابايت أكبر من الحد المحلي 6 ميغابايت؛ قصّر التسجيل ثم أعد المحاولة.`)
  let base64 = ''
  try {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  } catch {
    throw new Error('تعذر قراءة التسجيل الصوتي من التخزين المحلي.')
  }
  if (!base64) throw new Error('تعذر استخراج بيانات التسجيل الصوتي.')
  return { uri, name: uri.split('/').pop() ?? `voice.${format}`, size, base64, format }
}

export { newId }