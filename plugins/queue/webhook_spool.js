'use strict'

const { loadConfig } = require('../../lib/config')
const { queueMessage } = require('../../lib/queue')
const { ensureSpoolDirs } = require('../../lib/spool')
const { WebhookWorker } = require('../../lib/worker')

exports.register = function () {
  this.cfg = loadConfig(process.env)
  ensureSpoolDirs(this.cfg)

  this.worker = new WebhookWorker(this.cfg, {
    log: (level, message) => {
      const fn = this[`log${level}`] || this.loginfo
      fn.call(this, message)
    },
  })
  this.worker.start()
}

exports.hook_queue = function (next, connection) {
  const txn = connection && connection.transaction
  if (!txn || !txn.message_stream) return next(DENYSOFT, 'No message stream')

  queueMessage(this.cfg, connection)
    .then((result) => {
      if (result.status === 'queued') {
        connection.loginfo(this, `spooled message ${result.id}`)
        next(OK, result.message)
        return
      }

      if (result.status === 'denied') {
        connection.lognotice(this, `decision API denied message ${result.id}: ${result.reason || result.message}`)
        next(DENY, result.message)
        return
      }

      if (result.status === 'silent_denied') {
        connection.lognotice(this, `decision API silently denied message ${result.id}: ${result.reason || result.internalMessage || 'silent_deny'}`)
        next(OK, result.message)
        return
      }

      connection.lognotice(this, `decision API unavailable for message ${result.id}: ${result.internalMessage || result.reason || 'temporary failure'}`)
      next(DENYSOFT, result.message)
    })
    .catch((err) => {
      connection.logerror(this, `failed to spool message: ${err.stack || err.message}`)
      next(DENYSOFT, 'Unable to queue message')
    })
}

exports.shutdown = function () {
  if (this.worker) this.worker.stop()
}
