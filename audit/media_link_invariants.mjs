import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const db = readFileSync(new URL('../src/database/db.ts', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../src/database/workspace.ts', import.meta.url), 'utf8')
const domain = readFileSync(new URL('../src/agent/domainTools.ts', import.meta.url), 'utf8')
const labels = readFileSync(new URL('../src/assistant/toolLabels.ts', import.meta.url), 'utf8')

assert.match(db, /CREATE TABLE IF NOT EXISTS entity_media/)
assert.match(db, /entity_type IN \('property', 'offer'\)/)
assert.match(db, /addColumnIfMissing\("offers", "media"/)
assert.match(db, /UPDATE offers SET media|INSERT INTO offers \(id,property_id,client_id,type,amount,status,date,notes,media\)/)
assert.match(workspace, /export async function linkAttachmentToEntity/)
assert.match(workspace, /source_attachment_id = \? AND entity_type = \? AND entity_id = \?/) 
assert.match(workspace, /return id/) 
assert.match(domain, /name: 'attach_media_to_entity'/)
assert.match(domain, /targetType !== 'property' && targetType !== 'offer'/)
assert.match(labels, /attach_media_to_entity: 'ربط الوسيط بالعقار أو العرض'/)
console.log('Media link invariants: PASS')
