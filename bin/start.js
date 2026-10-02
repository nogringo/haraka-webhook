#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { loadConfig } = require('../lib/config')

// ECDHE with AEAD only: the "Good" level of the NCSC-NL TLS guidelines that internet.nl checks.
const TLS_CIPHERS = [
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_128_GCM_SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
].join(':')

function writeHostnameConfig(cfg) {
  const mePath = path.join(process.cwd(), 'config', 'me')
  if (cfg.smtpHostname) {
    fs.writeFileSync(mePath, `${cfg.smtpHostname}\n`)
  } else {
    fs.rmSync(mePath, { force: true })
  }
}

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
      `ciphers=${TLS_CIPHERS}`,
      '',
    ].join('\n'),
  )
}

function main() {
  const cfg = loadConfig(process.env)
  writeHostnameConfig(cfg)
  writeTlsConfig(cfg)

  const harakaBin = path.join(process.cwd(), 'node_modules', '.bin', 'haraka')
  const child = spawn(harakaBin, ['-c', '.'], { stdio: 'inherit' })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code || 0)
  })
}

main()
