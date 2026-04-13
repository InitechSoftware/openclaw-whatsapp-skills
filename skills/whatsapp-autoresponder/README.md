# whatsapp-autoresponder

Reply to every inbound WhatsApp message that arrives through the TimelinesAI webhook, with two hard guardrails: only reply if the chat belongs to your allowed sender JID, and only reply if there are no stop-reply labels on the chat.

## When to use

- You want a 24/7 autoresponder for customer questions on WhatsApp.
- You want an after-hours responder that answers FAQs during off-hours and lets humans handle the rest during business hours.
- You're running an FAQ bot that can hand off to a teammate by adding a label.

## How it's wired

```
Customer sends a message
    ↓
TimelinesAI fires "message:received:new" webhook to your receiver
    ↓
Receiver (examples/vercel-webhook-receiver/) POSTs to your OpenClaw host
    ↓
OpenClaw invokes whatsapp-autoresponder with the payload
    ↓
Skill: (1) verify chat JID (2) check stop labels (3) compose + send reply
    ↓
Customer sees the reply in the same thread
```

## Environment

- `TIMELINES_AI_API_KEY` — Bearer token from `app.timelines.ai → Integrations → Public API`.
- `ALLOWED_SENDER_JID` — the WhatsApp JID this skill is allowed to reply from, e.g. `15550100@s.whatsapp.net`. Required if your workspace has multiple numbers connected.

## Install

Clone this repo into your OpenClaw workspace and symlink the skill directory into your OpenClaw `skills/` path:

```bash
cd ~/.openclaw/workspace
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-autoresponder ~/.openclaw/skills/
```

Then restart OpenClaw or trigger a skill reload so the skill description gets indexed for intent routing.

## Stop-reply labels

The skill looks for these labels on the chat and exits silently if any are present:

- `needs-human` — FAQ handler couldn't answer; a teammate should take over
- `escalate` — the customer explicitly asked for a human
- `pause-bot` — generic pause, human teammate can set this manually

This is the cleanest handoff pattern: humans don't need to unplug the bot, they just tag the chat. Clearing the tag resumes the bot.

## Composing replies — implementation detail

For the simplest version (single canned reply for every message), hard-code the text in step 3 of `SKILL.md`. For an FAQ-matching version, fetch the last ~20 messages from the chat for context and let OpenClaw's reasoning pick the right response. For an LLM-backed full autoresponder, pipe the full history into the model and let it compose.

The skill is the same in all three cases — only step 3's "compose the reply text" line changes.

## Testing

```bash
# Dry-run: invoke the skill with a synthetic payload without actually sending
export TIMELINES_AI_API_KEY=sk-...
export ALLOWED_SENDER_JID=15550100@s.whatsapp.net
export CHAT_ID=12345678
export DRY_RUN=1

# Then watch the skill output for the verify + label steps without the send
```

(`DRY_RUN` isn't built into the SKILL.md by default — add it as a conditional around the final `curl` if you want a safer test harness.)

## What it doesn't do

- Doesn't initiate conversations (use `whatsapp-send` for that, and read [`../../docs/compliance.md`](../../docs/compliance.md) first).
- Doesn't retry on failure — if a send returns 5xx, let the caller decide.
- Doesn't deduplicate — if TimelinesAI retries the webhook, the skill runs twice. Use `message_uid` in your receiver to deduplicate before invoking the skill.
