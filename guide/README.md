# The OpenClaw + WhatsApp capability guide

This directory holds the full capability guide for operating WhatsApp as a customer channel through the TimelinesAI public API with an OpenClaw agent.

## Read the guide

- **Web version** (styled, canonical URL): **https://timelines.ai/guides/openclaw-whatsapp-skills**
- **Markdown source** (in this directory): [`capabilities.md`](capabilities.md)

Both versions are kept in sync manually and contain the same content. The web version is nicer to read; the markdown lives here so GitHub indexes the full text of the guide, so searches like "operate WhatsApp via OpenClaw", "TimelinesAI public API skill", or "WhatsApp autoresponder agent" surface the repo with the full article, not just the skill files.

> **Note:** the canonical web version may return 404 if you're reading this before the guide has been published at its final URL. While we're in that window, [`capabilities.md`](capabilities.md) right here is the complete and authoritative text — same content, plain markdown.

## What's in the guide

- **What you can build** — the short version: auto-reply to inbound, send transactional notifications, qualify leads, sync with CRM, share inbox with teammates.
- **Setup** — four steps: connect WhatsApp number, get API token, install a skill from the companion repo (this one), register a webhook.
- **Channel choice** — personal numbers vs WhatsApp Business API. **Critical section if you plan to send outbound.** The skills in this repo are for personal numbers, which are safe for inbound conversations and transactional sends but get banned fast for cold outreach. For broadcasts and cold outreach, use WhatsApp Business API (supported by TimelinesAI today through the dashboard; public API automation coming Q2 2026).
- **Things to know** — no trailing slashes on API paths, strict UTF-8 on JSON bodies, `Authorization: Bearer` not `X-API-KEY`, attachment URLs expire quickly, sends are async, personal numbers get banned for cold outreach.
- **API reference** — verified endpoints only. Reading: `/whatsapp_accounts`, `/chats`, `/chats/{id}/messages`, `/messages/{uid}/status_history`, `/webhooks`, `/files`. Writing: `/messages`, `/chats/{id}/messages`, `/chats/{id}/notes`, `/chats/{id}/labels`, `/webhooks`.
- **22 capabilities** grouped by direction:
  - **Incoming (1-8):** auto-reply, FAQ handler, routing, lead qualification, media understanding, voice transcription, language matching, emoji reactions.
  - **Outbound (9-13):** transactional send by name/phone, in-session follow-ups, event-triggered sends, file delivery, delivery status check.
  - **CRM and analytics (14-18):** response time reporting, unanswered detection, conversation summarization, CRM enrichment, lead scoring.
  - **Operations (19-22):** draft-for-review, human handoff, multi-agent routing, cross-session memory.
- **State persistence pattern** — labels as stages, notes as data, no external database needed.
- **Sending from the right number** — `whatsapp_account_id` JID pinning for multi-number workspaces.
- **Limits and caveats** — Baileys session constraints, webhook retry policy, 24-hour customer service window, ban risk for cold outreach.
- **Example: one full round trip** — a 5-step live API example showing auth check → outbound → delivery status → customer reply (webhook) → reply back, with sanitized placeholder numbers.

## Companion skills

The capabilities in this guide are implemented by the skills in the parent directory:

| Guide section | Skill |
|---|---|
| Incoming capability #1 (auto-reply), #2 (FAQ), #7 (language) | [`../skills/whatsapp-autoresponder/`](../skills/whatsapp-autoresponder/) |
| Incoming capability #4 (lead qualification) | [`../skills/whatsapp-lead-qualifier/`](../skills/whatsapp-lead-qualifier/) |
| Outbound capabilities #9, #11, #12 (transactional and event-triggered sends) | [`../skills/whatsapp-send/`](../skills/whatsapp-send/) |
| Outbound capability #13 (delivery confirmation) | [`../skills/whatsapp-delivery-check/`](../skills/whatsapp-delivery-check/) |

See the [top-level README](../README.md) for installation instructions.

## Staying in sync

The canonical web version is hosted at `https://timelines.ai/guides/openclaw-whatsapp-skills`. The markdown in this repo and the HTML at the canonical URL are kept in sync manually.

For edits: change the source, sync into this `guide/` directory, commit, and update the canonical URL deploy. Both versions should always agree on what the 22 capabilities are.
