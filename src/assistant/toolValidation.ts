import type { FunctionDef, ToolCall } from './llm'
import type { ValidationIssue } from './canonical'

export type ParsedToolArguments =
  | { ok: true; value: Record<string, any> }
  | { ok: false; message: string }

export function parseToolArgumentsStrict(raw: unknown): ParsedToolArguments {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ok: true, value: raw as Record<string, any> }
  if (typeof raw !== 'string') return { ok: false, message: 'وسائط الأداة ليست كائناً أو JSON نصياً.' }
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, message: 'وسائط الأداة يجب أن تكون كائناً JSON.' }
    return { ok: true, value: parsed }
  } catch (error: any) {
    return { ok: false, message: `JSON غير صالح: ${error?.message ?? 'تعذر التحليل'}` }
  }
}

function typeMatches(value: unknown, expected: string): boolean {
  if (expected === 'null') return value === null
  if (expected === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  if (expected === 'array') return Array.isArray(value)
  if (expected === 'integer') return (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isInteger(Number(value)))
  if (expected === 'number') return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
  if (expected === 'boolean') return typeof value === 'boolean'
  if (expected === 'string') return typeof value === 'string'
  return true
}

function validateValue(value: unknown, schema: Record<string, any>, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(schema.oneOf)) {
    const alternatives = schema.oneOf as Record<string, any>[]
    if (!alternatives.some((candidate) => {
      const nested: ValidationIssue[] = []
      validateValue(value, candidate, path, nested)
      return nested.length === 0
    })) issues.push({ code: 'invalid_arguments', message: `القيمة لا تطابق أي خيار في المخطط.`, path })
    return
  }
  if (Array.isArray(schema.anyOf)) {
    const alternatives = schema.anyOf as Record<string, any>[]
    if (!alternatives.some((candidate) => {
      const nested: ValidationIssue[] = []
      validateValue(value, candidate, path, nested)
      return nested.length === 0
    })) issues.push({ code: 'invalid_arguments', message: `القيمة لا تطابق أي خيار مسموح.`, path })
    return
  }
  if (schema.enum && !schema.enum.some((candidate: unknown) => JSON.stringify(candidate) === JSON.stringify(value))) {
    issues.push({ code: 'invalid_arguments', message: `القيمة ليست ضمن القيم المسموحة.`, path })
    return
  }
  if (schema.type && !typeMatches(value, String(schema.type))) {
    issues.push({ code: 'invalid_arguments', message: `نوع القيمة غير صحيح؛ المتوقع ${schema.type}.`, path })
    return
  }
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
    for (const required of Array.isArray(schema.required) ? schema.required : []) {
      if (objectValue[required] === undefined) issues.push({ code: 'invalid_arguments', message: `الحقل المطلوب مفقود: ${required}.`, path: `${path}.${required}` })
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!(key in properties)) issues.push({ code: 'invalid_arguments', message: `الحقل غير معروف: ${key}.`, path: `${path}.${key}` })
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (objectValue[key] !== undefined && childSchema && typeof childSchema === 'object') validateValue(objectValue[key], childSchema as Record<string, any>, `${path}.${key}`, issues)
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items && typeof schema.items === 'object') {
    value.forEach((item, index) => validateValue(item, schema.items, `${path}[${index}]`, issues))
  }
}

export function validateToolArguments(raw: unknown, schema: Record<string, any>): ParsedToolArguments {
  const parsed = parseToolArgumentsStrict(raw)
  if (!parsed.ok) return parsed
  const issues: ValidationIssue[] = []
  validateValue(parsed.value, schema, '$', issues)
  return issues.length ? { ok: false, message: issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ') } : parsed
}

export function validateToolCallAgainstDefinitions(call: ToolCall, definitions: FunctionDef[]): ValidationIssue[] {
  const definition = definitions.find((candidate) => candidate.name === call.name)
  if (!definition) return [{ code: 'unknown_tool', message: `الأداة غير معروفة: ${call.name}.`, path: 'name' }]
  const parsed = validateToolArguments(call.arguments, definition.parameters)
  return parsed.ok ? [] : [{ code: 'invalid_arguments', message: parsed.message, path: 'arguments' }]
}

export function validateToolCallBatch(calls: ToolCall[], definitions: FunctionDef[], parallelAllowed: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  if (!parallelAllowed && calls.length > 1) issues.push({ code: 'parallel_not_allowed', message: 'الملف الحالي لا يثبت دعم استدعاءات الأدوات المتوازية.' })
  for (const call of calls) {
    if (!call.id.trim()) issues.push({ code: 'missing_tool_id', message: `نداء الأداة ${call.name} بلا معرف.` })
    if (ids.has(call.id)) issues.push({ code: 'duplicate_tool_id', message: `معرف الأداة مكرر: ${call.id}.` })
    ids.add(call.id)
    issues.push(...validateToolCallAgainstDefinitions(call, definitions))
  }
  return issues
}
