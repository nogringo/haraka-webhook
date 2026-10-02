'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { Readable } = require('node:stream')
const MessageStream = require('haraka-message-stream')
const { loadConfig } = require('../lib/config')
const { Header } = require('haraka-email-message')
const { buildMeta, createSpoolItem, parseHeaders } = require('../lib/spool')

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

test('parseHeaders unfolds multi-line entries from Haraka header lists', () => {
  assert.deepEqual(parseHeaders(['Authentication-Results: mx.local;\r\n\tspf=pass\n', 'Subject: Hi\n folded\n']), [
    ['Authentication-Results', 'mx.local; spf=pass'],
    ['Subject', 'Hi folded'],
  ])
})

test('buildMeta uses Haraka final headers so auth results come from this server', () => {
  const header = new Header()
  header.parse(['From: a@example.com\n', 'Subject: Hi\n'])
  header.add('Authentication-Results', 'mx.local;\r\n\tspf=pass smtp.mailfrom=example.com;\r\n\tdkim=pass header.d=example.com')

  const meta = buildMeta({
    transaction: {
      header,
      header_lines: ['Authentication-Results: forged; dkim=pass\n', 'From: a@example.com\n', 'Subject: Hi\n'],
      mail_from: { address: () => 'a@example.com' },
      rcpt_to: [],
    },
  }, 'id')

  assert.deepEqual(meta.headers, [
    ['Authentication-Results', 'mx.local; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com'],
    ['From', 'a@example.com'],
    ['Subject', 'Hi'],
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

test('createSpoolItem copies finalized Haraka message streams', async () => {
  const cfg = await tempCfg()
  const messageStream = new MessageStream({ main: { spool_after: -1 } }, 'haraka-stream-test')
  messageStream.add_line(Buffer.from('From: Sender <sender@example.com>\r\n'))
  messageStream.add_line(Buffer.from('Subject: Haraka stream\r\n'))
  messageStream.add_line(Buffer.from('\r\n'))
  messageStream.add_line(Buffer.from('Body\r\n'))
  await new Promise((resolve) => messageStream.add_line_end(resolve))

  const connection = {
    transaction: {
      uuid: 'haraka-stream-test',
      mail_from: { address: () => 'sender@example.com' },
      rcpt_to: [{ address: () => 'user@nmail.li' }],
      header_lines: ['From: Sender <sender@example.com>\r\n', 'Subject: Haraka stream\r\n'],
      message_stream: messageStream,
    },
    remote: { ip: '203.0.113.10', host: 'mx.example.com' },
    hello: { host: 'mx.example.com' },
  }

  const item = await createSpoolItem(cfg, connection)
  const message = await fsp.readFile(path.join(item.path, 'message.eml'), 'utf8')

  assert.equal(message, 'From: Sender <sender@example.com>\r\nSubject: Haraka stream\r\n\r\nBody\r\n')
})
