'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

function ensureSpoolDirs(cfg) {
  for (const dir of [cfg.spoolDir, cfg.pendingDir, cfg.processingDir, cfg.deadDir, cfg.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function addressToString(value) {
  if (!value) return ''
  if (typeof value.address === 'function') return value.address()
  return String(value)
}

function parseHeaders(headerLines = []) {
  const headers = []
  let current = null

  for (const rawLine of headerLines) {
    const line = String(rawLine).replace(/\r?\n$/, '')
    if (!line) continue

    if (/^[ \t]/.test(line) && current) {
      current[1] += ` ${line.trim()}`
      continue
    }

    const separator = line.indexOf(':')
    if (separator === -1) continue
    current = [line.slice(0, separator), line.slice(separator + 1).trim()]
    headers.push(current)
  }

  return headers
}

function headerValue(headers, name) {
  const lowerName = name.toLowerCase()
  const found = headers.find(([key]) => key.toLowerCase() === lowerName)
  return found ? found[1] : ''
}

function buildMeta(connection, id) {
  const txn = connection.transaction
  const headers = parseHeaders(txn.header_lines)
  const recipients = (txn.rcpt_to || []).map(addressToString).filter(Boolean)

  return {
    id,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: null,
    sender: addressToString(txn.mail_from),
    recipients,
    from: headerValue(headers, 'from'),
    subject: headerValue(headers, 'subject'),
    headers,
    remote: {
      ip: connection.remote && connection.remote.ip ? connection.remote.ip : '',
      host: connection.remote && connection.remote.host ? connection.remote.host : '',
      helo: connection.hello && connection.hello.host ? connection.hello.host : '',
    },
  }
}

async function fsyncFile(filePath) {
  const handle = await fsp.open(filePath, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeJsonDurable(filePath, data) {
  const handle = await fsp.open(filePath, 'w')
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'))
}

function writeMessageStream(filePath, messageStream) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath, { flags: 'wx' })
    let settled = false

    function cleanup() {
      output.removeListener('finish', done)
      output.removeListener('error', fail)
      if (typeof messageStream.removeListener === 'function') {
        messageStream.removeListener('error', fail)
      }
    }

    function done() {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    function fail(err) {
      if (settled) return
      settled = true
      cleanup()
      if (typeof messageStream.unpipe === 'function') messageStream.unpipe()
      output.destroy()
      reject(err)
    }

    output.once('finish', done)
    output.once('error', fail)
    if (typeof messageStream.once === 'function') messageStream.once('error', fail)

    try {
      messageStream.pipe(output)
    } catch (err) {
      fail(err)
    }
  })
}

async function createSpoolItem(cfg, connection) {
  ensureSpoolDirs(cfg)

  const txn = connection.transaction
  const id = safeId(`${Date.now()}-${txn.uuid || crypto.randomUUID()}`)
  const tmpItemDir = path.join(cfg.tmpDir, id)
  const pendingItemDir = path.join(cfg.pendingDir, id)
  const messagePath = path.join(tmpItemDir, 'message.eml')
  const metaPath = path.join(tmpItemDir, 'meta.json')

  await fsp.mkdir(tmpItemDir, { recursive: true })
  await writeMessageStream(messagePath, txn.message_stream)
  await fsyncFile(messagePath)

  const meta = buildMeta(connection, id)
  await writeJsonDurable(metaPath, meta)
  await fsp.rename(tmpItemDir, pendingItemDir)

  return { id, path: pendingItemDir, meta }
}

module.exports = {
  buildMeta,
  createSpoolItem,
  ensureSpoolDirs,
  parseHeaders,
  readJson,
  writeJsonDurable,
}
