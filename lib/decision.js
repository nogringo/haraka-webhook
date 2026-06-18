'use strict'

const PROTOCOL = 'haraka-webhook.decision.v1'
const DECISIONS = new Set(['allow', 'deny', 'silent_deny'])

function buildDecisionPayload(meta, rawMime, mode) {
  const message = {
    id: meta.id,
    createdAt: meta.createdAt,
    sender: meta.sender,
    recipients: meta.recipients,
    from: meta.from,
    subject: meta.subject,
    remote: meta.remote || { ip: '', host: '', helo: '' },
  }

  if (mode === 'summary' || mode === 'full') {
    message.headers = meta.headers || []
  }

  if (mode === 'full') {
    message.rawMime = rawMime.toString('utf8')
  }

  return {
    protocol: PROTOCOL,
    mode,
    message,
  }
}

function normalizeDecision(data) {
  if (!data || typeof data !== 'object') return null
  if (!DECISIONS.has(data.decision)) return null

  return {
    decision: data.decision,
    reason: data.reason ? String(data.reason) : '',
    message: data.message ? String(data.message) : '',
  }
}

async function requestDecision(cfg, meta, rawMime, opts = {}) {
  if (!cfg.webhookDecisionUrl) return { decision: 'allow', reason: '', message: '' }

  const fetchFn = opts.fetch || fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cfg.webhookTimeoutMs)

  try {
    const payload = buildDecisionPayload(meta, rawMime, cfg.webhookDecisionPayloadMode)
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
    }

    if (cfg.webhookDecisionToken) {
      headers.authorization = `Bearer ${cfg.webhookDecisionToken}`
    }

    const response = await fetchFn(cfg.webhookDecisionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (response.status !== 200) return unavailable(`decision API returned ${response.status}`)

    let data
    try {
      data = await response.json()
    } catch (err) {
      return unavailable(`decision API returned invalid JSON: ${err.message}`)
    }

    return normalizeDecision(data) || unavailable('decision API returned an invalid decision')
  } catch (err) {
    return unavailable(`decision API request failed: ${err.message}`)
  } finally {
    clearTimeout(timeout)
  }
}

function unavailable(error) {
  return {
    decision: 'unavailable',
    reason: 'decision_unavailable',
    message: error,
  }
}

module.exports = {
  PROTOCOL,
  buildDecisionPayload,
  normalizeDecision,
  requestDecision,
}
