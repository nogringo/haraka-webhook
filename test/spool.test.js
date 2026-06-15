'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { Readable } = require('node:stream')
const { loadConfig } = require('../lib/config')
const { createSpoolItem, parseHeaders } = require('../lib/spool')

async function tempCfg() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'haraka-webhook-test-'))
  return loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    SPOOL_DIR: dir,
  })
}

test('parseHeaders preserves order and unfolds continuation lines', () => {
  assert.deepEqual(parseHeaders(['Subject: Hello\r\n', ' folded\r\n', 'From: a@example.com\r\n']), [
    ['Subject', 'Hello folded'],
    ['From', 'a@example.com'],
  ])
})

test('createSpoolItem writes message and metadata into pending spool', async () => {
  const cfg = await tempCfg()
  const connection = {
    transaction: {
      uuid: 'abc-123',
      mail_from: { address: () => 'sender@example.com' },
      rcpt_to: [{ address: () => 'user@nmail.li' }],
      header_lines: ['From: Sender <sender@example.com>\r\n', 'Subject: Hello\r\n'],
      message_stream: Readable.from(['From: Sender <sender@example.com>\r\nSubject: Hello\r\n\r\nBody\r\n']),
    },
    remote: { ip: '203.0.113.10', host: 'mx.example.com' },
    hello: { host: 'mx.example.com' },
  }

  const item = await createSpoolItem(cfg, connection)
  const message = await fsp.readFile(path.join(item.path, 'message.eml'), 'utf8')
  const meta = JSON.parse(await fsp.readFile(path.join(item.path, 'meta.json'), 'utf8'))

  assert.match(item.id, /abc-123/)
  assert.equal(message, 'From: Sender <sender@example.com>\r\nSubject: Hello\r\n\r\nBody\r\n')
  assert.equal(meta.sender, 'sender@example.com')
  assert.deepEqual(meta.recipients, ['user@nmail.li'])
  assert.equal(meta.subject, 'Hello')
})
