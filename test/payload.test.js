'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPayload, signatureFor, toUrlEncoded } = require('../lib/payload')

test('signatureFor matches Mailgun-style timestamp+token HMAC', () => {
  assert.equal(
    signatureFor('secret', '1700000000', 'abc'),
    '0378e7a22896ffb8263c50306768eb8f8d212f9426ca6b0e9dc561e301655398',
  )
})

test('buildPayload includes raw MIME and base Mailgun mime fields', () => {
  const meta = {
    sender: 'sender@example.com',
    recipients: ['user@nmail.li'],
    from: 'Sender <sender@example.com>',
    subject: 'Hello',
    headers: [['Subject', 'Hello']],
  }

  const fields = buildPayload(meta, Buffer.from('Subject: Hello\r\n\r\nBody'), {
    webhookSigningKey: 'secret',
  }, new Date('2024-01-01T00:00:00Z'))

  assert.equal(fields.sender, 'sender@example.com')
  assert.equal(fields.recipient, 'user@nmail.li')
  assert.equal(fields.subject, 'Hello')
  assert.equal(fields['body-mime'], 'Subject: Hello\r\n\r\nBody')
  assert.ok(fields.signature)
  assert.deepEqual(JSON.parse(fields['message-headers']), [['Subject', 'Hello']])
})

test('toUrlEncoded serializes form fields', () => {
  const encoded = toUrlEncoded({ a: 'one', b: 'two words' }).toString()
  assert.equal(encoded, 'a=one&b=two+words')
})
