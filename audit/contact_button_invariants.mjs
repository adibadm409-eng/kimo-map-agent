import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const button = read('src/components/CallButton.tsx')
assert.match(button, /Linking\.openURL\(`tel:\$\{number\}`\)/)
assert.match(button, /accessibilityHint="يفتح تطبيق الاتصال مباشرة"/)
assert.match(button, /event\.stopPropagation\(\)/)

for (const file of [
  'src/screens/Clients.tsx',
  'src/screens/ClientDetail.tsx',
  'src/screens/Properties.tsx',
  'src/screens/PropertyDetail.tsx',
  'src/screens/MapScreenV2/cards/DetailCard.tsx',
]) {
  assert.match(read(file), /CallButton/, `${file} is missing CallButton integration`)
}

assert.match(read('src/screens/Clients.tsx'), /CallButton phone=\{c\.phone\} compact/)
assert.match(read('src/screens/Properties.tsx'), /CallButton phone=\{p\.broker_phone\} compact/)
assert.match(read('src/screens/ClientDetail.tsx'), /CallButton phone=\{client\.phone\} compact/)
assert.match(read('src/screens/PropertyDetail.tsx'), /CallButton phone=\{property\.(broker_phone|owner_phone)\}/)
assert.match(read('src/screens/MapScreenV2/cards/DetailCard.tsx'), /function PhoneRow/)
assert.match(read('src/screens/MapScreenV2/cards/DetailCard.tsx'), /CallButton phone=\{value\} compact/)

console.log('Contact button invariants: PASS')
