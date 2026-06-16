'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { Readable } = require('node:stream')
const { loadConfig } = require('../lib/config')
const { queueMessage, smtpSafeMessage } = require('../lib/queue')
const { ensureSpoolDirs } = require('../lib/spool')

async function tempCfg(extra = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'haraka-webhook-queue-'))
  const cfg = loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    WEBHOOK_DECISION_URL: 'https://example.com/decision',
    SPOOL_DIR: dir,
    ...extra,
  })
  ensureSpoolDirs(cfg)
  return cfg
}

function connection(uuid) {
  return {
    transaction: {
      uuid,
      mail_from: { address: () => 'sender@example.com' },
      rcpt_to: [{ address: () => 'user@example.com' }],
      header_lines: ['From: Sender <sender@example.com>\r\n', 'Subject: Hello\r\n'],
      message_stream: Readable.from(['From: Sender <sender@example.com>\r\nSubject: Hello\r\n\r\nBody\r\n']),
    },
    remote: { ip: '203.0.113.10', host: 'mx.example.com' },
    hello: { host: 'mx.example.com' },
  }
}

async function pendingEntries(cfg) {
  return fsp.readdir(cfg.pendingDir).catch(() => [])
}

test('queueMessage commits allowed messages to pending spool', async () => {
  const cfg = await tempCfg()
  const result = await queueMessage(cfg, connection('allow'), {
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ decision: 'allow' }),
    }),
  })

  assert.equal(result.status, 'queued')
  assert.match(result.id, /allow/)
  assert.deepEqual(await pendingEntries(cfg), [result.id])
  await fsp.access(path.join(cfg.pendingDir, result.id, 'message.eml'))
})

test('queueMessage keeps existing behavior when decision API is disabled', async () => {
  const cfg = await tempCfg({ WEBHOOK_DECISION_URL: '' })
  const result = await queueMessage(cfg, connection('disabled'), {
    fetch: async () => {
      throw new Error('fetch should not be called')
    },
  })

  assert.equal(result.status, 'queued')
  assert.deepEqual(await pendingEntries(cfg), [result.id])
})

test('queueMessage discards denied messages and returns permanent rejection', async () => {
  const cfg = await tempCfg()
  const result = await queueMessage(cfg, connection('deny'), {
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ decision: 'deny', reason: 'blocked', message: 'Blocked\r\nby policy' }),
    }),
  })

  assert.equal(result.status, 'denied')
  assert.equal(result.message, 'Blocked by policy')
  assert.deepEqual(await pendingEntries(cfg), [])
})

test('queueMessage silently denies messages without pending spool', async () => {
  const cfg = await tempCfg()
  const result = await queueMessage(cfg, connection('silent'), {
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ decision: 'silent_deny', reason: 'shadow_block', message: 'Do not expose' }),
    }),
  })

  assert.equal(result.status, 'silent_denied')
  assert.equal(result.message, 'Queued')
  assert.equal(result.internalMessage, 'Do not expose')
  assert.deepEqual(await pendingEntries(cfg), [])
})

test('queueMessage treats unavailable decision API as temporary failure', async () => {
  const cfg = await tempCfg()
  const result = await queueMessage(cfg, connection('unavailable'), {
    fetch: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ decision: 'allow' }),
    }),
  })

  assert.equal(result.status, 'temporary_failure')
  assert.equal(result.message, 'Decision service unavailable')
  assert.deepEqual(await pendingEntries(cfg), [])
})

test('queueMessage treats invalid decision API responses as temporary failure', async () => {
  const cfg = await tempCfg()
  const result = await queueMessage(cfg, connection('invalid'), {
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ decision: 'unexpected' }),
    }),
  })

  assert.equal(result.status, 'temporary_failure')
  assert.deepEqual(await pendingEntries(cfg), [])
})

test('smtpSafeMessage removes unsafe response text', () => {
  assert.equal(smtpSafeMessage('Denied\r\nwith detail\u0007'), 'Denied with detail')
})
