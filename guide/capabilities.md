# Build a WhatsApp agent with OpenClaw + TimelinesAI

A practical guide for OpenClaw users who want to turn WhatsApp into a customer channel their agent operates on: **auto-reply to incoming messages**, **send transactional and event-triggered notifications** to customers who expect them, pull history into your CRM, and share the inbox with human teammates. TimelinesAI handles the WhatsApp gateway (connection, session recovery, multi-number, shared inbox). Your OpenClaw skill handles the reasoning. This guide shows you what you can build and which API calls your skill needs to make.

> ⚠️ **This guide is about personal WhatsApp numbers — for inbound conversations and transactional sends.** For cold outreach, marketing broadcasts, or promotional campaigns, use **WhatsApp Business API** instead (TimelinesAI supports it today through the dashboard; public API automation is coming in **Q2 2026**). Skip ahead to *Channel choice — personal numbers vs Business API* below for the full framing.

---

## What you can build

With an OpenClaw skill that speaks the TimelinesAI public API, your agent can:

- **Answer incoming customer messages automatically** — 24/7 autoresponder, after-hours responder, or FAQ handler that escalates to a human when it doesn't know the answer.
- **Send transactional and event-triggered messages** — order confirmations, shipping updates, appointment reminders, payment receipts, and notifications triggered by events in other tools (HubSpot, Stripe, Calendly…). Only to customers who expect the message.
- **Qualify leads through multi-turn conversations** — ask a sequence of questions, store answers, tag the chat as qualified or not.
- **Sync WhatsApp activity with your CRM** — look up incoming numbers in HubSpot/Pipedrive, update deal stages, push notes back.
- **Summarize and score conversations** — "what did ACME ask about last week", "score this chat 1–10 on intent".
- **Share the inbox with teammates** — your agent drafts replies as private notes, humans send them; or your agent sends and humans watch.
- **Handle media** — photos of receipts, PDFs, voice notes — downloaded through the webhook, processed by OpenClaw, replied to.

Everything below is the long version of that list, with the specific API calls each capability needs.

**What you can't build on a personal number** (and where to do it instead): cold outreach, marketing broadcasts, unsolicited promotional campaigns. Those belong on WhatsApp Business API — see the channel-choice section right after setup.

---

## Setup

Four things to wire together. After this, your skill just makes API calls.

### 1. Connect your WhatsApp number to TimelinesAI

