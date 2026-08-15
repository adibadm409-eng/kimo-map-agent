import assert from 'node:assert/strict'
import { matchSkill, planForSkill } from '../src/assistant/skills.ts'

const project = matchSkill('استيراد جدول مشروع أراضي فيه بلوكات وقطع')
assert.equal(project.skill.id, 'project_import')
assert.ok(planForSkill(project.skill, 'استيراد مشروع').steps.some((s) => s.id === 'preview'))

const cashflow = matchSkill('سجل دفعة قسط بنكي على الوحدة واعرض المتبقي')
assert.equal(cashflow.skill.id, 'cashflow')
assert.ok(cashflow.skill.writeTools.includes('ledger_record_payment'))
assert.equal(cashflow.skill.writeTools.includes('update'), false)

const review = matchSkill('راجع سلامة المشروع والفروقات المالية')
assert.equal(review.skill.id, 'project_review')
assert.ok(review.skill.verificationTools.includes('project_integrity_check'))

const general = matchSkill('ما الذي تستطيع فعله؟')
assert.equal(general.skill.id, 'general_assistant')

console.log('Kimo skill invariants: PASS')
