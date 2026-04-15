# Two-number test harness

A self-referential test rig for the OpenClaw + TimelinesAI pattern: one WhatsApp number plays a simulated customer, another runs your real agent-under-test, both connected to the same TimelinesAI workspace. You watch the conversation unfold in the TimelinesAI dashboard while the harness logs both sides in your terminal.

Useful when you want to iterate on a skill's behavior without messaging yourself from a second phone and without waiting for real customers to hit your agent.

## What it does

```
   ┌──────────────┐         ┌────────────────┐
   │ +1 555 0100  │         │ +1 555 0200    │
   │  "customer"  │         │ "agent-under-  │
   │   persona    │         │     test"      │
   └──────┬───────┘         └────────┬───────┘
          │                          │
          │   one TimelinesAI workspace
          │                          │
          └──────────► Public API ◄──┘
                          │
                message:received:new
                          │
                          ▼
              ┌─────────────────────┐
              │ This receiver       │
              │  switch(accountJid){│
              │    A → persona next │
              │    B → agent turn   │
              │  }                  │
              └─────────────────────┘
```

The harness reads `data.whatsapp_account_id` from every inbound webhook to decide which side the event belongs to. The customer sends a scripted line, the agent replies, the receiver routes the reply back to the persona side, the persona sends the next scripted line, and the scenario walks itself to completion.

Example scenario: 4-turn lead qualifier from "hi I saw your ad" to "qualified".

## Prerequisites

- **Two WhatsApp numbers** connected to the same TimelinesAI workspace. The reader setup guide at [timelines.ai/guide/openclaw-whatsapp-skills](https://timelines.ai/guide/openclaw-whatsapp-skills) walks through connecting one; repeat the QR dance with a second phone for this harness. If you only have one number, you can't run this pattern — use the Draft-for-review capability (cap #19) instead and walk the conversation manually in the TimelinesAI dashboard.
- **A TimelinesAI Public API token** — same one the rest of this repo uses.
- **Vercel CLI** — `npm i -g vercel`.
- **Node 20+**.

## Setup

```bash
# 1. Clone this repo and cd into the harness
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
cd openclaw-whatsapp-skills/examples/test-harness

# 2. Generate a webhook secret
export WEBHOOK_SECRET=$(openssl rand -hex 16)
echo "Save this: $WEBHOOK_SECRET"

# 3. Create your env file
cp .env.example .env
$EDITOR .env
# Fill in TIMELINES_AI_API_KEY, PERSONA_JID/PHONE, AGENT_UNDER_TEST_JID/PHONE,
# and WEBHOOK_SECRET

# 4. Deploy the receiver to Vercel
vercel deploy --prod
# Note the production URL Vercel prints at the end — you'll register it
# with TimelinesAI in the next step.

# 5. Push your env vars up to Vercel so the deployed function sees them
vercel env add WEBHOOK_SECRET production
vercel env add TIMELINES_AI_API_KEY production
vercel env add PERSONA_JID production
vercel env add AGENT_UNDER_TEST_JID production
vercel env add PERSONA_PHONE production
vercel env add AGENT_UNDER_TEST_PHONE production

# 6. Redeploy so the env vars take effect
vercel deploy --prod
```

## Register the webhook once

```bash
source .env
WEBHOOK_URL="https://your-project.vercel.app/api/webhook?secret=${WEBHOOK_SECRET}"

curl -sS -X POST \
  -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"message:received:new\",\"url\":\"${WEBHOOK_URL}\",\"enabled\":true}" \
  https://app.timelines.ai/integrations/api/webhooks
```

You should get back `{"status":"ok","data":{"id":NNN,...}}`.

## Run the scenario

```bash
# Kick off the first customer turn
source .env
node scripts/start-scenario.js

# Watch the scenario walk itself
vercel logs --follow
```

Open the TimelinesAI dashboard in another browser tab, drill into the chat between your persona number and your agent number, and you'll see the whole back-and-forth happen live.

## Watching and intervening

There's no special "pause and review" mechanism — the harness runs autonomously. Human oversight happens through the TimelinesAI dashboard:

- **Watch**: the dashboard shows every message both sides send, in real time
- **Correct**: send a manual reply from the agent's inbox, edit labels on the chat, write a note — all the normal TimelinesAI UI actions work
- **Stop**: delete the registered webhook (or just stop the Vercel function) and the scenario halts immediately

This is on purpose. The harness is a loop; your dashboard is the instrument panel.

## What's in here

```
examples/test-harness/
├── api/
│   └── webhook.js            # receiver — routes by whatsapp_account_id
├── scenarios/
│   └── lead-qualifier.js     # 4-turn scripted customer journey
├── scripts/
│   └── start-scenario.js     # kicks off the first customer turn
├── lib/
│   ├── tl.js                 # tiny TimelinesAI API client
│   └── logger.js             # split-pane color-coded logger
├── .env.example
├── package.json
├── vercel.json
└── README.md
```

## Building your own scenario

Copy `scenarios/lead-qualifier.js` to `scenarios/<your-name>.js` and edit the `PERSONA_SCRIPT` array — each entry is one customer turn. Wire the new scenario into `api/webhook.js` by swapping the import. For multi-branch scenarios, replace the in-memory `personaPosition` with persistent state (TimelinesAI chat notes work great for this — see the state-persistence pattern in the main guide).

## Security

- The webhook endpoint requires `?secret=<WEBHOOK_SECRET>` — rotate if leaked.
- The `TIMELINES_AI_API_KEY` is a full-workspace token. Don't commit `.env`. Don't deploy this harness with a production token — use a sandbox workspace.
- Persona and agent numbers should be test numbers, not real customer-facing business numbers. The harness will send real WhatsApp messages between them.

## Companion docs

- Main guide: [timelines.ai/guide/openclaw-whatsapp-skills](https://timelines.ai/guide/openclaw-whatsapp-skills) — the full OpenClaw + TimelinesAI capability guide
- Production receiver: [`examples/vercel-webhook-receiver/`](../vercel-webhook-receiver/) — the non-test version, without scenario scripting
- Compliance: [`docs/compliance.md`](../../docs/compliance.md) — when it's safe to send outbound, when you'll get banned