Sign in at [app.timelines.ai](https://app.timelines.ai), add a WhatsApp account, scan the QR code with the phone that holds your business number. TimelinesAI runs the gateway from here on — reconnects after WhatsApp Web logouts, recovers sessions, juggles multi-device updates. Your skill doesn't touch any of that; it just calls the API.

If your business has more than one WhatsApp number, you can connect them all to the same workspace. Your skill picks which one sends on each turn — see *Sending from the right number* below.

### 2. Get an API token

In `app.timelines.ai` → Integrations → Public API → Copy. Save it in your OpenClaw workspace as `TIMELINES_AI_API_KEY`. One token covers every WhatsApp number connected to the workspace, plus Chats, Messages, Files, Labels, Notes, and Webhooks.

Smoke-test it before you build anything:

```bash
curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  https://app.timelines.ai/integrations/api/whatsapp_accounts
```

You should see a JSON list of your connected numbers, each with an `id` (JID), `phone`, `status`, and `account_name`. If you don't, see *Things to know* below before you go any further.

### 3. Install a skill from the companion repo

Ready-made `SKILL.md` files for the capabilities in this guide live at **[github.com/InitechSoftware/openclaw-whatsapp-skills](https://github.com/InitechSoftware/openclaw-whatsapp-skills)**. Clone the repo into your OpenClaw workspace and symlink the skills you want:

```bash
cd ~/.openclaw/workspace
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-autoresponder   ~/.openclaw/skills/
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-lead-qualifier  ~/.openclaw/skills/
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-send            ~/.openclaw/skills/
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-delivery-check  ~/.openclaw/skills/
```

The repo ships four skills — autoresponder, multi-turn lead qualifier, transactional sender, and delivery checker — plus a deployable Vercel webhook receiver and docs on the multi-number pinning and state persistence patterns. You can also build your own from scratch: an OpenClaw skill is just a `SKILL.md` with YAML frontmatter and a body that describes how to use the API. See [the OpenClaw skills docs](https://docs.openclaw.ai/tools/skills) for the full format and the companion repo for working examples.

### 4. Register a webhook for incoming messages

TimelinesAI pushes incoming WhatsApp messages to an HTTPS URL you own. Your webhook receiver invokes OpenClaw, and the skill replies. The receiver is the one piece of infrastructure you run yourself — everything else is managed.

Register the webhook once from your machine:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"message:received:new","url":"https://your-app.example.com/webhook","enabled":true}' \
  https://app.timelines.ai/integrations/api/webhooks
```

The receiver itself is ~30 lines in any HTTP framework. It accepts the webhook POST, extracts `chat_id`, `text`, and `sender_phone`, and hands them off to your OpenClaw skill. TimelinesAI retries each event up to 3 times with a 5-second timeout — so your receiver must return a 2xx status fast and do the slow work afterward (either inline after sending the response, or by pushing to a queue your agent drains separately).

A minimal Node/Vercel receiver looks like this:

```javascript
// api/webhook.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { event_type, data } = req.body || {};
  if (event_type !== "message:received:new") {
    return res.status(200).json({ ignored: event_type });
  }

  // Ack fast, then hand off to the agent.
  res.status(200).json({ ok: true });

  await fetch(process.env.OPENCLAW_HOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: data.chat_id,
      text: data.text,
      sender_phone: data.sender_phone,
    }),
  });
}
```

That's the whole setup. From here on, you're just writing skills.

---

## Channel choice — personal numbers vs Business API

Before you start building outbound flows, understand which WhatsApp channel your use case belongs to. Picking wrong gets numbers banned.

**Personal WhatsApp numbers** (what this guide covers) are the numbers your team already uses — connected to TimelinesAI by scanning a QR code, just like WhatsApp Web. They're ideal for:

- **Inbound conversations.** Customer messages you first, you reply. No risk.
- **Transactional sends.** Order confirmations, shipping updates, delivery notifications, payment receipts, appointment reminders — any message a customer expects because they just did something with your business.
- **Event-triggered notifications from other tools.** HubSpot deal → demo confirmation, Stripe failed payment → recovery note, Calendly booking → pre-meeting reminder. The customer opted in when they used the upstream tool; the WhatsApp send is downstream of their action.
- **Replying inside WhatsApp's 24-hour customer service window.** Once a customer messages you, you have 24 hours to reply freely with any content. The autoresponder, FAQ handler, and lead qualifier skills all operate inside this window.

**Personal numbers are NOT for:**

- Cold outreach to lists you bought or scraped.
- Marketing broadcasts to customers who didn't specifically opt in.
- Promotional campaigns, sales offers, product launches.
- Anything resembling a marketing blast.

WhatsApp enforces against cold outreach from personal numbers aggressively — bans typically happen within hours of the first few sends. TimelinesAI cannot protect you from this, because the ban is enforced at WhatsApp's infrastructure layer, not at the gateway.

**WhatsApp Business API** is Meta's official API for business-to-consumer messaging at scale. It requires a dedicated phone number, business verification, approved message templates for marketing content, and explicit opt-in from customers — but in exchange, you get the ability to send broadcasts and promotional content without ban risk.

**TimelinesAI already supports WhatsApp Business API** today, through the product dashboard. You can connect a Business API number to your workspace, manage templates, and run broadcasts through the shared inbox UI.

**What's not available yet:** public API automation for Business API workflows. The endpoints at `app.timelines.ai/integrations/api` covered in this guide don't currently expose Business API operations, so the skills in this guide don't extend to broadcasts or cold outreach.

**Coming in Q2 2026:** public API support for WhatsApp Business API. When it ships, a companion set of skills for Business API flows will land in the [openclaw-whatsapp-skills repo](https://github.com/InitechSoftware/openclaw-whatsapp-skills). Until then, Business API workflows go through the TimelinesAI dashboard directly, not through the skills here.

**How to tell which channel you need**, in order:

1. Did the customer message you first, or are you replying inside an active 24-hour session? → **Personal number**, skills in this guide.
2. Is the customer about to receive something they explicitly expect (order, appointment, payment, delivery)? → **Personal number**, transactional send.
3. Is this triggered by a customer-opted-in event in your CRM / billing / scheduling tool? → **Personal number**, event-triggered send.
4. Is it a broadcast, cold outreach, or promotional campaign? → **Business API**, not this guide. Use the TimelinesAI dashboard until public API automation ships in Q2 2026.
5. Not sure? → Don't send. Treat it as promotional and route it to the Business API path.

Every capability below in the Outbound section assumes you've passed this test. If you're not sure, re-read this section before shipping.

---

## Things to know before you start

A few details that are easy to miss from the published reference and will each cost you an hour if you don't know them.

- **No trailing slashes.** `GET /chats` works. `GET /chats/` returns the TimelinesAI branded 404 HTML page — which looks like a network problem and isn't. Every URL in this guide is written without a trailing slash on purpose.
- **JSON bodies must be valid UTF-8.** The parser rejects anything else with an explicit `'utf-8' codec can't decode byte...` error. Em-dashes, smart quotes, and similar characters pasted into shell heredocs are the common trigger. Write payloads to a file with explicit UTF-8 encoding and use `curl --data-binary @file.json` instead of inline `-d "..."`.
- **Base URL is `https://app.timelines.ai/integrations/api`.** Some older blog posts reference a different subdomain with an `X-API-KEY` header — that's outdated. The canonical scheme is Bearer auth on `app.timelines.ai/integrations/api`.
- **Attachment URLs in webhook payloads are short-lived.** When a customer sends a photo or PDF, your webhook receives a URL you can download from — but only for a short window. Download media inline in the webhook handler, not in an async worker.
- **Sending is asynchronous.** `POST /messages` returns a `message_uid` — that's a receipt, not a delivery confirmation. Use `GET /messages/{uid}/status_history` to check actual delivery later.
- **Personal numbers get banned for cold outreach.** The send endpoints in this guide will let you send to anyone, but WhatsApp's enforcement will ban your personal number quickly if you use them for unsolicited outbound. Only send outbound to people who messaged you first or who explicitly expect a transactional message from you. For broadcasts and cold outreach, use WhatsApp Business API (see *Channel choice* above).

