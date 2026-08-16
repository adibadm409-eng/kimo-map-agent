import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const screen = readFileSync(new URL('../src/screens/assistant/AssistantScreen.tsx', import.meta.url), 'utf8')
const executor = readFileSync(new URL('../src/assistant/executor.ts', import.meta.url), 'utf8')
const llm = readFileSync(new URL('../src/assistant/llm.ts', import.meta.url), 'utf8')
const history = readFileSync(new URL('../src/assistant/history.ts', import.meta.url), 'utf8')
const appConfig = readFileSync(new URL('../app.json', import.meta.url), 'utf8')
const providers = readFileSync(new URL('../src/assistant/providers.ts', import.meta.url), 'utf8')

assert.match(screen, /const activePlan = agentPlan && !\['complete', 'cancelled'\]\.includes\(agentPlan\.status\)\s*\? agentPlan : null/)
assert.match(screen, /const visible = busy \|\| thinking \|\| !!pending \|\| !!activePlan \|\| liveProgress\.length > 0 \|\| liveSteps\.length > 0/)
assert.match(screen, /kbHeight > 0 \? kbHeight \+ 4/)
assert.match(screen, /agentPanelCollapsed/)
assert.match(appConfig, /softwareKeyboardLayoutMode.*resize/)
assert.match(providers, /export function providerCapabilities/)
assert.match(executor, /const shouldPlan = match\.score > 0\.1 && runtimeSkill\.id !== 'general_assistant'/)
assert.match(executor, /runtimePlan = shouldPlan \? planForSkill\(runtimeSkill, goal\) : null/)
assert.match(executor, /if \(emitEvents && shouldPlan && runtimePlan\)/)
assert.match(llm, /export function normalizeToolCallId/)
assert.match(llm, /id: normalizeToolCallId\(call\.id \?\? raw\.id\)/)
assert.match(history, /normalizeToolCallId\(m\.meta\.tool_call_id\)/)
console.log('Assistant panel invariants: PASS')
