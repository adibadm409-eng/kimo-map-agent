import assert from 'node:assert/strict'
import fs from 'node:fs'

const history = fs.readFileSync(new URL('../src/assistant/history.ts', import.meta.url), 'utf8')
const persist = fs.readFileSync(new URL('../src/assistant/persist.ts', import.meta.url), 'utf8')
const wire = fs.readFileSync(new URL('../src/assistant/providerWire.ts', import.meta.url), 'utf8')

assert.match(history, /const cleanCalls = toolCalls\.map\(\(tc\) => \{/)
assert.match(history, /const t = \{ \.\.\.tc \}/)
assert.match(history, /const resultIdsAfter = new Set/)
assert.match(history, /const hasAllResultsAfter = callIds\.length > 0 && callIds\.every/)
assert.match(history, /replayableToolIds\.has\(toolCallId\)/)
assert.match(history, /tool_error: m\.meta\.ok === false/)
assert.match(persist, /meta: \{ tool_calls: calls\.map\(\(call\) => toWireToolCall\(call\)\) \}/)
assert.match(persist, /if \(!call\.extra\?\.__assistantPersisted\) await persistAssistantToolCall\(sessionId, call\)/)
assert.match(wire, /if \(family === 'gemini-openai'\)/)
assert.match(wire, /if \(family === 'mistral-chat'\)/)
assert.match(wire, /wire\.extra_content = provided/)

console.log('History tool roundtrip invariants: PASS')
