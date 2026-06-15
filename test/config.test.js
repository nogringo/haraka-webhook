'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadConfig, parseBool, parseList } = require('../lib/config')

test('parseBool handles common truthy values', () => {
  assert.equal(parseBool('true'), true)
  assert.equal(parseBool('1'), true)
  assert.equal(parseBool('yes'), true)
  assert.equal(parseBool('false'), false)
  assert.equal(parseBool(undefined, true), true)
})

test('parseList normalizes comma-separated domains', () => {
  assert.deepEqual(parseList(' nmail.li, UID.OVH ,, testnmail.uid.ovh '), [
    'nmail.li',
    'uid.ovh',
    'testnmail.uid.ovh',
  ])
})

test('loadConfig defaults to catch-all recipients', () => {
  const cfg = loadConfig({ WEBHOOK_URL: 'https://example.com/hook' })
  assert.equal(cfg.acceptAllRecipients, true)
  assert.equal(cfg.webhookUrl, 'https://example.com/hook')
})

test('loadConfig accepts http webhook URLs', () => {
  const cfg = loadConfig({ WEBHOOK_URL: 'http://127.0.0.1:8080/hook' })
  assert.equal(cfg.webhookUrl, 'http://127.0.0.1:8080/hook')
})

test('loadConfig rejects non-http webhook URLs', () => {
  assert.throws(() => loadConfig({ WEBHOOK_URL: 'ftp://example.com/hook' }), /http/)
})
