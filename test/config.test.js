'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  loadConfig,
  parseBool,
  parseDecisionPayloadMode,
  parseList,
  parseRoleAddresses,
  DEFAULT_ROLE_ADDRESSES,
} = require('../lib/config')

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
  assert.equal(cfg.webhookDecisionUrl, '')
  assert.equal(cfg.webhookDecisionPayloadMode, 'minimal')
})

test('loadConfig accepts http webhook URLs', () => {
  const cfg = loadConfig({ WEBHOOK_URL: 'http://127.0.0.1:8080/hook' })
  assert.equal(cfg.webhookUrl, 'http://127.0.0.1:8080/hook')
})

test('loadConfig rejects non-http webhook URLs', () => {
  assert.throws(() => loadConfig({ WEBHOOK_URL: 'ftp://example.com/hook' }), /http/)
})

test('loadConfig accepts optional http decision URLs', () => {
  const cfg = loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    WEBHOOK_DECISION_URL: 'http://127.0.0.1:8080/decision',
    WEBHOOK_DECISION_TOKEN: 'secret-token',
  })

  assert.equal(cfg.webhookDecisionUrl, 'http://127.0.0.1:8080/decision')
  assert.equal(cfg.webhookDecisionToken, 'secret-token')
})

test('loadConfig rejects non-http decision URLs', () => {
  assert.throws(() => loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    WEBHOOK_DECISION_URL: 'ftp://example.com/decision',
  }), /WEBHOOK_DECISION_URL/)
})

test('parseDecisionPayloadMode accepts only known modes', () => {
  assert.equal(parseDecisionPayloadMode(undefined), 'minimal')
  assert.equal(parseDecisionPayloadMode('SUMMARY'), 'summary')
  assert.equal(parseDecisionPayloadMode('full'), 'full')
  assert.throws(() => parseDecisionPayloadMode('headers'), /WEBHOOK_DECISION_PAYLOAD_MODE/)
})

test('loadConfig defaults role routing to disabled with the built-in role list', () => {
  const cfg = loadConfig({ WEBHOOK_URL: 'https://example.com/hook' })
  assert.equal(cfg.roleWebhookUrl, '')
  assert.ok(cfg.roleAddresses instanceof Set)
  assert.equal(cfg.roleAddresses.size, DEFAULT_ROLE_ADDRESSES.length)
  for (const role of ['abuse', 'postmaster', 'www']) {
    assert.ok(cfg.roleAddresses.has(role))
  }
})

test('loadConfig accepts an optional http role webhook URL', () => {
  const cfg = loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    WEBHOOK_ROLE_URL: 'http://127.0.0.1:8080/role',
  })
  assert.equal(cfg.roleWebhookUrl, 'http://127.0.0.1:8080/role')
})

test('loadConfig rejects non-http role webhook URLs', () => {
  assert.throws(() => loadConfig({
    WEBHOOK_URL: 'https://example.com/hook',
    WEBHOOK_ROLE_URL: 'ftp://example.com/role',
  }), /WEBHOOK_ROLE_URL/)
})

test('parseRoleAddresses replaces the default list and normalizes entries', () => {
  const roles = parseRoleAddresses('Abuse, ROOT')
  assert.ok(roles instanceof Set)
  assert.deepEqual([...roles], ['abuse', 'root'])
})

test('parseRoleAddresses falls back to the full default list when unset', () => {
  const roles = parseRoleAddresses(undefined)
  assert.equal(roles.size, DEFAULT_ROLE_ADDRESSES.length)
  assert.ok(roles.has('postmaster'))
})
