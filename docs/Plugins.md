# Local Plugins

## Available Hooks

- init_master
- init_child
- connect_init
- lookup_rdns
- connect
- capabilities
- unrecognized_command
- disconnect
- helo
- ehlo
- quit
- vrfy
- noop
- rset
- mail
- rcpt
- rcpt_ok
- data
- data_post
- queue
- queue_outbound
- queue_ok
- reset_transaction
- deny

### rcpt

## spf

[haraka-plugin-spf](https://github.com/haraka/haraka-plugin-spf). Checks the
HELO name and envelope sender, adds `Received-SPF` and an `spf=` entry to
`Authentication-Results`. Configured in `config/spf.ini` (no rejection by default).

## dkim

[haraka-plugin-dkim](https://github.com/haraka/haraka-plugin-dkim). Verifies
every `DKIM-Signature` and adds a `dkim=` entry per signature to
`Authentication-Results`. Signing is disabled in `config/dkim.ini`.

## accept_all

Recipient validation plugin.

- `ACCEPT_ALL_RECIPIENTS=true`: accept every recipient.
- `ACCEPT_ALL_RECIPIENTS=false`: accept only domains in `ACCEPTED_DOMAINS`.

## queue/webhook_spool

Queue plugin that writes each message to the local spool and lets a background
worker POST Mailgun-like `/mime` payloads to `WEBHOOK_URL`.
