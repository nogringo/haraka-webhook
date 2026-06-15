'use strict'

const { loadConfig } = require('../lib/config')

exports.register = function () {
  this.cfg = loadConfig(process.env)
}

exports.hook_rcpt = function (next, connection, params) {
  const rcpt = params && params[0]
  if (!rcpt) return next(DENY, 'Missing recipient')

  if (this.cfg.acceptAllRecipients) {
    return next(OK)
  }

  const domain = String(rcpt.host || '').toLowerCase()
  if (this.cfg.acceptedDomains.includes(domain)) {
    return next(OK)
  }

  connection.lognotice(this, `rejecting recipient outside accepted domains: ${rcpt}`)
  return next(DENY, 'I cannot deliver for that domain')
}
