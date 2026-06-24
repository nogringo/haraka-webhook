'use strict'

// Lowercased local-part (before the last '@'). Defensive against malformed addresses.
function localPart(address) {
  const s = String(address || '')
  const at = s.lastIndexOf('@')
  return (at === -1 ? s : s.slice(0, at)).trim().toLowerCase()
}

// route-if-any-role: when a role webhook URL is configured AND at least one
// recipient is a role address, deliver to the role webhook; otherwise the main one.
function resolveWebhookUrl(cfg, recipients = []) {
  if (!cfg.roleWebhookUrl) return cfg.webhookUrl
  const hasRole = recipients.some((addr) => cfg.roleAddresses.has(localPart(addr)))
  return hasRole ? cfg.roleWebhookUrl : cfg.webhookUrl
}

module.exports = { localPart, resolveWebhookUrl }
