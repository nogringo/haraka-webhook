# Haraka Webhook Receiver

Reusable inbound SMTP receiver powered by Haraka. It accepts mail, stores each
message in a durable local spool, then POSTs a Mailgun-like `/mime` payload to a
configurable webhook.

## What It Does

- Listens for inbound SMTP delivery on `25/TCP`.
- Accepts every recipient by default.
- Optionally restricts accepted recipient domains with environment variables.
- Stores raw RFC822/MIME messages in a persistent spool before acknowledging SMTP.
- Retries webhook delivery in the background.
- Sends `application/x-www-form-urlencoded` payloads with `body-mime`.
- Supports opportunistic inbound STARTTLS when certificate files are mounted.

## Quick Start

```sh
cp .env.example .env
docker compose up -d
```

To build the image locally from this repository instead:

```sh
docker compose -f docker-compose.build.yml up --build -d
```

Edit `.env` before production use:

```sh
WEBHOOK_URL=https://webhook.example.com/inbound
WEBHOOK_SIGNING_KEY=change-me
ACCEPT_ALL_RECIPIENTS=true
```

## Webhook Payload

The receiver POSTs `application/x-www-form-urlencoded` fields similar to
Mailgun's raw MIME route:

- `recipient`
- `sender`
- `from`
- `subject`
- `message-headers`
- `timestamp`
- `token`
- `signature`, when `WEBHOOK_SIGNING_KEY` is set
- `body-mime`

The signature is an HMAC-SHA256 hex digest of `timestamp + token`, keyed by
`WEBHOOK_SIGNING_KEY`.

## Recipient Policy

Default behavior accepts every `RCPT TO` delivered to this server:

```sh
ACCEPT_ALL_RECIPIENTS=true
```

To restrict by domain:

```sh
ACCEPT_ALL_RECIPIENTS=false
ACCEPTED_DOMAINS=example.com,example.net
```

## TLS And Certificates

Haraka uses mounted certificate files for SMTP STARTTLS. Use `certbot`,
`acme.sh`, `lego`, your DNS provider, or your hosting platform to obtain and
renew certs.

Mount the certificate files read-only in `docker-compose.yml`, then set:

```sh
SMTP_TLS_CERT_PATH=/certs/fullchain.pem
SMTP_TLS_KEY_PATH=/certs/privkey.pem
```

STARTTLS is opportunistic by default, which keeps delivery compatible with
standard MX traffic.

## DNS And Ports

For each domain that should deliver mail here, create MX records pointing to the
host running this container. That host also needs an `A` and/or `AAAA` record and
public inbound `25/TCP`.

Example:

```dns
example.com.           MX 10 mail.example.com.
example.net.           MX 10 mail.example.com.
mail.example.com.      A  203.0.113.10
```

## Spool And Retries

Spool directories live under `SPOOL_DIR`:

- `pending/`: messages waiting for webhook delivery
- `processing/`: messages currently being delivered
- `dead/`: permanent failures, including webhook `406`
- `tmp/`: temporary writes before atomic move into `pending/`

Useful settings:

```sh
SPOOL_DIR=/var/spool/haraka-webhook
WEBHOOK_TIMEOUT_MS=10000
RETRY_SCAN_INTERVAL_MS=5000
RETRY_INTERVAL_MS=30000
RETRY_MAX_INTERVAL_MS=3600000
MAX_RETRY_AGE_MS=0
```

`MAX_RETRY_AGE_MS=0` means retry forever, except `406`, which is dead-lettered.

For disk-level secrecy, run the spool volume on encrypted storage.

## Local Tests

```sh
npm test
```

After installing dependencies, you can run Haraka locally:

```sh
WEBHOOK_URL=https://example.com/hook npm start
```

Use `swaks` to send a test message:

```sh
swaks -s 127.0.0.1 -p 25 -f sender@example.com -t user@example.com
```

## License

MIT
