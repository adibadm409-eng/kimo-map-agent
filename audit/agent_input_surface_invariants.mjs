import assert from 'node:assert/strict'
import fs from 'node:fs'

const executor = fs.readFileSync(new URL('../src/assistant/executor.ts', import.meta.url), 'utf8')
const screen = fs.readFileSync(new URL('../src/screens/assistant/AssistantScreen.tsx', import.meta.url), 'utf8')
const history = fs.readFileSync(new URL('../src/assistant/history.ts', import.meta.url), 'utf8')
const persist = fs.readFileSync(new URL('../src/assistant/persist.ts', import.meta.url), 'utf8')
const invokeTools = fs.readFileSync(new URL('../src/assistant/invokeTools.ts', import.meta.url), 'utf8')

for (const marker of [
  'export async function sendUserMessage',
  'attachments?:',
  'audio?:',
  'readAudioInput(',
  'initialContent =',
  'runGuarded(sessionId, conn, true, initialContent)',
  'export async function answerAsk',
  'export async function answerConfirmation',
  'isCancelled(sessionId)',
]) assert.match(executor, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing executor route: ${marker}`)

for (const marker of ['persistAssistantToolCalls', 'tool_call_id', 'toWireToolCall']) assert.match(persist, new RegExp(marker), `missing persistence contract: ${marker}`)
for (const marker of ['messagesToLlm', 'tool_call_id', 'tool_calls']) assert.match(history, new RegExp(marker), `missing history contract: ${marker}`)
for (const marker of ['handleToolCall', 'request_confirmation', 'ask_user']) assert.match(invokeTools, new RegExp(marker), `missing tool control: ${marker}`)
for (const marker of ['useAudioRecorder', 'const [attachments', 'DocumentPicker', 'handleSend', 'cancelAgent', 'إيقاف التسجيل ومعاينته', 'audioDraft', 'حذف التسجيل الصوتي']) assert.ok(screen.includes(marker), `missing UI route: ${marker}`)

console.log('Agent input surface invariants: PASS')
