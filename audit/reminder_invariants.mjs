import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(`[reminder invariant] ${message}`)
}

const notifications = read('src/notifications/offerReminders.ts')
const db = read('src/database/db.ts')
const domainTools = read('src/agent/domainTools.ts')
const skills = read('src/assistant/skills.ts')
const prompts = read('src/assistant/prompts.ts')
const app = read('App.tsx')
const remindersScreen = read('src/screens/Reminders.tsx')
const packageJson = JSON.parse(read('package.json'))

assert(packageJson.dependencies['expo-notifications'], 'expo-notifications dependency is required')
assert(notifications.includes('scheduleLocalReminder'), 'generic local scheduling must remain available')
assert(notifications.includes('SchedulableTriggerInputTypes.DATE'), 'reminders must use one-shot date triggers')
assert(notifications.includes('OFFER_REMINDER_CHANNEL'), 'Android notification channel must remain configured')
assert(db.includes('CREATE TABLE IF NOT EXISTS reminders'), 'reminders table must remain local and persistent')
assert(db.includes('export async function createReminder'), 'database createReminder helper is required')
assert(db.includes('export async function getAllReminders'), 'database list helper is required')
assert(db.includes('export async function cancelReminder'), 'database cancel helper is required')
assert(domainTools.includes("name: 'current_local_time'"), 'Kimo must have current local time tool')
for (const tool of ['create_reminder', 'list_reminders', 'cancel_reminder', 'create_offer_with_reminder', 'offer_reminder_set']) {
  assert(domainTools.includes(`name: '${tool}'`), `Kimo tool ${tool} must remain registered`)
}
assert(skills.includes("'ذكرني'") && skills.includes('create_reminder'), 'Kimo reminder skill must match natural reminder requests')
assert(prompts.includes('لا تحوّله إلى ملاحظة نصية فقط'), 'Kimo must be instructed to create real local reminders')
assert(app.includes("name=\"Reminders\" component={Reminders}"), 'Reminders screen must be reachable')
assert(remindersScreen.includes('cancelReminder'), 'user must be able to cancel reminders from the app')
console.log('reminder_invariants: PASS')
