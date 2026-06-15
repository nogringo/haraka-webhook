'use strict'

const { loadConfig } = require('../../lib/config')
const { createSpoolItem, ensureSpoolDirs } = require('../../lib/spool')
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

  createSpoolItem(this.cfg, connection)
    .then((item) => {
      connection.loginfo(this, `spooled message ${item.id}`)
      next(OK, `Queued as ${item.id}`)
    })
    .catch((err) => {
      connection.logerror(this, `failed to spool message: ${err.stack || err.message}`)
      next(DENYSOFT, 'Unable to queue message')
    })
}

exports.shutdown = function () {
  if (this.worker) this.worker.stop()
}
