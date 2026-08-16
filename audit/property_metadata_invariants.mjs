import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('.', import.meta.url).pathname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const types = read('src/types/index.ts')
const db = read('src/database/db.ts')
const form = read('src/screens/PropertyForm.tsx')
const list = read('src/screens/Properties.tsx')
const clients = read('src/screens/Clients.tsx')
const catalog = read('src/agent/catalog.ts')
const mapFilters = read('src/screens/MapScreenV2/cards/LayersCard.tsx')
const prompts = read('src/assistant/prompts.ts')
const screenCatalog = read('src/agent/screenCatalog.ts')
const detail = read('src/screens/PropertyDetail.tsx')
const media = read('src/screens/MapScreenV2/cards/shareMedia.tsx')

const requiredTypes = ['house', 'hotel', 'building', 'residential_tower', 'farm', 'land', 'warehouse', 'shop']
for (const type of requiredTypes) {
  if (!types.includes(`${type}:` ) && !types.includes(`'${type}'`)) throw new Error(`missing property type: ${type}`)
  if (!types.includes(`${type}:`)) throw new Error(`missing type label: ${type}`)
  if (!catalog.includes(`${type}:`)) throw new Error(`Kimo catalog missing type: ${type}`)
}
for (const field of ['icon_uri', 'broker_name', 'broker_phone', 'media']) {
  if (!types.includes(`${field}: string`)) throw new Error(`type field missing: ${field}`)
  if (!db.includes(`"properties", "${field}"`)) throw new Error(`migration missing: ${field}`)
  if (!db.includes(field)) throw new Error(`db support missing: ${field}`)
  if (!form.includes(field)) throw new Error(`form support missing: ${field}`)
  if (!catalog.includes(`f('${field}'`)) throw new Error(`Kimo field missing: ${field}`)
}
for (const marker of ['ImagePicker.launchImageLibraryAsync', 'handlePickMedia', 'property_media', 'documentDirectory', 'broker_name', 'broker_phone', 'setLoading(false)']) {
  if (!form.includes(marker)) throw new Error(`form marker missing: ${marker}`)
}
for (const marker of ['typeFilter', 'priceMin', 'priceMax', 'TYPE_FILTERS', 'PRICE_PRESETS', 'propertyIconImage', 'mediaCount', 'propertyCard']) {
  if (!list.includes(marker)) throw new Error(`list filter/icon marker missing: ${marker}`)
}
if (!mapFilters.includes('TYPE_LABELS') || !mapFilters.includes('Object.entries(TYPE_LABELS)')) throw new Error('map filters are not using the central property types')
if (list.includes('numColumns={2}') || clients.includes('numColumns={2}')) throw new Error('main cards still use the cramped two-column layout')
for (const marker of ['propertyCardTop', 'propertyFooter']) if (!list.includes(marker)) throw new Error(`property card marker missing: ${marker}`)
for (const marker of ['clientTop', 'clientContacts']) if (!clients.includes(marker)) throw new Error(`client card marker missing: ${marker}`)
for (const marker of ['icon_uri', 'broker_name', 'broker_phone', 'residential_tower', 'warehouse']) {
  if (!prompts.includes(marker)) throw new Error(`Kimo prompt marker missing: ${marker}`)
}
if ((!screenCatalog.includes('الصورة الاختيارية') && !screenCatalog.includes('صورة الأيقونة الاختيارية')) || !screenCatalog.includes('ميّز الدلال عن المالك')) throw new Error('screen catalog policy is not updated')
for (const marker of ['parseMediaList', 'MediaStrip', 'MediaPreview', 'generateThumbnailsAsync', 'VideoView', 'إغلاق معاينة الوسائط']) {
  if (!media.includes(marker) && !detail.includes(marker)) throw new Error(`media preview marker missing: ${marker}`)
}
for (const marker of ['parseMediaList', 'MediaStrip', 'MediaPreview', 'setPreviewIdx']) {
  if (!detail.includes(marker)) throw new Error(`property detail media marker missing: ${marker}`)
}
console.log('Property media preview invariants: PASS')
console.log('Property metadata invariants: PASS')
