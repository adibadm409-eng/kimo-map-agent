import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(new URL('.', import.meta.url).pathname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))
const gitignore = read('.gitignore')
const app = read('app.json')

if (pkg.dependencies?.['expo-status-bar'] || pkg.devDependencies?.['expo-status-bar']) throw new Error('unused expo-status-bar dependency remains')
if (!gitignore.includes('/.tilecache/')) throw new Error('generated tile cache is not ignored')
if (app.includes('assets/adaptive-icon.png') || app.includes('assets/splash-icon.png')) throw new Error('app config references deleted duplicate assets')
for (const forbidden of ['screens/map/tools/', 'screens/map/modals/', 'leafletBundle', 'DrawCard', 'ThinkingSteps']) {
  let output = ''
  try {
    output = execFileSync('rg', ['-n', '--glob', '!node_modules/**', '--glob', '!dist/**', '--glob', '!package-lock.json', forbidden, path.join(root, 'src'), path.join(root, 'App.tsx')], { encoding: 'utf8' })
  } catch (error) {
    output = error?.stdout?.toString?.() || ''
  }
  if (output) throw new Error(`dead-code reference remains: ${forbidden}`)
}
console.log('Cleanup invariants: PASS')
