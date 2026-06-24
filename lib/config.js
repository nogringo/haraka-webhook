'use strict'

const path = require('node:path')

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function parseList(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

const DEFAULT_ROLE_ADDRESSES = [
  'abuse', 'admin', 'administrator', 'billing', 'contact', 'daemon', 'help',
  'hostmaster', 'info', 'legal', 'mail', 'mailerdaemon', 'marketing', 'noc',
  'noreply', 'nostr', 'postmaster', 'privacy', 'root', 'sales', 'security',
  'spam', 'sysadmin', 'support', 'usenet', 'uucp', 'webmaster', 'www',
]

function parseRoleAddresses(value) {
  const list = value ? parseList(value) : DEFAULT_ROLE_ADDRESSES
  return new Set(list)
}

function parsePositiveInt(value, defaultValue) {
  if (value === undefined || value === '') return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue
  return parsed
}

function requireWebhookUrl(env) {
  const raw = env.WEBHOOK_URL
  if (!raw) throw new Error('WEBHOOK_URL is required')

  return parseHttpUrl(raw, 'WEBHOOK_URL')
}

function parseHttpUrl(raw, name) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use http:// or https://`)
  }
  return url.toString()
}

function optionalHttpUrl(value, name) {
  if (!value) return ''
  return parseHttpUrl(value, name)
}

function parseDecisionPayloadMode(value) {
  if (value === undefined || value === '') return 'minimal'
  const mode = String(value).toLowerCase()
  if (!['minimal', 'summary', 'full'].includes(mode)) {
    throw new Error('WEBHOOK_DECISION_PAYLOAD_MODE must be minimal, summary, or full')
  }
  return mode
}

function loadConfig(env = process.env) {
  const spoolDir = env.SPOOL_DIR || '/var/spool/haraka-webhook'
  const pendingDir = env.SPOOL_PENDING_DIR || path.join(spoolDir, 'pending')
  const processingDir = env.SPOOL_PROCESSING_DIR || path.join(spoolDir, 'processing')
  const deadDir = env.SPOOL_DEAD_DIR || path.join(spoolDir, 'dead')
  const tmpDir = env.SPOOL_TMP_DIR || path.join(spoolDir, 'tmp')

  return {
    webhookUrl: requireWebhookUrl(env),
    roleWebhookUrl: optionalHttpUrl(env.WEBHOOK_ROLE_URL, 'WEBHOOK_ROLE_URL'),
    roleAddresses: parseRoleAddresses(env.ROLE_ADDRESSES),
    webhookSigningKey: env.WEBHOOK_SIGNING_KEY || '',
    webhookTimeoutMs: parsePositiveInt(env.WEBHOOK_TIMEOUT_MS, 10000),
    webhookDecisionUrl: optionalHttpUrl(env.WEBHOOK_DECISION_URL, 'WEBHOOK_DECISION_URL'),
    webhookDecisionToken: env.WEBHOOK_DECISION_TOKEN || '',
    webhookDecisionPayloadMode: parseDecisionPayloadMode(env.WEBHOOK_DECISION_PAYLOAD_MODE),

    acceptAllRecipients: parseBool(env.ACCEPT_ALL_RECIPIENTS, true),
    acceptedDomains: parseList(env.ACCEPTED_DOMAINS),

    smtpTlsCertPath: env.SMTP_TLS_CERT_PATH || '',
    smtpTlsKeyPath: env.SMTP_TLS_KEY_PATH || '',

    spoolDir,
    pendingDir,
    processingDir,
    deadDir,
    tmpDir,
    retryIntervalMs: parsePositiveInt(env.RETRY_INTERVAL_MS, 30000),
    retryMaxIntervalMs: parsePositiveInt(env.RETRY_MAX_INTERVAL_MS, 3600000),
    retryScanIntervalMs: parsePositiveInt(env.RETRY_SCAN_INTERVAL_MS, 5000),
    maxRetryAgeMs: parsePositiveInt(env.MAX_RETRY_AGE_MS, 0),
  }
}

module.exports = {
  loadConfig,
  parseBool,
  parseDecisionPayloadMode,
  parseList,
  parseRoleAddresses,
  DEFAULT_ROLE_ADDRESSES,
}
