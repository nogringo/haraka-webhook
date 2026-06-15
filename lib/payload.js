'use strict'

const crypto = require('node:crypto')

function signatureFor(signingKey, timestamp, token) {
  if (!signingKey) return ''
  return crypto.createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest('hex')
}

function buildPayload(meta, rawMime, cfg, now = new Date()) {
  const timestamp = String(Math.floor(now.getTime() / 1000))
  const token = crypto.randomBytes(25).toString('hex')
  const signature = signatureFor(cfg.webhookSigningKey, timestamp, token)

  const fields = {
    recipient: meta.recipients.join(','),
    sender: meta.sender,
    from: meta.from,
    subject: meta.subject,
    'message-headers': JSON.stringify(meta.headers),
    timestamp,
    token,
    'body-mime': rawMime.toString('utf8'),
  }

  if (signature) fields.signature = signature
  return fields
}

function toUrlEncoded(fields) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    params.append(key, value == null ? '' : String(value))
  }
  return params
}

module.exports = {
  buildPayload,
  signatureFor,
  toUrlEncoded,
}
