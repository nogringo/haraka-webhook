#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { loadConfig } = require('../lib/config')

function writeTlsConfig(cfg) {
  const tlsIniPath = path.join(process.cwd(), 'config', 'tls.ini')
  const runtimeDir = path.join(process.cwd(), 'config', '.runtime')

  if (!cfg.smtpTlsCertPath && !cfg.smtpTlsKeyPath) {
    fs.writeFileSync(
      tlsIniPath,
      '; STARTTLS disabled: SMTP_TLS_CERT_PATH and SMTP_TLS_KEY_PATH are not set.\n',
    )
    return
  }

  if (!cfg.smtpTlsCertPath || !cfg.smtpTlsKeyPath) {
    throw new Error('SMTP_TLS_CERT_PATH and SMTP_TLS_KEY_PATH must be set together')
  }

  fs.mkdirSync(runtimeDir, { recursive: true })
  fs.copyFileSync(cfg.smtpTlsCertPath, path.join(runtimeDir, 'tls_cert.pem'))
  fs.copyFileSync(cfg.smtpTlsKeyPath, path.join(runtimeDir, 'tls_key.pem'))

  fs.writeFileSync(
    tlsIniPath,
    [
      'key=.runtime/tls_key.pem',
      'cert=.runtime/tls_cert.pem',
      'minVersion=TLSv1.2',
      'honorCipherOrder=true',
      '',
    ].join('\n'),
  )
}

function main() {
  const cfg = loadConfig(process.env)
  writeTlsConfig(cfg)

  const harakaBin = path.join(process.cwd(), 'node_modules', '.bin', 'haraka')
  const child = spawn(harakaBin, ['-c', '.'], { stdio: 'inherit' })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code || 0)
  })
}

main()
