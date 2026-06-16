'use strict'

const fsp = require('node:fs/promises')
const { requestDecision } = require('./decision')
const { commitSpoolItem, createTempSpoolItem, discardSpoolItem } = require('./spool')

function smtpSafeMessage(value, fallback = 'Message rejected') {
  const normalized = String(value || fallback)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()

  return normalized.slice(0, 200) || fallback
}

async function queueMessage(cfg, connection, opts = {}) {
  const item = await createTempSpoolItem(cfg, connection)

  try {
    const rawMime = await fsp.readFile(item.messagePath)
    const decision = await requestDecision(cfg, item.meta, rawMime, opts)

    if (decision.decision === 'allow') {
      await commitSpoolItem(item)
      return {
        status: 'queued',
        id: item.id,
        message: `Queued as ${item.id}`,
      }
    }

    await discardSpoolItem(item)

    if (decision.decision === 'deny') {
      return {
        status: 'denied',
        id: item.id,
        reason: decision.reason,
        message: smtpSafeMessage(decision.message || decision.reason),
      }
    }

    if (decision.decision === 'silent_deny') {
      return {
        status: 'silent_denied',
        id: item.id,
        reason: decision.reason,
        message: 'Queued',
        internalMessage: decision.message,
      }
    }

    return {
      status: 'temporary_failure',
      id: item.id,
      reason: decision.reason,
      message: 'Decision service unavailable',
      internalMessage: decision.message,
    }
  } catch (err) {
    await discardSpoolItem(item).catch(() => {})
    throw err
  }
}

module.exports = {
  queueMessage,
  smtpSafeMessage,
}
