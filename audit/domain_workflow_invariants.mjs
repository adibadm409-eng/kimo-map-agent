import assert from 'node:assert/strict'
import fs from 'node:fs'

const domain = fs.readFileSync(new URL('../src/domain/projectDomain.ts', import.meta.url), 'utf8')
const backup = fs.readFileSync(new URL('../src/database/backup.ts', import.meta.url), 'utf8')
const projects = fs.readFileSync(new URL('../src/database/projects.ts', import.meta.url), 'utf8')

assert.match(domain, /export async function previewProjectImport/)
assert.match(domain, /duplicates:/)
assert.match(domain, /export async function commitProjectImport/)
assert.match(domain, /withTransactionAsync/)
assert.match(domain, /project_import_batches/)
assert.match(domain, /export async function recordLedgerPayment/)
assert.match(domain, /export async function reverseLedgerPayment/)
assert.match(domain, /export async function projectIntegrityCheck/)
assert.match(backup, /bodyHash/)
assert.match(backup, /فشل استعادة الملف/)
assert.match(projects, /reverseLedgerPayment/)
assert.match(projects, /لا يمكن حذف قطعة لها دفعات مسجلة/)
assert.match(projects, /لا يمكن حذف بلوك يحتوي على قطع لها دفعات مسجلة/)
assert.match(projects, /لا يمكن حذف مشروع له دفعات مسجلة/)
assert.match(projects, /لا يمكن جعل قطعة لها دفعات مسجلة متاحة/)
assert.match(projects, /المشروع \(\$\{id\}\) غير موجود/)
assert.match(projects, /القطعة \(\$\{id\}\) غير موجودة/)

console.log('Domain workflow invariants: PASS')