---

## API reference

Every endpoint you need to build every capability below. Base URL: `https://app.timelines.ai/integrations/api`. Auth: `Authorization: Bearer $TIMELINES_AI_API_KEY`.

### Reading

| Method | Path | What it returns |
|---|---|---|
| `GET` | `/whatsapp_accounts` | Your connected WhatsApp numbers, each with JID, phone, status, account name. |
| `GET` | `/chats` | Chat list. Supports `?phone=%2B...` and `?label=...` filters. Each chat has a `whatsapp_account_id` field holding the JID of the number that owns it. |
| `GET` | `/chats/{id}` | One chat's full detail. |
| `GET` | `/chats/{id}/messages` | Message history, with `?limit=N`. Fields include `from_me`, `sender_phone`, `text`, `timestamp`, `message_type` (`whatsapp` vs `note`), `origin`. |
| `GET` | `/chats/{id}/labels` | Labels on this chat. |
| `GET` | `/messages/{uid}/status_history` | Sent / Delivered / Read timeline for an outbound message. |
| `GET` | `/messages/{uid}/reactions` | Reactions on a message. |
| `GET` | `/files` | Files you uploaded via the API. |
| `GET` | `/webhooks` | Your registered webhook subscriptions. |

### Writing

| Method | Path | What it does |
|---|---|---|
| `POST` | `/messages` | Send to a phone number. Body: `{"phone":"+...","text":"..."}`. Returns `{"message_uid":"..."}`. |
| `POST` | `/chats/{id}/messages` | Send into an existing chat. Body: `{"text":"..."}`. Sender is whichever WhatsApp number owns the chat. |
| `POST` | `/chats/{id}/notes` | Attach a private note to a chat. Not sent to WhatsApp — visible only inside TimelinesAI. Returns a `message_uid` and appears inline in the chat history with `message_type: "note"`. Used for agent state and draft-review workflows. |
| `POST` | `/chats/{id}/labels` | Add a label to a chat. Use for stage tracking, routing tags, stop-reply flags. |
| `PATCH` | `/chats/{id}` | Update chat metadata — assignee, read state. |
| `PUT` | `/messages/{uid}/reactions` | Set a reaction emoji on a message. |
| `POST` | `/files` | Upload a file by URL for TimelinesAI to host. |
| `POST` | `/files_upload` | Multipart file upload. |
| `POST` | `/webhooks` | Register a webhook subscription. |
| `PUT` | `/webhooks/{id}` | Update or enable/disable a subscription. |
| `DELETE` | `/webhooks/{id}` | Remove a subscription. |

