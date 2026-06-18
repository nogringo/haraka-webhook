'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildDecisionPayload, normalizeDecision, requestDecision } = require('../lib/decision')

const meta = {
  id: 'msg-1',
  createdAt: '2026-06-16T10:00:00.000Z',
  sender: 'sender@example.com',
  recipients: ['user@example.com'],
  from: 'Sender <sender@example.com>',
  subject: 'Hello',
  headers: [['From', 'Sender <sender@example.com>'], ['Subject', 'Hello']],
  remote: { ip: '203.0.113.10', host: 'mx.example.com', helo: 'mx.example.com' },
}

test('buildDecisionPayload minimal includes stable metadata only', () => {
  const payload = buildDecisionPayload(meta, Buffer.from('raw mime'), 'minimal')

  assert.equal(payload.protocol, 'haraka-webhook.decision.v1')
  assert.equal(payload.mode, 'minimal')
  assert.equal(payload.message.id, 'msg-1')
  assert.deepEqual(payload.message.recipients, ['user@example.com'])
  assert.equal(Object.hasOwn(payload.message, 'headers'), false)
  assert.equal(Object.hasOwn(payload.message, 'rawMime'), false)
})

test('buildDecisionPayload summary includes ordered headers but not raw MIME', () => {
  const payload = buildDecisionPayload(meta, Buffer.from('raw mime'), 'summary')

  assert.deepEqual(payload.message.headers, meta.headers)
  assert.equal(Object.hasOwn(payload.message, 'rawMime'), false)
})

test('buildDecisionPayload full includes ordered headers and raw MIME', () => {
  const payload = buildDecisionPayload(meta, Buffer.from('Subject: Hello\r\n\r\nBody'), 'full')

  assert.deepEqual(payload.message.headers, meta.headers)
  assert.equal(payload.message.rawMime, 'Subject: Hello\r\n\r\nBody')
})

test('normalizeDecision accepts allow, deny, and silent_deny only', () => {
  assert.deepEqual(normalizeDecision({ decision: 'allow' }), {
    decision: 'allow',
    reason: '',
    message: '',
  })
  assert.deepEqual(normalizeDecision({ decision: 'deny', reason: 'blocked', message: 'Blocked' }), {
    decision: 'deny',
    reason: 'blocked',
    message: 'Blocked',
  })
  assert.deepEqual(normalizeDecision({ decision: 'silent_deny', reason: 'drop' }), {
    decision: 'silent_deny',
    reason: 'drop',
    message: '',
  })
  assert.equal(normalizeDecision({ decision: 'retry' }), null)
})

test('requestDecision posts JSON and returns unavailable for invalid responses', async () => {
  const cfg = {
    webhookDecisionUrl: 'https://example.com/decision',
    webhookDecisionToken: 'secret-token',
    webhookDecisionPayloadMode: 'minimal',
    webhookTimeoutMs: 1000,
  }
  let request
  const allowed = await requestDecision(cfg, meta, Buffer.from('raw'), {
    fetch: async (url, opts) => {
      request = { url, opts }
      return {
        status: 200,
        ok: true,
        json: async () => ({ decision: 'allow' }),
      }
    },
  })

  assert.equal(allowed.decision, 'allow')
  assert.equal(request.url, 'https://example.com/decision')
  assert.equal(request.opts.method, 'POST')
  assert.equal(request.opts.headers['content-type'], 'application/json')
  assert.equal(request.opts.headers.authorization, 'Bearer secret-token')
  assert.equal(JSON.parse(request.opts.body).protocol, 'haraka-webhook.decision.v1')

  const invalid = await requestDecision(cfg, meta, Buffer.from('raw'), {
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ decision: 'unknown' }),
    }),
  })

  assert.equal(invalid.decision, 'unavailable')
})
