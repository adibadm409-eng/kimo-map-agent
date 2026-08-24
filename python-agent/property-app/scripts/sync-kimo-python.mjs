// ينسخ حزمة kimo ومدخل kimo_embed إلى مجلد بايثون الخاص بـ Chaquopy قبل بناء
// أندرويد، ليتضمّن المحرك داخل التطبيق المبني. شغّله ضمن prebuild.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, '..', 'kimo')                      // python-agent/kimo
const entry = resolve(root, '..', 'kimo_embed.py')            // python-agent/kimo_embed.py
const dest = resolve(root, 'android', 'app', 'src', 'main', 'python')

rmSync(dest, { recursive: true, force: true })
mkdirSync(resolve(dest, 'kimo'), { recursive: true })
cpSync(src, resolve(dest, 'kimo'), { recursive: true })
cpSync(entry, resolve(dest, 'kimo_embed.py'))
console.log('Copied kimo engine into', dest)