---

## Incoming messages — what your agent can handle

Every time a customer sends you a WhatsApp message, TimelinesAI fires a `message:received:new` event to your webhook. The payload includes the chat id, the message text, the sender's phone and name, and any attachment URLs. Your skill reads the event, decides what to do, and replies with `POST /chats/{chat_id}/messages`.

Everything in this section is a variation on that loop.

### 1. Auto-reply to every incoming message

The simplest capability. Your agent responds to every customer message — full autoresponder, after-hours responder, or full AI chatbot, depending on what you tell it.

> *"Answer questions about shipping, returns, and opening hours. For anything else, draft a reply and tag the chat for review."*
>
> *"Between 22:00 and 08:00 reply automatically with 'we'll get back to you in the morning'. During business hours just flag incoming chats for me."*
>
> *"Handle my WhatsApp replies while I'm in this meeting."*

**How it works:** skill receives the webhook payload, composes a reply, calls `POST /chats/{chat_id}/messages` with `{"text": "..."}`. One API call per turn, no state to track.

### 2. FAQ handler with escalation to a human

Your agent answers common questions and hands off to a teammate for anything it doesn't recognize.

> *"Answer questions about shipping, returns, and opening hours. For anything else, tag the chat `needs-human` and stop replying until I clear the tag."*

**How it works:** before replying, the skill calls `GET /chats/{chat_id}/labels`. If the chat has a `needs-human` or `escalate` label, the skill exits without sending. If the incoming text matches a FAQ topic, the skill replies. If it doesn't, the skill calls `POST /chats/{chat_id}/labels` with `{"label":"needs-human"}` and exits silently. Your team's inbox filters on the label.

### 3. Route conversations to the right person

Classify incoming chats by intent and assign them to the right teammate.

> *"For each incoming chat, figure out if it's sales, support, or billing, and tag it. Assign sales chats to alex@ours and billing to jamie@ours."*

**How it works:** skill analyzes the incoming text, calls `POST /chats/{chat_id}/labels` with an intent tag like `intent/sales`, then calls `PATCH /chats/{chat_id}` with `{"responsible_email": "alex@ours.example"}` to hand the chat off in the TimelinesAI inbox.

### 4. Qualify leads through a question sequence

Ask a fixed set of questions across multiple turns, store answers, decide whether to qualify the lead.

> *"For any new chat from our Facebook ad campaign, ask about their use case, team size, and timeline. Store answers as notes on the chat. Tag it `qualified` if team size is 5 or more."*

**How it works:** the skill uses labels to track which question it's currently on (`discovery/q1`, `discovery/q2`, `discovery/q3`), and notes to store the answers. On every turn the skill reads `GET /chats/{chat_id}/labels` to find the current stage, parses the incoming text as the answer to that stage's question, writes the answer via `POST /chats/{chat_id}/notes`, advances the label, and asks the next question. At the end it applies the qualification rule and tags the chat `qualified` or `disqualified`. No external database — state lives on the chat. See *State persistence* below for why.

### 5. Understand photos, PDFs, and receipts

Customers send media, your agent extracts useful information from it.

> *"When a customer sends a photo of a receipt, extract the amount and the vendor and add them as a note on the chat."*
>
> *"If someone sends a PDF, classify it as invoice / contract / ID and tag the chat accordingly."*

**How it works:** webhook payloads for media messages include an attachment URL. The receiver must download the attachment immediately (the URL expires quickly). Your skill then processes the file with OpenClaw's vision or document tools and writes the extracted data back via `POST /chats/{chat_id}/notes`.

### 6. Transcribe voice notes and reply

> *"Transcribe inbound voice notes. Reply in text if it's short, or send a voice note back if the answer is long."*

