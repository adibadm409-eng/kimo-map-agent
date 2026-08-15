import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('.', import.meta.url).pathname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const types = read('src/types/index.ts')
const db = read('src/database/db.ts')
const form = read('src/screens/PropertyForm.tsx')
const list = read('src/screens/Properties.tsx')
const catalog = read('src/agent/catalog.ts')
const mapFilters = read('src/screens/MapScreenV2/cards/LayersCard.tsx')
const prompts = read('src/assistant/prompts.ts')
const screenCatalog = read('src/agent/screenCatalog.ts')

const requiredTypes = ['house', 'hotel', 'building', 'residential_tower', 'farm', 'land', 'warehouse', 'shop']
for (const type of requiredTypes) {
  if (!types.includes(`${type}:` ) && !types.includes(`'${type}'`)) throw new Error(`missing property type: ${type}`)
  if (!types.includes(`${type}:`)) throw new Error(`missing type label: ${type}`)
  if (!catalog.includes(`${type}:`)) throw new Error(`Kimo catalog missing type: ${type}`)
}
for (const field of ['icon_uri', 'broker_name', 'broker_phone']) {
  if (!types.includes(`${field}: string`)) throw new Error(`type field missing: ${field}`)
  if (!db.includes(`"properties", "${field}"`)) throw new Error(`migration missing: ${field}`)
  if (!db.includes(field)) throw new Error(`db support missing: ${field}`)
  if (!form.includes(field)) throw new Error(`form support missing: ${field}`)
  if (!catalog.includes(`f('${field}'`)) throw new Error(`Kimo field missing: ${field}`)
}
for (const marker of ['ImagePicker.launchImageLibraryAsync', 'documentDirectory', 'broker_name', 'broker_phone']) {
  if (!form.includes(marker)) throw new Error(`form marker missing: ${marker}`)
}
for (const marker of ['typeFilter', 'priceMin', 'priceMax', 'TYPE_FILTERS', 'PRICE_PRESETS', 'propertyIconImage']) {
  if (!list.includes(marker)) throw new Error(`list filter/icon marker missing: ${marker}`)
}
if (!mapFilters.includes('TYPE_LABELS') || !mapFilters.includes('Object.entries(TYPE_LABELS)')) throw new Error('map filters are not using the central property types')
for (const marker of ['icon_uri', 'broker_name', 'broker_phone', 'residential_tower', 'warehouse']) {
  if (!prompts.includes(marker)) throw new Error(`Kimo prompt marker missing: ${marker}`)
}
if (!screenCatalog.includes('الصورة الاختيارية') || !screenCatalog.includes('ميّز الدلال عن المالك')) throw new Error('screen catalog policy is not updated')
console.log('Property metadata invariants: PASS')
