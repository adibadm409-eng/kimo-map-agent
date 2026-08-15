import assert from 'node:assert/strict'
import fs from 'node:fs'

const db = fs.readFileSync(new URL('../src/database/db.ts', import.meta.url), 'utf8')
const projects = fs.readFileSync(new URL('../src/database/projects.ts', import.meta.url), 'utf8')

for (const fn of ['updateProperty', 'updateClient', 'updateWaypoint', 'updateArea']) {
  const start = db.indexOf(`export async function ${fn}`)
  const next = db.indexOf('\nexport async function ', start + 1)
  const block = db.slice(start, next === -1 ? undefined : next)
  assert.match(block, /const entries = Object\.entries/)
  assert.match(block, /if \(!before\) throw new Error/)
  assert.doesNotMatch(block, /\|\| ''|\|\| 0|\|\| 'for_sale'/)
}

const savePlot = projects.slice(projects.indexOf('export async function savePlot'), projects.indexOf('export async function setPlotStatus'))
assert.match(savePlot, /if \(!before\) throw new Error/)
assert.match(savePlot, /const entries = Object\.entries\(patch\)/)

console.log('Partial update invariants: PASS')
