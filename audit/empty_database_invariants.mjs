import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('.', import.meta.url).pathname, '..')
const db = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8')
const projects = fs.readFileSync(path.join(root, 'src/database/projects.ts'), 'utf8')

for (const marker of ['seedData(', 'seedProjectsData(', 'demoPlots', 'demoPayments', 'demoPlotNotes']) {
  if (db.includes(marker) || projects.includes(marker)) throw new Error(`demo seed marker remains: ${marker}`)
}
for (const marker of ['removeLegacyDemoData(database)', 'removeLegacyDemoProject()', 'No demo records are inserted']) {
  if (!db.includes(marker) && !projects.includes(marker)) throw new Error(`empty database guard missing: ${marker}`)
}
for (const marker of ['CREATE TABLE IF NOT EXISTS properties', 'CREATE TABLE IF NOT EXISTS projects', 'purgeOrphanedData()']) {
  if (!db.includes(marker) && !projects.includes(marker)) throw new Error(`schema initialization marker missing: ${marker}`)
}
console.log('Empty database invariants: PASS')
