import assert from 'node:assert/strict'
import { assessSkill } from '../src/assistant/skills.ts'
import { providerCapabilities } from '../src/assistant/providers.ts'
import { normalizeToolCallId } from '../src/assistant/llm.ts'

const greeting = assessSkill('مرحباً')
assert.equal(greeting.shouldPlan, false)
assert.equal(greeting.intent, 'conversation')

const generalQuestion = assessSkill('ما الذي تستطيع فعله؟')
assert.equal(generalQuestion.shouldPlan, false)
assert.equal(generalQuestion.intent, 'question')

const offerTask = assessSkill('أنشئ عرض بيع لهذا العقار واربط تذكيراً للمتابعة')
assert.equal(offerTask.shouldPlan, true)
assert.equal(offerTask.match.skill.id, 'offer_management')

const propertyTask = assessSkill('عدّل سعر العقار وأضف صورة للبيت')
assert.equal(propertyTask.shouldPlan, true)
assert.equal(propertyTask.match.skill.id, 'property_management')

const clientTask = assessSkill('أنشئ عميلاً جديداً برقم الهاتف الموجود')
assert.equal(clientTask.shouldPlan, true)
assert.equal(clientTask.match.skill.id, 'client_relationship')

const workspaceTask = assessSkill('أنشئ جدولاً جديداً للقطع وأضف الصفوف')
assert.equal(workspaceTask.shouldPlan, true)
assert.equal(workspaceTask.match.skill.id, 'workspace_operations')

const custom = providerCapabilities({ id: 'custom', name: 'custom', color: '', baseUrl: '', defaultModels: [], modelsKind: 'openai' }, 'model-x')
assert.equal(custom.supportsStreamOptions, false)
assert.equal(custom.maxTokensField, 'max_tokens')

const modernOpenAi = providerCapabilities({ id: 'openai', name: 'OpenAI', color: '', baseUrl: '', defaultModels: [], modelsKind: 'openai' }, 'gpt-5.4-mini')
assert.equal(modernOpenAi.maxTokensField, 'max_completion_tokens')

const gemini = providerCapabilities({ id: 'gemini', name: 'Gemini', color: '', baseUrl: '', defaultModels: [], modelsKind: 'gemini' }, 'gemini-3.6-flash')
assert.equal(gemini.supportsStreamOptions, false)

const normalized = normalizeToolCallId('call_01JABCD-legacy')
assert.match(normalized, /^[A-Za-z0-9]{9}$/)
assert.equal(normalizeToolCallId('call_01JABCD-legacy'), normalized)
console.log('Agent contract invariants: PASS')
