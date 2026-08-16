import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(`[offer relationship invariant] ${message}`)
}

const db = read('src/database/db.ts')
const crud = read('src/agent/crud.ts')
const offerForm = read('src/screens/OfferForm.tsx')
const appJson = JSON.parse(read('app.json'))
const clientForm = read('src/screens/ClientForm.tsx')
const propertyForm = read('src/screens/PropertyForm.tsx')
const contactPicker = read('src/components/ContactPickerButton.tsx')
const prompts = read('src/assistant/prompts.ts')
const registry = read('src/agent/registry.ts')

assert(contactPicker.includes('expo-contacts'), 'contact picker must use device contacts')
assert(contactPicker.includes('onSelect'), 'contact picker must return selected name and phone')
assert(clientForm.includes('ContactPickerButton'), 'client form must support contact selection')
assert(offerForm.includes('ContactPickerButton'), 'offer form must support selecting the buyer from contacts')
assert(appJson.expo?.plugins?.some((plugin) => Array.isArray(plugin) ? plugin[0] === 'expo-contacts' : plugin === 'expo-contacts'), 'expo-contacts plugin must be configured')
assert(propertyForm.includes('اختيار جهة اتصال المالك') && propertyForm.includes('اختيار جهة اتصال الدلال'), 'property form must support separate owner and broker contacts')
assert(db.includes('property_id TEXT,') && db.includes('ON DELETE SET NULL'), 'offer property relation must be optional and safe')
assert(db.includes('ensureOfferPropertyOptional'), 'existing offer databases need nullable-property migration')
assert(db.includes('export async function getOffer') && db.includes('export async function updateOffer'), 'offers must be readable and editable after creation')
assert(crud.includes("case 'offers':") && crud.includes('updateOffer'), 'Kimo update must use offer-specific update')
assert(offerForm.includes('editingId') && offerForm.includes('updateOffer'), 'offer form must support negotiation edits')
assert(offerForm.includes('form.type === \'sell_offer\' && !form.property_id'), 'sell offers must require a property while buy requests can remain unlinked')
assert(prompts.includes('property_id اختياري لطلب الشراء'), 'Kimo must understand optional property linkage')
assert(registry.includes('property_id اختياري لعرض طلب الشراء'), 'generic create tool must describe optional property linkage')
console.log('offer_relationship_invariants: PASS')
