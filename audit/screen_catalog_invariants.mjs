import assert from 'node:assert/strict'
import { SCREEN_CATALOG, getScreenCatalog } from '../src/agent/screenCatalog.ts'

assert.ok(SCREEN_CATALOG.length >= 8)
for (const screen of SCREEN_CATALOG) {
  assert.ok(screen.id && screen.route && screen.label)
  assert.ok(screen.entities.length > 0)
  assert.ok(screen.readTools.length > 0)
  assert.ok(typeof screen.safeEditPolicy === 'string' && screen.safeEditPolicy.length > 20)
  assert.ok(screen.verificationTools.length > 0)
}

const projects = getScreenCatalog('projects')
assert.equal(projects.length, 1)
assert.equal(projects[0].risk, 'critical')
assert.ok(projects[0].writeTools.includes('project_import_commit'))
assert.ok(projects[0].verificationTools.includes('project_integrity_check'))

const settings = getScreenCatalog('الإعدادات')
assert.equal(settings.length, 1)
assert.equal(settings[0].risk, 'critical')

console.log('Screen catalog invariants: PASS')
