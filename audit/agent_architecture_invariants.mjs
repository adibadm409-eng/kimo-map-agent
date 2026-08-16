import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const executor = readFileSync(new URL('../src/assistant/executor.ts', import.meta.url), 'utf8')
const prompts = readFileSync(new URL('../src/assistant/prompts.ts', import.meta.url), 'utf8')
const registry = readFileSync(new URL('../src/agent/registry.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/assistant/store.ts', import.meta.url), 'utf8')
const skills = readFileSync(new URL('../src/assistant/skills.ts', import.meta.url), 'utf8')

assert.match(skills, /export interface SkillAssessment/)
assert.match(skills, /shouldPlan = intent === 'execution'/)
assert.match(prompts, /getAgentFunctions\(skill\?/) 
assert.match(prompts, /visibleTools = TOOLS\.filter/)
assert.match(executor, /const skillAllowsTool =/)
assert.match(registry, /export function validateToolArgs/)
assert.match(registry, /\[TOOL_INPUT_INVALID\]/)
assert.match(store, /const TASK_TRANSITIONS/)
assert.match(store, /status === 'completed' && \(!patch\.evidence/)
assert.match(executor, /transitionTaskRun\(runtimeTaskId, 'awaiting_user'/)
assert.match(executor, /getLatestTaskRun\(sessionId\)/)
console.log('Agent architecture invariants: PASS')
