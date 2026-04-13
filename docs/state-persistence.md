# State persistence — labels as stages, notes as data

OpenClaw skills don't keep state in memory across invocations. WhatsApp conversations are multi-turn. These two facts collide, and the fix is to store state on the chat itself using TimelinesAI's labels and notes endpoints.

This document explains the pattern in detail. The `whatsapp-lead-qualifier` skill is the canonical example of applying it.

## The three storage primitives

TimelinesAI gives you three places to persist state about a chat:

### Labels

- **API:** `GET /chats/{id}/labels`, `POST /chats/{id}/labels {"label": "..."}`
- **Shape:** a flat array of strings per chat
- **Use:** discrete stage markers, routing tags, stop-reply flags
- **Cost:** cheap — labels are indexed and chats can be filtered by label in `GET /chats?label=...`

Examples:
- `discovery/q1` (lead qualifier is on question 1)
- `qualified`, `disqualified` (lead qualifier is finished)
- `needs-human`, `escalate`, `pause-bot` (human is taking over, bot must stop)
- `intent/sales`, `intent/support` (chat is claimed by a specific specialist bot)
- `vip`, `to-follow-up`, `inbound-lead` (business tags humans can apply manually)

### Notes

- **API:** `POST /chats/{id}/notes {"text": "..."}`. Read by iterating `GET /chats/{id}/messages` and filtering `message_type == "note"`.
- **Shape:** free text, arbitrary length
- **Use:** structured blob data, draft replies for human review, lead answers, extracted information from customer messages
- **Cost:** notes live in the same message feed as WhatsApp messages, so reading state means paginating history

Notes are write-only from the public API — **`GET /chats/{id}/notes` returns 405**. You read notes by listing the chat's message history and filtering by `message_type`:

```bash
curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages?limit=50" \
  | jq '.data.messages[] | select(.message_type=="note")'
```

Notes are invisible to the customer — they're only visible inside the TimelinesAI inbox to you and your human teammates.

### Chat metadata (assignee, read state)

- **API:** `PATCH /chats/{id} {"responsible_email": "...", "read": true|false, ...}`
- **Use:** which human teammate owns the chat, read state, closed/open
- **Cost:** cheap

Less commonly used for skill state — mostly for routing handoffs to humans.

## The pattern

For any multi-turn skill:

1. **Identify the discrete stages.** Write them down. `discovery/q1`, `discovery/q2`, `qualified`. Keep the list short.
2. **Identify the structured data** you need to remember across turns. `team_size`, `use_case`, `timeline`. Give each a consistent key format you can parse back.
3. **On every skill invocation:**
   - `GET /chats/{id}/labels` — figure out the current stage.
   - If the chat has a stop-reply label, exit.
   - Branch on stage. Do the per-stage logic.
   - `POST /chats/{id}/notes` to persist whatever data came out of this turn.
   - `POST /chats/{id}/labels` to advance the stage (or finalize it with `qualified` / `disqualified`).
   - Send the next reply via `POST /chats/{id}/messages`.
4. **Never rely on in-memory state** in the skill process. Every fact that matters next turn has to be on the chat.

## Why this beats an external database

### Crash safety

A restarted skill picks up exactly where it left off. Every state transition is an HTTP call that's already committed to TimelinesAI. There's no window where the skill "thinks" it's in stage 2 but the persistence layer hasn't caught up — the persistence layer IS the source of truth.

### Human observability

Your teammates see the stage progress and the lead's answers in the same TimelinesAI inbox view they already use for the customer conversation. They don't need to open a separate admin panel, log in to your database, or ask you "what does this chat think it's doing". The state is the inbox.

### Clean handoff without bespoke code

A human can clear `discovery/q2` to rewind the flow. Or add `escalate` to take over entirely. Or add `vip` to mark the chat as high-priority. All of these changes are visible to the skill on the next invocation without any handoff signaling protocol — the skill just reads labels and does the right thing.

### Audit and search

Labels are indexed. You can query:

```bash
# All qualified leads
GET /chats?label=qualified

# All chats currently in discovery/q3
GET /chats?label=discovery/q3

# All chats that escalated to a human
GET /chats?label=escalate
```

Notes are searchable too (client-side — paginate chat messages and filter). You can answer questions like "which leads said team_size >= 10" across your entire workspace.

## Trade-offs

### Every state transition is an HTTP call

- `GET /chats/{id}/labels` — ~100-200ms
- `POST /chats/{id}/notes` — ~150-300ms
- `POST /chats/{id}/labels` — ~100-200ms
- `POST /chats/{id}/messages` — ~200-400ms

Total round-trip for one turn: roughly 500ms to 1 second of skill latency.

For WhatsApp conversations this is **invisible** — customers expect replies in seconds, not sub-second. For a "type indicator" style interaction where the agent needs to respond in under 200ms, put a local cache in front of the chat state read.

### Label string conventions

Labels are free-form strings. Pick a convention and stick to it:

- Use forward-slash namespacing: `discovery/q1`, `intent/sales`, `priority/high`
- Use lowercase-kebab-case for simple tags: `needs-human`, `pause-bot`, `to-follow-up`
- Use boolean-style for flags: `qualified`, `vip` (presence = true, absence = false)

Document the label namespace somewhere your teammates can find it. A new team member needs to know what `discovery/q2` means before they start touching chats.

### Notes are write-only from the API

You can't update or delete a note through the public API — you can only append. If the lead qualifier writes `team_size=8` and the customer later corrects themselves to "actually 12", you have to write a new note, and your parsing logic has to pick the latest one. This is usually fine but worth knowing.

## Worked example — multi-turn lead qualifier state

Turn 1 — customer says "Hi, I want to know more about your product":

```
Agent reads labels  → (none)
Agent interpretation → fresh lead
Agent writes label  → discovery/q1
Agent sends message → "Hi! What are you trying to solve?"
```

Turn 2 — customer says "We're struggling with slow customer response times":

```
Agent reads labels  → [discovery/q1]
Agent interpretation → on stage q1, incoming text is the answer
Agent writes note   → [LEAD] use_case=slow customer response times
Agent writes label  → discovery/q2
Agent sends message → "Got it. How big is your team?"
```

Turn 3 — customer says "About 15 people":

```
Agent reads labels  → [discovery/q1, discovery/q2]
Agent interpretation → on stage q2 (the later label), answer = team size
Agent writes note   → [LEAD] team_size=15
Agent writes label  → discovery/q3
Agent sends message → "Perfect. When are you hoping to start?"
```

Turn 4 — customer says "In the next month":

```
Agent reads labels  → [discovery/q1, discovery/q2, discovery/q3]
Agent interpretation → on stage q3 (the latest), last question
Agent writes note   → [LEAD] timeline=next month
Agent reads notes   → [LEAD] team_size=15 → passes rule
Agent writes label  → qualified
Agent sends message → "Great — someone will reach out shortly."
```

Turn 5 (hypothetical) — customer says "Actually, can you tell me about pricing first?":

```
Agent reads labels  → [discovery/q1, discovery/q2, discovery/q3, qualified]
Agent interpretation → lead is already qualified, flow is done
Agent action        → exits silently — human takes over
```

The skill process ran 5 times, stored all the state on the server, and never needed any memory of its own.
