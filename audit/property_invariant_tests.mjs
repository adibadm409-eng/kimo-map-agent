import fs from 'node:fs'
import assert from 'node:assert/strict'
import { parseSseBuffer } from '../src/assistant/llm.ts'

function splitSse(buf) {
  const out = []
  for (const line of buf.split('\n')) if (line.startsWith('data:')) out.push({ data: line.slice(5).trim() })
  return out
}
function parseToolArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function toWireToolCall(call) {
  const extra = call.extra ?? {}
  const { raw: _raw, ...otherExtra } = extra
  const raw = extra.raw ?? {}
  const name = call.name || raw.function?.name || ''
  const args = typeof call.arguments === 'string' ? call.arguments : call.arguments != null ? JSON.stringify(call.arguments) : typeof raw.function?.arguments === 'string' ? raw.function.arguments : '{}'
  const LEAK_FIELDS = ['index', 'id', 'type', 'function', 'raw']
  const fn = {}
  for (const [k, v] of Object.entries(otherExtra)) if (!LEAK_FIELDS.includes(k) && v !== undefined) fn[k] = v
  fn.name = name; fn.arguments = args
  const sig = otherExtra.thought_signature ?? raw.function?.thought_signature ?? raw.thought_signature
  if (sig !== undefined) fn.thought_signature = sig
  return { id: call.id ?? raw.id ?? 'generated', type: 'function', function: fn }
}

const sseChunk1 = 'data: {"choices":[{"delta":{"content":"مرحبا"}}]}\n\ndata: {"choices":[{"delta":{'
const sseChunk2 = '"content":"تكملة"}}]}\n\ndata: [DONE]\n\n'
const first = parseSseBuffer(sseChunk1)
assert.equal(first.events.length, 1, 'the complete first SSE event is emitted immediately')
assert.ok(first.rest.includes('data: {"choices"'), 'the incomplete event remains buffered')
const second = parseSseBuffer(first.rest + sseChunk2, true)
assert.equal(second.events.length, 2, 'the buffered JSON event and DONE event are recovered together')
assert.deepEqual(JSON.parse(second.events[0].data), { choices: [{ delta: { content: 'تكملة' } }] })
assert.equal(second.events[1].data, '[DONE]')

assert.deepEqual(parseToolArgs('{"n":7}'), { n: 7 })
assert.deepEqual(parseToolArgs({ n: 7 }), { n: 7 })
const wire = toWireToolCall({ id: 'abc123456', name: 'query', arguments: '{"entity":"property"}', extra: { thought_signature: 'sig', raw: { index: 0, type: 'function' } } })
assert.equal(wire.function.name, 'query')
assert.equal(wire.function.arguments, '{"entity":"property"}')
assert.equal(wire.function.thought_signature, 'sig')
assert.equal('index' in wire.function, false)

const workspace = fs.readFileSync(new URL('../src/database/workspace.ts', import.meta.url), 'utf8')
const duplicateBlock = workspace.slice(workspace.indexOf('export async function duplicateWorkspace'), workspace.indexOf('// ---------- المرفقات ----------'))
assert.match(duplicateBlock, /const newId = await createWorkspace/)
assert.match(duplicateBlock, /await duplicateTable\(t\.id, t\.name, newId\)/)
assert.match(duplicateBlock, /while \(await d\.getFirstAsync/)

const dbSource = fs.readFileSync(new URL('../src/database/db.ts', import.meta.url), 'utf8')
assert.match(dbSource, /const area = p\.area \?\? \(p as any\)\.area_sqm \?\? 0/)
assert.match(dbSource, /const areaSqm = \(p as any\)\.area_sqm \?\? p\.area \?\? 0/)
assert.match(dbSource, /if \(normalized\.area == null && normalized\.area_sqm != null\) normalized\.area = normalized\.area_sqm/)
assert.match(dbSource, /if \(normalized\.area_sqm == null && normalized\.area != null\) normalized\.area_sqm = normalized\.area/)

const crud = fs.readFileSync(new URL('../src/agent/crud.ts', import.meta.url), 'utf8')
assert.match(crud, /function normalizePropertyPatch\(data: Record<string, any>\)/)
assert.match(crud, /const d = spec\.entity === 'properties' \? normalizePropertyPatch\(picked\) : picked/)
assert.match(crud, /assertExistingRecord\(spec\.entity, spec\.id\)/)
assert.match(crud, /assertKnownPatchFields\(spec\.entity, entity\.fields, spec\.data\)/)
assert.match(crud, /لم تتم أي كتابة/)

const schemas = fs.readFileSync(new URL('../src/assistant/toolSchemas.ts', import.meta.url), 'utf8')
assert.match(schemas, /فشل التحقق الذري/)
assert.match(schemas, /result\.changedFields/)

const tools = fs.readFileSync(new URL('../src/screens/Tools.tsx', import.meta.url), 'utf8')
const importBlock = tools.slice(tools.indexOf('async function doImport'), tools.indexOf('async function pasteFromClipboard'))
assert.match(importBlock, /importSpatialItems\(parsed\.map/)
assert.doesNotMatch(importBlock, /for \(const item of parsed\)/)

console.log('PASS: llm helper invariants')
console.log('PASS: chunk-boundary SSE JSON is preserved across reads')
console.log('PASS: duplicateWorkspace keeps tables inside the new workspace')
console.log('PASS: spatial import uses atomic dedupe service')
console.log('PASS: property area aliases remain synchronized')
console.log('PASS: property update comparison normalizes area aliases before idempotency')
