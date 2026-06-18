# Webhook Decision Protocol

`WEBHOOK_DECISION_URL` enables an optional HTTP decision step before an inbound
message is accepted into the delivery spool. The decision API can allow delivery,
reject delivery with an SMTP error, or silently accept and drop the message.

## Configuration

```sh
WEBHOOK_DECISION_URL=https://policy.example.com/haraka/decision
WEBHOOK_DECISION_TOKEN=change-me
WEBHOOK_DECISION_PAYLOAD_MODE=minimal
```

- `WEBHOOK_DECISION_URL`: optional `http://` or `https://` endpoint.
- `WEBHOOK_DECISION_TOKEN`: optional bearer token sent as
  `Authorization: Bearer <token>`.
- `WEBHOOK_DECISION_PAYLOAD_MODE`: `minimal`, `summary`, or `full`. Defaults to
  `minimal`.
- `WEBHOOK_TIMEOUT_MS`: also controls the decision API timeout.

When `WEBHOOK_DECISION_URL` is not set, all messages follow the existing spool
and webhook delivery flow.

## Request

The receiver sends `POST application/json`:

```json
{
  "protocol": "haraka-webhook.decision.v1",
  "mode": "minimal",
  "message": {
    "id": "1718546400000-message-id",
    "createdAt": "2026-06-16T10:00:00.000Z",
    "sender": "sender@example.com",
    "recipients": ["user@example.com"],
    "from": "Sender <sender@example.com>",
    "subject": "Hello",
    "remote": {
      "ip": "203.0.113.10",
      "host": "mx.example.com",
      "helo": "mx.example.com"
    }
  }
}
```

Payload modes:

- `minimal`: `id`, `createdAt`, envelope sender and recipients, `from`,
  `subject`, and SMTP remote metadata.
- `summary`: all `minimal` fields plus ordered headers as `[name, value]`
  tuples in `message.headers`.
- `full`: all `summary` fields plus the full RFC822/MIME message as a UTF-8
  string in `message.rawMime`.

## Response

A valid response is `200 application/json` with one of these bodies:

```json
{ "decision": "allow" }
```

```json
{
  "decision": "deny",
  "reason": "blocked_sender",
  "message": "Delivery rejected by recipient policy"
}
```

```json
{
  "decision": "silent_deny",
  "reason": "shadow_block",
  "message": "Internal policy reason"
}
```

Decision behavior:

- `allow`: accept the SMTP transaction, commit the message to the spool, and
  deliver it later to `WEBHOOK_URL`.
- `deny`: reject the SMTP transaction permanently. `message` is sanitized and
  exposed to the sender as the SMTP rejection text.
- `silent_deny`: accept the SMTP transaction with a neutral success response,
  discard the local temporary spool item, and do not call `WEBHOOK_URL`.

Any timeout, network error, non-200 response, invalid JSON response, or unknown
decision is treated as a temporary policy failure. The SMTP transaction is
temporarily rejected so the sending MTA can retry later.
