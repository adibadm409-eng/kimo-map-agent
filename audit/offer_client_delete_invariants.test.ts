import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchSkill } from '../src/assistant/skills'

const root = path.resolve(__dirname, '..')
const dbSource = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8')
const typesSource = fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8')
const offersScreen = fs.readFileSync(path.join(root, 'src/screens/Offers.tsx'), 'utf8')
const propertyDetail = fs.readFileSync(path.join(root, 'src/screens/PropertyDetail.tsx'), 'utf8')
const domainToolsSource = fs.readFileSync(path.join(root, 'src/agent/domainTools.ts'), 'utf8')
const registrySource = fs.readFileSync(path.join(root, 'src/agent/registry.ts'), 'utf8')
const initSchemaSource = dbSource.slice(dbSource.indexOf('async function initSchema'))
const offerSchemaSource = initSchemaSource.slice(initSchemaSource.indexOf('CREATE TABLE IF NOT EXISTS offers'), initSchemaSource.indexOf('CREATE TABLE IF NOT EXISTS entity_media'))

describe('offer/client deletion invariants', () => {
  it('creates offers with an optional client and preserves them with SET NULL on client deletion', () => {
    expect(dbSource).toContain('client_id TEXT,')
    expect(dbSource).toContain('FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL')
    expect(dbSource).toContain('async function ensureOfferClientOptional')
    expect(dbSource).toContain('await ensureOfferClientOptional(database)')
    expect(dbSource).toContain('NULLIF(client_id, \'\')')
    expect(offerSchemaSource).not.toContain('client_id TEXT NOT NULL')
    expect(offerSchemaSource).not.toContain('ON DELETE CASCADE')
  })

  it('routes Arabic client deletion to the client mutation skill', () => {
    const match = matchSkill('نعم، نفّذ الآن حذف العميل QA-SETNULL-CLIENT-2026 فقط')
    expect(match.skill.id).toBe('client_relationship')
    expect(match.skill.writeTools).toContain('mutate_record')
    expect(match.skill.readTools).toContain('list_reminders')
    expect(match.skill.writeTools).toEqual(['mutate_record'])
    const approvalMatch = matchSkill('[موافقة المستخدم على حذف: العملاء: QA-SETNULL-CLIENT-2026 — 777998001 — buyer]')
    expect(approvalMatch.skill.id).toBe('client_relationship')
    expect(approvalMatch.skill.readTools).toContain('list_reminders')
  })

  it('resolves offer reminders when the user supplies a property identity', () => {
    expect(domainToolsSource).toContain("targetType === 'offer'")
    expect(domainToolsSource).toContain('property_name')
    expect(domainToolsSource).toContain("getRemindersForTarget('offer', offerId)")
  })

  it('normalizes natural property/client identities before query filters', () => {
    expect(registrySource).toContain('resolveOfferRelationFilters')
    expect(registrySource).toContain("property_id: 'properties'")
    expect(registrySource).toContain("client_id: 'clients'")
    expect(registrySource).toContain("op: 'in'")
  })

  it('keeps offer contracts nullable and gives the UI an explicit deleted-client label', () => {
    expect(typesSource).toContain('client_id: string | null')
    expect(offersScreen).toContain('بدون عميل — العميل محذوف')
    expect(propertyDetail).toContain('بدون عميل — العميل محذوف')
  })
})
