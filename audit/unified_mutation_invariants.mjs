import assert from 'node:assert/strict'
import { buildToolSchemas, adaptToolArgs } from '../src/assistant/toolSchemas.ts'
import { getAgentFunctions } from '../src/assistant/prompts.ts'
import { getSkillById } from '../src/assistant/skills.ts'

const schemas = buildToolSchemas()
assert.ok(schemas.mutate_record, 'mutate_record must be registered')
assert.deepEqual(schemas.mutate_record.properties.operation.enum, ['create', 'update', 'delete'])
assert.ok(Array.isArray(schemas.mutate_record.properties.entity.enum))
assert.equal(schemas.mutate_record.properties.entity.enum.includes('properties'), true)

const add = adaptToolArgs('mutate_record', { action: 'add', entity: 'عقار', values: { name: 'اختبار' } })
assert.equal(add.operation, 'create')
assert.equal(add.entity, 'properties')
assert.deepEqual(add.data, { name: 'اختبار' })

const edit = adaptToolArgs('mutate_record', { mode: 'edit', entity: 'عميل', id: 'client-1', data: { phone: '700000000' } })
assert.equal(edit.operation, 'update')
assert.equal(edit.entity, 'clients')
assert.equal(edit.id, 'client-1')

const remove = adaptToolArgs('mutate_record', { operation: 'remove', entity: 'عرض', id: 'offer-1' })
assert.equal(remove.operation, 'delete')
assert.equal(remove.entity, 'offers')

for (const skillId of ['project_operations', 'property_management', 'client_relationship', 'offer_management']) {
  const skill = getSkillById(skillId)
  assert.ok(skill, `${skillId} must exist`)
  const names = getAgentFunctions(skill).map((f) => f.name)
  assert.equal(names.includes('mutate_record'), true, `${skillId} must expose mutate_record`)
  assert.equal(names.includes('create'), false, `${skillId} must not expose legacy create`)
  assert.equal(names.includes('update'), false, `${skillId} must not expose legacy update`)
  assert.equal(names.includes('delete'), false, `${skillId} must not expose legacy delete`)
}

console.log('Unified mutation invariants: PASS')
