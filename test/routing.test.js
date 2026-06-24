'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { localPart, resolveWebhookUrl } = require('../lib/routing')

const cfg = {
  webhookUrl: 'https://example.com/hook',
  roleWebhookUrl: 'https://example.com/role-hook',
  roleAddresses: new Set(['abuse', 'contact', 'postmaster']),
}

test('localPart extracts and lowercases the local-part', () => {
  assert.equal(localPart('ABUSE@Example.com'), 'abuse')
  assert.equal(localPart('  contact@x.com '), 'contact')
})

test('localPart handles addresses without "@" and with multiple "@"', () => {
  assert.equal(localPart('abuse'), 'abuse')
  assert.equal(localPart('a@b@example.com'), 'a@b')
  assert.equal(localPart(''), '')
  assert.equal(localPart(undefined), '')
})

test('localPart does not strip "+tag"', () => {
  assert.equal(localPart('abuse+foo@x.com'), 'abuse+foo')
})

test('resolveWebhookUrl returns main URL when role webhook is not configured', () => {
  const disabled = { ...cfg, roleWebhookUrl: '' }
  assert.equal(resolveWebhookUrl(disabled, ['abuse@x.com']), disabled.webhookUrl)
})

test('resolveWebhookUrl routes a single role recipient to the role webhook', () => {
  assert.equal(resolveWebhookUrl(cfg, ['abuse@x.com']), cfg.roleWebhookUrl)
})

test('resolveWebhookUrl routes a non-role recipient to the main webhook', () => {
  assert.equal(resolveWebhookUrl(cfg, ['alice@x.com']), cfg.webhookUrl)
})

test('resolveWebhookUrl routes mixed recipients to the role webhook (route-if-any-role)', () => {
  assert.equal(resolveWebhookUrl(cfg, ['alice@x.com', 'abuse@x.com']), cfg.roleWebhookUrl)
})

test('resolveWebhookUrl is case-insensitive', () => {
  assert.equal(resolveWebhookUrl(cfg, ['ABUSE@X.COM']), cfg.roleWebhookUrl)
})

test('resolveWebhookUrl returns main webhook for empty recipients', () => {
  assert.equal(resolveWebhookUrl(cfg, []), cfg.webhookUrl)
  assert.equal(resolveWebhookUrl(cfg), cfg.webhookUrl)
})

test('resolveWebhookUrl does not match a "+tag" role recipient', () => {
  assert.equal(resolveWebhookUrl(cfg, ['abuse+foo@x.com']), cfg.webhookUrl)
})
