import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = fs.readFileSync(new URL('../src/assistant/store.ts', import.meta.url), 'utf8')
const maps = fs.readFileSync(new URL('../src/screens/MapScreenV2/mapProviders.ts', import.meta.url), 'utf8')
const backup = fs.readFileSync(new URL('../src/database/backup.ts', import.meta.url), 'utf8')

assert.match(store, /expo-secure-store/)
assert.match(store, /const SECRET_PREFIX/)
assert.match(store, /JSON\.stringify\(secretState\.keys\)/)
assert.match(store, /return \{ keys: \{\}, customProviders: sanitizedCustom \}/)
assert.match(maps, /MAP_SECRET_PREFIX/)
assert.match(maps, /JSON\.stringify\(fileState\)/)
assert.match(backup, /bodyHash/)
assert.match(backup, /includesKeys/)

console.log('Secret storage invariants: PASS')
