import React from 'react'
import { StyleSheet, Text } from 'react-native'
import MarkdownDisplay from 'react-native-markdown-display'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, fontSize } from '../../theme/tokens'
import ChatTable from './ChatTable'

interface MarkdownProps {
  content: string
  streamEnded?: boolean
}

/**
 * يعرّف الجداول في صياغة markdown بأسلوب بسيط:
 * سطر رأس وخلايا تفصلها | ثم إعادة تقسيم افقية، وما زاد عن السطر الأول اول صف
 * خلايا الجدول. يُستخدم بديلاً عن عرض react-native-markdown-display الذي
 * يضغط الخلايا فيكسر كلماتها ولا يتيح تمريراً افقياً للجداول الواسعة.
 */
const ROW_RE = /^\s*\|?\s*(?:[^|\n]+\s*\|)+\s*[^|\n]*$/
const SEP_RE = /^\s*\|?\s*(?::?-+:?\s*\|)+\s*(?::?-+:?)?\s*$/

interface TableBlock {
  header: string[]
  rows: string[][]
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

/** يفصل الجداول عن بقية النص ويُعيد أجزاء النص غير-الجدول والجداول المصفوفة. */
function segmentTables(text: string): { plain: string; tables: TableBlock[] } {
  const lines = text.split('\n')
  const passLines: string[] = []
  const tables: TableBlock[] = []
  let i = 0
  while (i < lines.length) {
    const isTableStart = ROW_RE.test(lines[i]) && i + 1 < lines.length && SEP_RE.test(lines[i + 1])
    if (isTableStart) {
      const header = splitRow(lines[i])
      const rows: string[][] = []
      let j = i + 2
      while (j < lines.length && ROW_RE.test(lines[j])) {
        rows.push(splitRow(lines[j]))
        j++
      }
      tables.push({ header, rows })
      i = j
    } else {
      passLines.push(lines[i])
      i++
    }
  }
  return { plain: passLines.join('\n'), tables }
}

export default function Markdown({ content, streamEnded }: MarkdownProps) {
  const { colors } = useTheme()
  const cursor = !streamEnded ? <Text style={[styles.cursor, { color: colors.accent }]}>▍</Text> : null
  const segmented = segmentTables(content)
  const blocks = segmented.plain
  const md = {
    ...base,
    body: { ...base.body, color: colors.textPrimary },
    paragraph: { ...base.paragraph, color: colors.textPrimary },
    heading1: { ...base.heading1, color: colors.textPrimary },
    heading2: { ...base.heading2, color: colors.textPrimary },
    heading3: { ...base.heading3, color: colors.textPrimary },
    text: { ...base.text, color: colors.textPrimary },
    link: { ...base.link, color: colors.accent },
    code_inline: { ...base.code_inline, backgroundColor: colors.surface, color: colors.accent },
    code_block: { ...base.code_block, backgroundColor: colors.surface, color: colors.textPrimary },
    blockquote: { ...base.blockquote, borderColor: colors.accent, backgroundColor: colors.accentSurface },
    table: { ...base.table, borderColor: colors.border },
    th: { ...base.th, borderColor: colors.border, backgroundColor: colors.surface },
    tr: { ...base.tr, borderColor: colors.border },
  }
  return (
    <>
      {blocks.trim() ? (
        <MarkdownDisplay style={md}>{blocks}</MarkdownDisplay>
      ) : null}
      {segmented.tables.map((t, i) => (
        <ChatTable key={i} header={t.header} rows={t.rows} />
      ))}
      {cursor}
    </>
  )
}

// ملاحظة: التطبيق عربي RTL بالكامل (I18nManager.forceRTL مفعّل في App.tsx)،
// لذا لا نفرض writingDirection/textAlign يدوية في كل سطر — المحاذاة تأتي عالمياً
// من إعداد RTL العام، ويترك bidi للنظام يعرض النصوص المختلطة (عربي+أرقام+لاتيني) صحيحة.
const base = {
  body: { fontSize: fontSize.md, lineHeight: 24, fontFamily: 'Tajawal_400Regular' },
  paragraph: { fontSize: fontSize.md, lineHeight: 24, fontFamily: 'Tajawal_400Regular', marginBottom: spacing.xs },
  heading1: { fontSize: fontSize.xl, fontWeight: '700' as const, fontFamily: 'Tajawal_700Bold', marginVertical: spacing.xs },
  heading2: { fontSize: fontSize.lg, fontWeight: '700' as const, fontFamily: 'Tajawal_700Bold', marginVertical: spacing.xs },
  heading3: { fontSize: fontSize.md, fontWeight: '700' as const, fontFamily: 'Tajawal_700Bold', marginVertical: spacing.xs },
  text: {},
  strong: { fontWeight: '700' as const, fontFamily: 'Tajawal_700Bold' },
  em: { fontStyle: 'italic' as const },
  s: { textDecorationLine: 'line-through' },
  code_inline: { fontFamily: 'monospace', fontSize: fontSize.sm - 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' as const },
  code_block: { fontFamily: 'monospace', fontSize: fontSize.sm, lineHeight: 20, textAlign: 'left', borderRadius: radius.md, padding: spacing.sm, marginVertical: spacing.xs },
  blockquote: { borderLeftWidth: 3, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, marginVertical: spacing.xs },
  link: { textDecorationLine: 'underline' as const },
  table: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' as const, marginVertical: spacing.xs },
  th: { paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  tr: { flexDirection: 'row' as const, borderBottomWidth: StyleSheet.hairlineWidth },
  td: { flex: 1, minWidth: 60, paddingHorizontal: 6, paddingVertical: 4 },
  row: { flexDirection: 'row' as const },
  cell: { flex: 1, minWidth: 60 },
} as const

const styles = StyleSheet.create({
  cursor: { fontSize: fontSize.md },
})