**How it works:** the webhook delivers a URL to the voice file. The skill downloads it, runs transcription, composes a reply. Text replies via `POST /chats/{chat_id}/messages`; voice replies via `POST /chats/{chat_id}/voice_message` (multipart `.ogg` or `.mp3`).

### 7. Detect and match the customer's language

> *"If the customer writes in Spanish, reply in Spanish. If they switch to English mid-conversation, switch with them."*

**How it works:** pure OpenClaw-side reasoning on the incoming text. TimelinesAI just carries the reply.

### 8. React to messages without sending a full reply

Drop a 👀 emoji on an incoming message to acknowledge you saw it, so customers aren't left hanging while your skill or a human teammate composes the full reply.

> *"React with 👀 to every incoming message so customers know I've seen it, then take my time composing the real reply."*

**How it works:** `PUT /messages/{message_uid}/reactions` with the emoji. No message credit consumed — reactions are lightweight.

---

## Outbound — transactional and event-triggered messages

These are messages your agent starts, not replies. Triggered by a customer action your other tools detect (new order, failed payment, demo scheduled), or by a direct human instruction about a specific person ("message John his invoice is ready").

> **Before every capability in this section:** the customer either opened the thread recently (within WhatsApp's 24-hour session window) or explicitly expects this message. If neither is true, don't send it from a personal number — that's Business API territory. See *Channel choice* above.

### 9. Send a transactional message by name or to a new recipient

> *"Message John that his invoice is ready."*
>
> *"Text the plumber our new office address so he can deliver the parts."*
>
> *"Send the signed contract to the client who just wired the deposit."*

All three examples are transactional — a human explicitly triggered each one on behalf of an action that just happened. The recipient expects the message.

**How it works:** for an existing chat, look it up via `GET /chats?name=John` (or via your CRM) and call `POST /chats/{id}/messages`. For a brand-new recipient, call `POST /messages` with `{"phone": "+...", "text": "..."}` — TimelinesAI creates the chat automatically.

The `whatsapp-send` skill in the [companion repo](https://github.com/InitechSoftware/openclaw-whatsapp-skills/tree/main/skills/whatsapp-send) handles both modes, with UTF-8-safe payload serialization and optional sender-JID pinning for multi-number workspaces.

### 10. Scheduled follow-ups inside an active conversation

> *"Every Monday at 9am, check chats tagged `to-follow-up` that had customer activity in the last 24 hours but no reply from us, and send a gentle check-in."*

**How it works:** OpenClaw's scheduling skill triggers the agent on the cron; the TimelinesAI skill pulls the audience with `GET /chats?label=to-follow-up`, filters to chats where the last customer message was less than 24 hours ago, and sends.

**Why the 24-hour filter:** WhatsApp's customer service window. Inside 24 hours of the customer's last message, you can reply freely. Outside 24 hours, your message becomes a re-engagement touch and is back to "needs explicit opt-in and probably a template" — Business API territory. A scheduled follow-up that routinely crosses the 24-hour line is the same ban risk as a cold broadcast dressed up as "we already talked once". Either stay inside the window or route to Business API.

### 11. Trigger messages from events in your CRM or other tools

> *"When a HubSpot deal hits 'demo scheduled', send a WhatsApp confirmation with the meeting link."*
>
> *"When Stripe reports a failed payment, send a polite recovery message with a link to update the card."*
>
> *"When a Calendly booking is created, send a pre-meeting reminder the morning of."*

**How it works:** your existing tool (HubSpot, Stripe, Calendly, Pipedrive) fires its own webhook into your agent. The agent classifies the event and calls `POST /messages` or `POST /chats/{id}/messages`. This is the highest-value pattern in this guide — it turns WhatsApp into a delivery channel for any workflow you already have, and the messages are transactional by nature because they're downstream of a customer action in the upstream tool.

### 12. Send files and documents on request

> *"Generate the quote PDF and send it to the customer who just asked for pricing."*
>
> *"Email the contract as a PDF and also drop it in the WhatsApp chat for the client."*

**How it works:** two steps. First upload the file via `POST /files` (by URL) or `POST /files_upload` (multipart). Then attach it to a message via `POST /chats/{id}/messages` referencing the uploaded file. The customer asked for the document — this is a reply to their request, not cold outreach.

### 13. Check whether a message was actually delivered

> *"Did John actually receive the invoice message I sent this morning?"*

**How it works:** every send returns a `message_uid`. Later, `GET /messages/{uid}/status_history` returns the Sent → Delivered → Read timeline. Delivery is usually within a second or two on an active number; Read happens only when the recipient opens the chat (and only if they have read receipts enabled — many customers disable them, so treat `Read` as positive evidence but `not Read` as inconclusive).

The `whatsapp-delivery-check` skill in the [companion repo](https://github.com/InitechSoftware/openclaw-whatsapp-skills/tree/main/skills/whatsapp-delivery-check) wraps this.

> **Note on numbering:** previous versions of this guide had a *Bulk notifications* capability as #10 with ~30 messages/minute throughput framing. That capability was **removed** — unsolicited bulk sends from personal numbers get banned. For broadcasts, use WhatsApp Business API through the TimelinesAI dashboard, or wait for public API support in Q2 2026.

---

## CRM and analytics

TimelinesAI's read endpoints give your agent enough data to answer analytical questions and sync state with your CRM in natural language, without a separate BI tool.

### 14. Response time reporting

> *"What was our average first-reply time on WhatsApp this week?"*
>
> *"Who on my team is slowest to reply?"*

**How it works:** pull recent chats via `GET /chats`, then `GET /chats/{id}/messages` for each, then `GET /messages/{uid}/status_history` to find the first outbound message after each inbound. Aggregate client-side.

### 15. Unanswered message detection

> *"How many messages did we receive yesterday? How many are still unanswered?"*
>
> *"Show me every chat with an incoming message in the last 24 hours and no reply yet."*

**How it works:** `GET /chats?read=false` returns unread chats. Filter messages by `from_me=false` to find dangling inbound messages.

### 16. Summarize conversations on demand

> *"Summarize the entire conversation with ACME Corp. What are their pain points?"*
>
> *"Give me a one-paragraph brief on every chat I haven't replied to yet."*

**How it works:** fetch `GET /chats/{id}/messages` and let OpenClaw summarize. For long threads, paginate.

### 17. Enrich your CRM with WhatsApp activity

> *"For every new chat this week, look up the number in HubSpot. If it's a contact, tag the chat with their deal stage. If not, create the contact."*

**How it works:** agent combines TimelinesAI reads with your CRM's API (or an existing OpenClaw CRM skill). Writes results back to the chat via `POST /chats/{id}/labels` and `POST /chats/{id}/notes`.

### 18. Score leads from conversation content

> *"Score every chat tagged `inbound-lead` from 1 to 10 on fit and urgency. Write the score as a note on the chat."*

**How it works:** LLM reasoning over `GET /chats/{id}/messages`, result written via `POST /chats/{id}/notes`.

---

## Operations — scale and handoff

### 19. Draft replies for human review instead of sending

Your agent composes the reply but saves it as a private note. Your team reviews and sends manually from the TimelinesAI inbox.

> *"For every new incoming message, draft a reply and save it as a note on the chat. Don't send — I'll review and send them myself."*

**How it works:** `POST /chats/{id}/notes` with the draft text instead of `/messages`. The note appears in the same chat view your teammates already use, marked as a note rather than a real message.

### 20. Hand off to a human when the agent is stuck

> *"If the conversation goes more than 5 turns without resolution, or the customer explicitly asks for a human, tag the chat `escalate` and stop replying until I clear the tag."*

**How it works:** the skill counts turns with `GET /chats/{id}/messages` and checks for stop-reply labels (`escalate`, `needs-human`) with `GET /chats/{id}/labels` before every send. If escalation is triggered, `POST /chats/{id}/labels` with `escalate` and exit. This same pattern (label guardrail before send) is what keeps every other skill safe from sending when a human has taken over.

### 21. Run multiple specialized agents on one inbox

> *"Sales AI handles pricing questions, support AI handles product questions. Route by intent; if both are unsure, escalate to me."*

**How it works:** two OpenClaw agents, two skills, one TimelinesAI workspace. An intent-classification skill runs first, tags the chat `intent/sales` or `intent/support`, and the specialist skills check the label before replying so they only claim their own chats.

### 22. Remember past conversations with the same customer

> *"Last week you mentioned you were traveling — how did that go?"*

**How it works:** OpenClaw's own memory about the user combined with `GET /chats/{id}/messages` for the full WhatsApp history. The agent can reference prior messages naturally because the chat history survives across invocations.

---

## State persistence

OpenClaw skills don't keep state in memory across invocations. WhatsApp conversations are multi-turn. The fix is to store state on the chat itself.

- **Labels hold discrete stage** — `discovery/q1`, `discovery/q2`, `qualified`, `escalate`. Add with `POST /chats/{id}/labels`, read with `GET /chats/{id}/labels`.
- **Notes hold structured data** — `team_size=8`, `next_followup=2026-04-20`, draft replies, lead scores. Add with `POST /chats/{id}/notes`. Read by iterating `GET /chats/{id}/messages` and filtering where `message_type == "note"`.

This pattern has three upsides over an external state store:

1. **Crash safety** — a restarted skill picks up exactly where it left off because state is on the server.
2. **Visibility to humans** — teammates see stage progress and agent drafts in the same inbox view as the customer conversation.
3. **Clean handoff** — a human can clear a label to rewind the flow, or add `escalate` to take over.

The trade-off is that every state transition is an HTTP call. For customer-facing flows with minutes-to-hours cadence this is fine; for sub-second reactions, put a local cache in front.

---

## Sending from the right number

If your workspace has more than one WhatsApp number connected, you need to make sure your skill sends from the intended one. This matters more than it sounds — accidentally sending your sales outbound from the support number's persona is a hard mistake to explain afterwards.

The rule: every chat has a `whatsapp_account_id` field holding the full JID (like `PHONE@s.whatsapp.net`) of the number that owns it. When your skill calls `POST /chats/{id}/messages`, the sender is always that JID — you don't pick it, the chat does.

So the pattern is:

1. Hard-code the allowed sender JID in each skill's environment (e.g. `ALLOWED_SENDER_JID`).
2. Before sending, `GET /chats/{id}` and compare `whatsapp_account_id` to your allowed JID.
3. If they don't match, skip the send — either surface to a human or drop the event.

Two extra HTTP calls per turn, zero chance of sending from the wrong persona. For single-number workspaces this section doesn't apply — the chat ownership is unambiguous.

---

## Limits and caveats

- **Personal numbers get banned for cold outreach.** See *Channel choice* section above. Unsolicited broadcasts from personal numbers are not a supported use case of this API — TimelinesAI cannot protect you from the WhatsApp-layer ban, because the ban is enforced upstream. For broadcasts, use WhatsApp Business API through the TimelinesAI dashboard (public API automation for Business API workflows is coming in Q2 2026).
- **WhatsApp's 24-hour customer service window.** You can reply to a customer freely for 24 hours after their last message. Outside that window, messages require opt-in and templates — Business API territory. Agent flows that routinely cross this line (re-engagement of dormant leads, follow-up on week-old chats) should be moved to Business API.
- **One WhatsApp Web session per number** — inherited from the WhatsApp Web transport. For parallelism, connect multiple numbers to one workspace instead of doubling up on a single number.
- **Asynchronous delivery** — `POST /messages` returns a `message_uid` (a receipt), not a delivery confirmation. Use `/status_history` to confirm real delivery.
- **Attachment URLs expire quickly** — download media inline in the webhook handler, not from a delayed worker.
- **Webhook retry policy** — 3 attempts with a 5-second timeout each. Return 2xx fast and do slow work async.
- **No webhook signature verification** documented publicly — use a secret path segment in your webhook URL (e.g. `/webhook/<random-token>`) as minimum defense.
- **Token scope** — one API token covers the whole workspace: chats, messages, notes, labels, files, webhooks (read + write) and WhatsApp accounts (read only).
- **Skills can't receive HTTP directly** — you need a thin receiver between TimelinesAI and OpenClaw (the Vercel example in *Setup* is the full template).
- **Text, media, reactions, metadata only** — no voice/video calls, no broadcast-status, no WhatsApp Channels or Stories. What WhatsApp Web can do, this API can do.

---

## Example: one full round trip

A concrete five-step loop showing what the API looks like in practice — how an agent sends an outbound, confirms delivery, processes the customer's reply, and sends a follow-up. Phone numbers, message IDs, and email addresses below are placeholders — substitute your own when you run this.

**Placeholders used throughout this example:**

```
Your business number   : +1 555 0100   (JID: 15550100@s.whatsapp.net)
Your customer's number : +1 555 0200
API token              : $TIMELINES_AI_API_KEY
```

**Step 1 — confirm your token works and list your connected numbers.**

```bash
$ curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
    https://app.timelines.ai/integrations/api/whatsapp_accounts
{"status":"ok","data":{"whatsapp_accounts":[
  {"id":"15550100@s.whatsapp.net","phone":"+15550100",
   "status":"active","account_name":"Your Business"}
]}}
```

You should see a list of your connected numbers. If the status is anything other than `active`, fix that in the TimelinesAI dashboard before continuing.

**Step 2 — send an outbound message.**

Write the payload to a file with UTF-8 encoding, then `curl` it. This is the pattern you'll use for every outbound.

```bash
$ cat > /tmp/send.json <<'JSON'
{"phone":"+15550200",
 "text":"Hi - your order shipped. Tracking: ABC123."}
JSON

$ curl -sS -X POST \
    -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/send.json \
    https://app.timelines.ai/integrations/api/messages
{"status":"ok","data":{"message_uid":"OUTBOUND-UID-PLACEHOLDER"}}
```

The response is a receipt, not a delivery confirmation. Hold on to the `message_uid` — you need it for the next step.

**Step 3 — check delivery status.**

```bash
$ curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
    https://app.timelines.ai/integrations/api/messages/OUTBOUND-UID-PLACEHOLDER/status_history
{"status":"ok","data":[
  {"status":"Sent",     "timestamp":"2026-04-12 12:28:40 +0000"},
  {"status":"Delivered","timestamp":"2026-04-12 12:28:41 +0000"}
]}
```

Sent → Delivered is typically within a second on an active number. The `Read` status appears later, when the recipient actually opens the chat on their device.

**Step 4 — the customer replies, your webhook fires.**

When the customer responds, TimelinesAI posts to your registered webhook URL:

```json
{
  "event_type": "message:received:new",
  "data": {
    "chat_id": 12345678,
    "message_uid": "INBOUND-UID-PLACEHOLDER",
    "sender_phone": "+15550200",
    "sender_name": "Customer",
    "text": "Thanks! When will it arrive?",
    "timestamp": "2026-04-12 12:29:20 +0000"
  }
}
```

Your receiver acks with a 200 immediately, then hands the payload to your OpenClaw skill.

**Step 5 — reply back from the same chat.**

```bash
$ cat > /tmp/reply.json <<'JSON'
{"text":"Estimated delivery is 2-3 business days. You'll get tracking updates to this chat."}
JSON

$ curl -sS -X POST \
    -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/reply.json \
    https://app.timelines.ai/integrations/api/chats/12345678/messages
{"status":"ok","data":{"message_uid":"REPLY-UID-PLACEHOLDER"}}
```

Because you're sending into an existing chat via `/chats/{id}/messages`, the sender is automatically the WhatsApp number that owns the chat — you don't pick it, the chat record does. This is the whole reason you don't accidentally send from the wrong number in multi-number workspaces.

Full loop: two outbound messages, one inbound webhook, three API calls — all you need to operate WhatsApp as a customer channel from an OpenClaw skill. Every capability earlier in this guide is a variation on this shape.

---

## Where the building blocks come from

- **TimelinesAI Public API** — reference at https://timelinesai.mintlify.app/public-api-reference/overview. Base URL `https://app.timelines.ai/integrations/api`. Auth `Authorization: Bearer <token>`.
- **TimelinesAI webhooks** — created via `POST /webhooks` with `{event_type, url, enabled}`. Event types you'll use: `message:received:new`, `message:sent:new`, `chat:created`. Envelope: `{event_type, data}`. Retry policy: 3 attempts, 5-second timeout each.
- **OpenClaw skill format** — YAML frontmatter + markdown body. A description field drives when the skill triggers. One curl call is a valid skill. Docs: https://docs.openclaw.ai/tools/skills.
