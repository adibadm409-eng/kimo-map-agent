import assert from 'node:assert/strict'
import { chatWithRetry, LlmError } from '../src/assistant/llm.ts'
import { defaultProvider } from '../src/assistant/providers.ts'

const originalFetch = globalThis.fetch
let mode = 'http'
let status = 400
let calls = 0

globalThis.fetch = async () => {
  calls++
  if (mode === 'network') throw new TypeError('simulated network failure')
  return new Response(JSON.stringify({ error: { message: `simulated ${status}` } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const opts = {
  provider: defaultProvider('openai'),
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  model: 'gpt-5.6-sol',
  messages: [{ role: 'user', content: 'اختبار' }],
  timeoutMs: 1000,
}

async function assertStaticFailure(expectedKind, expectedAttempts, httpStatus) {
  mode = 'http'
  status = httpStatus
  calls = 0
  await assert.rejects(() => chatWithRetry(opts), (error) => error instanceof LlmError && error.kind === expectedKind)
  assert.equal(calls, expectedAttempts, `${httpStatus} retry count`)
}

try {
  await assertStaticFailure('invalid_request', 1, 400)
  await assertStaticFailure('auth', 1, 401)
  await assertStaticFailure('invalid_request', 1, 404)
  await assertStaticFailure('invalid_request', 1, 422)

  for (const temporaryStatus of [429, 500, 503]) {
    status = temporaryStatus
    mode = 'http'
    calls = 0
    let retryCalled = false
    await assert.rejects(() => chatWithRetry(opts, () => {
      retryCalled = true
      throw new Error('stop retry test without sleeping')
    }), /stop retry test without sleeping/)
    assert.equal(retryCalled, true, `${temporaryStatus} must be retryable`)
    assert.equal(calls, 1, `${temporaryStatus} first attempt only in bounded test`)
  }

  mode = 'network'
  calls = 0
  let networkRetryCalled = false
  await assert.rejects(() => chatWithRetry(opts, () => {
    networkRetryCalled = true
    throw new Error('stop network retry test without sleeping')
  }), /stop network retry test without sleeping/)
  assert.equal(networkRetryCalled, true)
  assert.equal(calls, 1)

  console.log('Provider failure/recovery invariants: PASS')
} finally {
  globalThis.fetch = originalFetch
}
