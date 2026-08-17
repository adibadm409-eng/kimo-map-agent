import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(`[unified reminder invariant] ${message}`)
}

const db = read('src/database/db.ts')
const tools = read('src/agent/domainTools.ts')
const prompts = read('src/assistant/prompts.ts')
const offers = read('src/screens/Offers.tsx')
const reminders = read('src/screens/Reminders.tsx')
const notifications = read('src/notifications/offerReminders.ts')

assert(db.includes('export async function createEntityReminder'), 'a single canonical creator must exist')
assert(db.includes("if (targetType !== 'general' && !targetId)"), 'non-general reminders must require a target id')
assert(db.includes('target_type, target_id'), 'canonical insert must persist both target columns')
assert(db.includes('export async function getRemindersForTarget'), 'target-scoped reads must exist')
assert(db.includes("FROM reminders WHERE target_type = 'offer'"), 'offer reads must route through canonical reminders')
assert(db.includes('export async function createReminder'), 'general helper must remain available')
assert(db.includes('target_type?: string; target_id?: string'), 'general helper must accept optional target')
assert(tools.includes("name: 'create_reminder'"), 'Kimo create reminder tool must remain registered')
assert(tools.includes("name: 'list_offer_reminders'"), 'Kimo must expose offer-scoped listing')
assert(tools.includes("name: 'reminders'"), 'offer creation must accept reminders array')
assert(tools.includes('target_type'), 'Kimo must expose target_type')
assert(tools.includes('target_id'), 'Kimo must expose target_id')
assert(prompts.includes('عدة تنبيهات'), 'prompt must teach multiple reminders')
assert(prompts.includes('target_type وtarget_id'), 'prompt must teach target routing')
assert(offers.includes('createOfferReminder'), 'offer UI must append reminders rather than replace them')
assert(offers.includes('cancelOfferReminderById'), 'offer UI must cancel one reminder by id')
assert(!offers.includes('scheduleOfferReminder'), 'offer UI must not schedule outside the canonical DB path')
assert(offers.includes('o.reminders'), 'offer cards must render reminder collections')
assert(reminders.includes('targetLabel'), 'reminders screen must identify target relation')
assert(notifications.includes('return Notifications.scheduleNotificationAsync'), 'each reminder must receive its own native notification id')
assert(notifications.includes("type: 'offer-reminder'"), 'offer reminders must retain native notification metadata')
console.log('unified_reminder_target_invariants: PASS')
