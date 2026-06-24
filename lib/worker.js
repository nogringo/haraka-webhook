'use strict'

const fsp = require('node:fs/promises')
const path = require('node:path')
const { buildPayload, toUrlEncoded } = require('./payload')
const { resolveWebhookUrl } = require('./routing')
const { ensureSpoolDirs, readJson, writeJsonDurable } = require('./spool')

function classifyStatus(status) {
  if (status === 200) return 'delivered'
  if (status === 406) return 'dead'
  return 'retry'
}

function retryDelayMs(cfg, attempts) {
  const multiplier = Math.max(1, 2 ** Math.max(0, attempts - 1))
  return Math.min(cfg.retryIntervalMs * multiplier, cfg.retryMaxIntervalMs)
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath)
    return true
  } catch {
    return false
  }
}

class WebhookWorker {
  constructor(cfg, opts = {}) {
    this.cfg = cfg
    this.log = opts.log || (() => {})
    this.timer = null
    this.running = false
  }

  start() {
    if (this.timer) return
    ensureSpoolDirs(this.cfg)
    this.recoverProcessing().catch((err) => this.log('error', `spool recovery failed: ${err.message}`))
    this.timer = setInterval(() => {
      this.scanOnce().catch((err) => this.log('error', `spool scan failed: ${err.message}`))
    }, this.cfg.retryScanIntervalMs)
    this.timer.unref()
  }

  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  async recoverProcessing() {
    const entries = await fsp.readdir(this.cfg.processingDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const from = path.join(this.cfg.processingDir, entry.name)
      const to = path.join(this.cfg.pendingDir, entry.name)
      if (!(await pathExists(to))) await fsp.rename(from, to).catch(() => {})
    }
  }

  async scanOnce() {
    if (this.running) return
    this.running = true
    try {
      const entries = await fsp.readdir(this.cfg.pendingDir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        await this.processItem(entry.name)
      }
    } finally {
      this.running = false
    }
  }

  async processItem(id) {
    const pendingDir = path.join(this.cfg.pendingDir, id)
    const processingDir = path.join(this.cfg.processingDir, id)
    const metaPath = path.join(processingDir, 'meta.json')
    const messagePath = path.join(processingDir, 'message.eml')

    try {
      await fsp.rename(pendingDir, processingDir)
    } catch {
      return
    }

    let meta
    try {
      meta = await readJson(metaPath)
    } catch (err) {
      await this.moveBrokenItem(processingDir, id, `invalid metadata: ${err.message}`)
      return
    }

    if (meta.nextAttemptAt && Date.parse(meta.nextAttemptAt) > Date.now()) {
      await fsp.rename(processingDir, pendingDir)
      return
    }

    if (this.cfg.maxRetryAgeMs > 0 && Date.now() - Date.parse(meta.createdAt) > this.cfg.maxRetryAgeMs) {
      meta.lastError = 'max retry age exceeded'
      await writeJsonDurable(metaPath, meta)
      await this.moveToDead(processingDir, id)
      return
    }

    let rawMime
    try {
      rawMime = await fsp.readFile(messagePath)
    } catch (err) {
      meta.lastError = `cannot read message: ${err.message}`
      await writeJsonDurable(metaPath, meta).catch(() => {})
      await this.moveToDead(processingDir, id)
      return
    }
    const result = await this.deliver(meta, rawMime)

    if (result === 'delivered') {
      await fsp.rm(processingDir, { recursive: true, force: true })
      this.log('info', `delivered spooled message ${id}`)
      return
    }

    meta.attempts += 1
    meta.lastAttemptAt = new Date().toISOString()
    meta.lastError = result === 'dead' ? 'webhook returned 406' : 'retryable webhook failure'

    if (result === 'dead') {
      await writeJsonDurable(metaPath, meta)
      await this.moveToDead(processingDir, id)
      this.log('notice', `dead-lettered spooled message ${id}`)
      return
    }

    meta.nextAttemptAt = new Date(Date.now() + retryDelayMs(this.cfg, meta.attempts)).toISOString()
    await writeJsonDurable(metaPath, meta)
    await fsp.rename(processingDir, pendingDir)
    this.log('notice', `will retry spooled message ${id}`)
  }

  async moveToDead(processingDir, id) {
    const deadDir = path.join(this.cfg.deadDir, id)
    await fsp.rename(processingDir, deadDir)
  }

  async moveBrokenItem(processingDir, id, reason) {
    const deadDir = path.join(this.cfg.deadDir, id)
    await fsp.rm(deadDir, { recursive: true, force: true })
    await fsp.rename(processingDir, deadDir)
    await fsp.writeFile(path.join(deadDir, 'error.txt'), `${reason}\n`)
    this.log('error', `dead-lettered broken spooled message ${id}: ${reason}`)
  }

  async deliver(meta, rawMime) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.cfg.webhookTimeoutMs)

    try {
      const fields = buildPayload(meta, rawMime, this.cfg)
      const url = resolveWebhookUrl(this.cfg, meta.recipients)
      const response = await fetch(url, {
        method: 'POST',
        body: toUrlEncoded(fields),
        signal: controller.signal,
      })
      return classifyStatus(response.status)
    } catch (err) {
      this.log('notice', `webhook delivery failed: ${err.message}`)
      return 'retry'
    } finally {
      clearTimeout(timeout)
    }
  }
}

module.exports = {
  WebhookWorker,
  classifyStatus,
  retryDelayMs,
}
