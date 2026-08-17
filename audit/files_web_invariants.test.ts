import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: vi.fn(async () => ({ exists: true })),
  makeDirectoryAsync: vi.fn(async () => {}),
  copyAsync: vi.fn(async () => {}),
  writeAsStringAsync: vi.fn(async () => {}),
  readAsStringAsync: vi.fn(async () => ''),
}))
vi.mock('expo-sharing', () => ({}))
vi.mock('expo-print', () => ({ printToFileAsync: vi.fn() }))

import { generateExcelFile } from '../src/assistant/files'

describe('local web XLSX generation', () => {
  it('creates a valid multi-sheet workbook without filesystem or cloud storage', async () => {
    const result = await generateExcelFile(
      {
        title: 'تقرير QA',
        sheets: [
          {
            name: 'القطع',
            columns: ['رقم القطعة', 'القيمة', 'الحالة'],
            rows: [['A-01', 1200000, 'تقسيط']],
            columnWidths: [15, 18, 15],
          },
          {
            name: 'الدفعات',
            columns: ['المرجع', 'المبلغ'],
            rows: [['QA-PAY2-2026', 150000]],
          },
        ],
      },
      'تقرير_QA'
    )

    expect(result.name).toBe('تقرير_QA.xlsx')
    expect(result.uri.startsWith('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,')).toBe(true)

    const base64 = result.uri.split(',')[1]
    const zip = await JSZip.loadAsync(base64, { base64: true })
    expect(zip.file('xl/workbook.xml')).not.toBeNull()
    expect(zip.file('xl/worksheets/sheet1.xml')).not.toBeNull()
    expect(zip.file('xl/worksheets/sheet2.xml')).not.toBeNull()
    expect(zip.file('xl/styles.xml')).not.toBeNull()

    const workbookXml = await zip.file('xl/workbook.xml')!.async('string')
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(workbookXml).toContain('القطع')
    expect(workbookXml).toContain('الدفعات')
    expect(sheetXml).toContain('A-01')
    expect(sheetXml).toContain('1200000')
    expect(sheetXml).toContain('تقسيط')
  })
})
