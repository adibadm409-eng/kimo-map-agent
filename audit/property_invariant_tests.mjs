import fs from 'node:fs'
import assert from 'node:assert/strict'

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

const sseChunk1 = 'data: {"choices":[{"delta":{"content":"مرحبا"}}]}\n\ndata: {"choices":[{"delta":'
const sseChunk2 = '"content":"تكملة"}}]}\n\ndata: [DONE]\n\n'
const parsed1 = splitSse(sseChunk1)
const parsed2 = splitSse(sseChunk2)
assert.equal(parsed1.length, 2, 'first network chunk returns one complete event plus one incomplete fragment')
assert.equal(parsed2.length, 1, 'second network chunk returns only the DONE event because the continuation has no data prefix')
let lostBoundaryEvent = false
try { JSON.parse(parsed1[1].data) } catch { lostBoundaryEvent = true }
assert.equal(lostBoundaryEvent, true, 'chunk-boundary JSON is lost by splitSse when caller does not buffer')

assert.deepEqual(parseToolArgs('{"n":7}'), { n: 7 })
assert.deepEqual(parseToolArgs({ n: 7 }), { n: 7 })
const wire = toWireToolCall({ id: 'abc123456', name: 'query', arguments: '{"entity":"property"}', extra: { thought_signature: 'sig', raw: { index: 0, type: 'function' } } })
assert.equal(wire.function.name, 'query')
assert.equal(wire.function.arguments, '{"entity":"property"}')
assert.equal(wire.function.thought_signature, 'sig')
assert.equal('index' in wire.function, false)

const workspace = fs.readFileSync('/home/ubuntu/property-manager-app/src/database/workspace.ts', 'utf8')
const duplicateBlock = workspace.slice(workspace.indexOf('export async function duplicateWorkspace'), workspace.indexOf('// ---------- المرفقات ----------'))
assert.match(duplicateBlock, /const newId = await createWorkspace/)
assert.match(duplicateBlock, /await duplicateTable\(t\.id, t\.name\)/)
assert.doesNotMatch(duplicateBlock, /duplicateTable\(t\.id, t\.name, newId\)/)

const tools = fs.readFileSync('/home/ubuntu/property-manager-app/src/screens/Tools.tsx', 'utf8')
const importBlock = tools.slice(tools.indexOf('async function doImport'), tools.indexOf('async function pasteFromClipboard'))
assert.match(importBlock, /for \(const item of parsed\)/)
assert.doesNotMatch(importBlock, /withTransactionAsync|findDuplicate|dedupe|rollback/i)

console.log('PASS: llm helper invariants')
console.log('PASS: chunk-boundary loss reproduced for current splitSse call pattern')
console.log('PASS: duplicateWorkspace static defect reproduced')
console.log('PASS: spatial import lacks dedupe/transaction path reproduced')
