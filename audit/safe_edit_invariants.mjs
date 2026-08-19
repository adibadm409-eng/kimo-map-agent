import assert from 'node:assert/strict'
import fs from 'node:fs'

const crud = fs.readFileSync(new URL('../src/agent/crud.ts', import.meta.url), 'utf8')
const registry = fs.readFileSync(new URL('../src/agent/registry.ts', import.meta.url), 'utf8')
const executor = fs.readFileSync(new URL('../src/assistant/executor.ts', import.meta.url), 'utf8')
const prompts = fs.readFileSync(new URL('../src/assistant/prompts.ts', import.meta.url), 'utf8')

assert.match(crud, /لا تعدل المجاميع المالية للقطعة مباشرة/)
assert.match(crud, /إنشاء سجل plot_payments الخام محظور/)
assert.match(crud, /assertNonEmptyPatch\(spec\.entity, projectPatch\)/)
assert.match(registry, /name: 'preview_update'/)
assert.match(registry, /const changedFields = Object\.keys\(data\)/)
assert.match(registry, /const unknownFields = Object\.keys\(data\)/)
assert.match(registry, /حقول غير معروفة في/)
assert.match(executor, /getAgentFunctions\(runtimeSkill\)/)
assert.doesNotMatch(executor, /skillAllowsTool/)
assert.doesNotMatch(executor, /حُجبت أداة خارج نطاق المهارة/)
assert.match(prompts, /preview_update/)

console.log('Safe edit invariants: PASS')
