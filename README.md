# OpenClaw WhatsApp Skills

Ready-made [OpenClaw](https://docs.openclaw.ai) skills for operating WhatsApp as a customer channel through the [TimelinesAI](https://timelines.ai) public API. Drop them into your OpenClaw workspace and your agent can auto-reply to incoming messages, run multi-turn lead qualification, send transactional notifications, and track delivery — with a shared inbox your teammates can watch.

Companion to the **[OpenClaw + WhatsApp capability guide](https://timelines.ai/guide/openclaw-whatsapp-skills)**, which explains each capability and the API calls it makes. The full guide markdown is also [in this repo at `guide/capabilities.md`](guide/capabilities.md) so GitHub indexes it for search.

## What's in here

| Skill | What it does |
|---|---|
| [`whatsapp-autoresponder`](skills/whatsapp-autoresponder/) | Reply to every incoming customer message through the webhook. Verifies chat ownership and respects stop-reply labels before every send. |
| [`whatsapp-lead-qualifier`](skills/whatsapp-lead-qualifier/) | Multi-turn lead qualification. Asks a fixed sequence of questions, stores answers as chat notes, tags stages as chat labels, tags the chat `qualified` or `disqualified` at the end. State survives skill restarts because it lives on the chat, not in process memory. |
| [`whatsapp-send`](skills/whatsapp-send/) | Send a **transactional** or **event-triggered** WhatsApp message — by phone number or into an existing chat. Writes JSON payloads to a file first to avoid UTF-8 encoding traps. Returns the `message_uid` for downstream delivery checks. |
| [`whatsapp-delivery-check`](skills/whatsapp-delivery-check/) | Given a `message_uid`, poll `GET /messages/{uid}/status_history` and return the Sent / Delivered / Read timeline. |

Plus:

- [`guide/`](guide/) — the **full 22-capability guide** in markdown, covering inbound handling, outbound transactional sends, CRM sync, operations, state persistence, multi-number sender pinning, limits, and a live-API example round trip. Same content as the [web version at timelines.ai/guide/openclaw-whatsapp-skills](https://timelines.ai/guide/openclaw-whatsapp-skills), lives here so GitHub search indexes it.
- [`examples/vercel-webhook-receiver/`](examples/vercel-webhook-receiver/) — a ~30-line Vercel serverless function that accepts TimelinesAI webhook events and hands them off to your OpenClaw host. One-command deploy.
- [`docs/compliance.md`](docs/compliance.md) — personal numbers vs WhatsApp Business API, when it's safe to send outbound, when you'll get banned.
- [`docs/multi-number.md`](docs/multi-number.md) — how to pin sender identity in workspaces with multiple connected WhatsApp numbers.
- [`docs/state-persistence.md`](docs/state-persistence.md) — the labels-as-stages + notes-as-data pattern used by the lead qualifier and any other multi-turn skill.

## Quick start

```bash
# 1. Clone the repo into your OpenClaw workspace
cd ~/.openclaw/workspace
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git

# 2. Copy the .env template and fill in your TimelinesAI token + allowed sender JID
cp openclaw-whatsapp-skills/.env.example .env.timelinesai
$EDITOR .env.timelinesai

# 3. Symlink the skill directories into your OpenClaw skills path
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-autoresponder   ~/.openclaw/skills/
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-lead-qualifier  ~/.openclaw/skills/
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-send            ~/.openclaw/skills/
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-delivery-check  ~/.openclaw/skills/

# 4. Smoke-test the token
curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  https://app.timelines.ai/integrations/api/whatsapp_accounts
# → should return {"status":"ok","data":{"whatsapp_accounts":[...]}}
```

For the webhook path (needed for `whatsapp-autoresponder` and `whatsapp-lead-qualifier`), see [`examples/vercel-webhook-receiver/README.md`](examples/vercel-webhook-receiver/README.md) — it walks through creating the webhook subscription and deploying the receiver in about five minutes.

## Compliance note — read this before using the send skills

**Personal WhatsApp numbers connected to TimelinesAI are meant for inbound conversations and transactional sends to customers who expect the message.** WhatsApp bans personal numbers for cold outreach, unsolicited broadcasts, and promotional messaging — aggressively and quickly.

**Safe with these skills (personal number):**

- Replying to a customer who messaged you first.
- Sending an order confirmation, shipping update, appointment reminder, or payment receipt to a customer who just transacted with you.
- Sending event-triggered notifications customers explicitly opted into (HubSpot deal → demo confirmation, Stripe failed payment → recovery note).
- Re-engaging customers you've had conversations with recently, within WhatsApp's 24-hour session policy.

**NOT safe with these skills:**

- Cold outreach to purchased lists.
- Marketing broadcasts to customers who haven't opted in.
- Any unsolicited promotional messaging.

For those use cases, use the **WhatsApp Business API** — which TimelinesAI already supports through the dashboard today, with public API automation coming in **Q2 2026**.

Full compliance writeup: [`docs/compliance.md`](docs/compliance.md).

## Environment variables

See [`.env.example`](.env.example) for the full list. Minimum required: `TIMELINES_AI_API_KEY` (Bearer token from `app.timelines.ai` → Integrations → Public API) and `ALLOWED_SENDER_JID` (if you have more than one WhatsApp number in your workspace).

## Companion guide

The capability guide at **https://timelines.ai/guide/openclaw-whatsapp-skills** is the reader-facing version of what these skills implement. If you're wondering *why* a skill does something (the state pattern, sender pinning, the UTF-8 trap in shell heredocs, the webhook retry policy, etc.), that guide has the full context.

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

This is an official companion bundle to TimelinesAI's public API. For bugs, unexpected API responses, or new skill ideas, open an issue. PRs welcome.
