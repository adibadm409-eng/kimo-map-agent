import assert from 'node:assert/strict'
import { validateToolArguments, validateToolCallBatch } from '../src/assistant/toolValidation.ts'

const definitions = [{
  name: 'create_client',
  description: 'إنشاء عميل',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string' }, budget: { type: 'number' } },
    required: ['name'],
    additionalProperties: false,
  },
}]

assert.equal(validateToolArguments('{"name":"علي","budget":100}', definitions[0].parameters).ok, true)
assert.equal(validateToolArguments('{"budget":100}', definitions[0].parameters).ok, false)
assert.equal(validateToolArguments('{"name":"علي","unexpected":true}', definitions[0].parameters).ok, false)
assert.equal(validateToolArguments('{"name":', definitions[0].parameters).ok, false)

const badBatch = validateToolCallBatch([
  { id: 'c1', name: 'create_client', arguments: '{"name":"علي"}' },
  { id: 'c1', name: 'missing_tool', arguments: '{}' },
], definitions, false)
assert.ok(badBatch.some((issue) => issue.code === 'duplicate_tool_id'))
assert.ok(badBatch.some((issue) => issue.code === 'unknown_tool'))
assert.ok(badBatch.some((issue) => issue.code === 'parallel_not_allowed'))

console.log('Tool validation invariants: PASS')
