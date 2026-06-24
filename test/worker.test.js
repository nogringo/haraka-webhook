'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { loadConfig } = require('../lib/config')
const { ensureSpoolDirs, writeJsonDurable } = require('../lib/spool')
const { WebhookWorker, classifyStatus, retryDelayMs } = require('../lib/worker')

async function tempCfg(env = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'haraka-webhook-worker-'))
  const cfg = loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    SPOOL_DIR: dir,
    RETRY_INTERVAL_MS: '1000',
    RETRY_MAX_INTERVAL_MS: '5000',
    ...env,
  })
  ensureSpoolDirs(cfg)
  return cfg
}

async function makeItem(cfg, id) {
  const itemDir = path.join(cfg.pendingDir, id)
  await fsp.mkdir(itemDir, { recursive: true })
  await fsp.writeFile(path.join(itemDir, 'message.eml'), 'Subject: Test\r\n\r\nBody\r\n')
  await writeJsonDurable(path.join(itemDir, 'meta.json'), {
    id,
    createdAt: new Date().toISOString(),
    attempts: 0,
    sender: 'sender@example.com',
    recipients: ['user@example.com'],
    from: 'sender@example.com',
    subject: 'Test',
    headers: [['Subject', 'Test']],
  })
}

test('classifyStatus maps webhook responses', () => {
  assert.equal(classifyStatus(200), 'delivered')
  assert.equal(classifyStatus(406), 'dead')
  assert.equal(classifyStatus(500), 'retry')
})

test('retryDelayMs uses capped exponential backoff', () => {
  const cfg = { retryIntervalMs: 1000, retryMaxIntervalMs: 5000 }
  assert.equal(retryDelayMs(cfg, 1), 1000)
  assert.equal(retryDelayMs(cfg, 3), 4000)
  assert.equal(retryDelayMs(cfg, 10), 5000)
})

test('processItem removes delivered messages', async () => {
  const cfg = await tempCfg()
  await makeItem(cfg, 'delivered')
  const worker = new WebhookWorker(cfg)
  worker.deliver = async () => 'delivered'

  await worker.processItem('delivered')
  await assert.rejects(fsp.access(path.join(cfg.pendingDir, 'delivered')))
})

test('processItem moves 406 messages to dead-letter', async () => {
  const cfg = await tempCfg()
  await makeItem(cfg, 'dead')
  const worker = new WebhookWorker(cfg)
  worker.deliver = async () => 'dead'

  await worker.processItem('dead')
  const meta = JSON.parse(await fsp.readFile(path.join(cfg.deadDir, 'dead', 'meta.json'), 'utf8'))
  assert.equal(meta.attempts, 1)
  assert.equal(meta.lastError, 'webhook returned 406')
})

test('processItem keeps retryable failures pending', async () => {
  const cfg = await tempCfg()
  await makeItem(cfg, 'retry')
  const worker = new WebhookWorker(cfg)
  worker.deliver = async () => 'retry'

  await worker.processItem('retry')
  const meta = JSON.parse(await fsp.readFile(path.join(cfg.pendingDir, 'retry', 'meta.json'), 'utf8'))
  assert.equal(meta.attempts, 1)
  assert.ok(meta.nextAttemptAt)
})

test('processItem dead-letters items with invalid metadata', async () => {
  const cfg = await tempCfg()
  const itemDir = path.join(cfg.pendingDir, 'bad-meta')
  await fsp.mkdir(itemDir, { recursive: true })
  await fsp.writeFile(path.join(itemDir, 'message.eml'), 'Subject: Test\r\n\r\nBody\r\n')
  await fsp.writeFile(path.join(itemDir, 'meta.json'), '{not json')

  const worker = new WebhookWorker(cfg)
  await worker.processItem('bad-meta')

  const error = await fsp.readFile(path.join(cfg.deadDir, 'bad-meta', 'error.txt'), 'utf8')
  assert.match(error, /invalid metadata/)
})

test('deliver routes role recipients to the role webhook and others to the main one', async () => {
  const cfg = await tempCfg({ WEBHOOK_ROLE_URL: 'https://example.com/role-hook' })
  const worker = new WebhookWorker(cfg)

  const originalFetch = global.fetch
  const calledUrls = []
  global.fetch = async (url) => {
    calledUrls.push(url)
    return { status: 200 }
  }

  try {
    await worker.deliver({ recipients: ['abuse@example.com'] }, Buffer.from('raw'))
    await worker.deliver({ recipients: ['alice@example.com'] }, Buffer.from('raw'))
  } finally {
    global.fetch = originalFetch
  }

  assert.deepEqual(calledUrls, ['https://example.com/role-hook', 'https://example.com/hook'])
})

test('processItem dead-letters items with missing message files', async () => {
  const cfg = await tempCfg()
  const itemDir = path.join(cfg.pendingDir, 'missing-message')
  await fsp.mkdir(itemDir, { recursive: true })
  await writeJsonDurable(path.join(itemDir, 'meta.json'), {
    id: 'missing-message',
    createdAt: new Date().toISOString(),
    attempts: 0,
    sender: 'sender@example.com',
    recipients: ['user@example.com'],
    from: 'sender@example.com',
    subject: 'Test',
    headers: [['Subject', 'Test']],
  })

  const worker = new WebhookWorker(cfg)
  await worker.processItem('missing-message')

  const meta = JSON.parse(await fsp.readFile(path.join(cfg.deadDir, 'missing-message', 'meta.json'), 'utf8'))
  assert.match(meta.lastError, /cannot read message/)
})
