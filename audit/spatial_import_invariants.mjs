import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync(new URL('../src/database/spatialImport.ts', import.meta.url), 'utf8')
const tools = fs.readFileSync(new URL('../src/screens/Tools.tsx', import.meta.url), 'utf8')

assert.match(service, /withTransactionAsync/)
assert.match(service, /SELECT id FROM waypoints/)
assert.match(service, /SELECT id FROM areas/)
assert.match(service, /إحداثيات غير صالحة/)
assert.match(service, /لم يُحفظ أي عنصر من عملية الاستيراد/)
assert.match(tools, /importSpatialItems\(/)
assert.doesNotMatch(tools, /for \(const item of parsed\)/)

console.log('Spatial import invariants: PASS')
