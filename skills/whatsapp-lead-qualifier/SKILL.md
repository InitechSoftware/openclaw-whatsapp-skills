---
name: whatsapp-lead-qualifier
description: |
  Multi-turn lead qualification over WhatsApp. Asks a fixed sequence of
  questions across turns, stores each answer as a note on the chat, and
  tags the chat with the current discovery stage. At the end of the
  sequence, applies a qualification rule and tags the chat `qualified` or
  `disqualified`, then stops replying. State survives skill restarts
  because it lives on the chat, not in the skill process.
env:
  TIMELINES_AI_API_KEY: required
  ALLOWED_SENDER_JID: required
---

# WhatsApp lead qualifier

This is the canonical example of a multi-turn WhatsApp skill that doesn't need an external state store. State lives on the TimelinesAI chat — as labels for discrete stages, notes for structured answers — and the skill reads it from the chat on every invocation.

## State model

| What | Where | Example |
|---|---|---|
| Current stage | Chat label | `discovery/q1`, `discovery/q2`, `discovery/q3`, `qualified`, `disqualified` |
| Collected answers | Chat notes | `[LEAD] use_case=onboarding`, `[LEAD] team_size=8`, `[LEAD] timeline=2_weeks` |
| Stop-reply | Chat label | `escalate`, `needs-human`, `pause-bot` |

The labels are the state machine. The notes are the data. Together they replace any external database for this flow.

## Question sequence

```
q1: "What are you trying to solve?"           → answer stored as [LEAD] use_case=...
q2: "How big is your team?"                   → answer stored as [LEAD] team_size=...
q3: "When do you want to start?"              → answer stored as [LEAD] timeline=...
```

At the end of q3, the skill applies a qualification rule — default is `team_size >= 5`. Customize this in step 5 below.

## Loop

You receive a webhook payload with the incoming customer message. Run these steps in order:

### Step 1 — Verify chat ownership

Same as every other send-capable skill. Skip if the chat's `whatsapp_account_id` doesn't match `$ALLOWED_SENDER_JID`.

```bash
CHAT_JID=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID" \
  | jq -r '.data.whatsapp_account_id')

[ "$CHAT_JID" != "$ALLOWED_SENDER_JID" ] && exit 0
```

### Step 2 — Read the current stage

```bash
LABELS=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/labels" \
  | jq -r '.data.labels[]? // empty')

# Stop entirely if already finished or handed off to a human
case "$LABELS" in
  *qualified*|*disqualified*|*escalate*|*needs-human*|*pause-bot*)
    echo "lead already resolved or paused — exiting"
    exit 0
    ;;
esac

# Find the current discovery stage label
STAGE=$(echo "$LABELS" | grep -oE 'discovery/q[123]' | head -1)
```

### Step 3 — Route based on stage

**If no stage label yet** (fresh lead, first message):
- This is the opening touch. Tag the chat `discovery/q1` and send question 1.

```bash
if [ -z "$STAGE" ]; then
    # Add label
    python3 -c "import json; json.dump({'label': 'discovery/q1'}, open('/tmp/wa_label.json','w'))"
    curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      -H "Content-Type: application/json" --data-binary @/tmp/wa_label.json \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/labels"
    
    # Ask question 1
    python3 -c "import json; json.dump({'text': 'Hi! To help you best, can I ask — what are you trying to solve?'}, open('/tmp/wa_msg.json','w'), ensure_ascii=False)"
    curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      -H "Content-Type: application/json" --data-binary @/tmp/wa_msg.json \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages"
    exit 0
fi
```

**If stage is `discovery/qN`**: parse the incoming `text` as the answer to question N, write it as a note, advance the label, and ask the next question.

```bash
case "$STAGE" in
  "discovery/q1")
    # Parse $TEXT as use_case. Here we just store it raw; a smarter skill would
    # run OpenClaw's reasoning to extract structured intent.
    NOTE_TEXT="[LEAD] use_case=$TEXT"
    NEXT_LABEL="discovery/q2"
    NEXT_Q="Got it. How big is your team?"
    ;;
  "discovery/q2")
    NOTE_TEXT="[LEAD] team_size=$TEXT"
    NEXT_LABEL="discovery/q3"
    NEXT_Q="Perfect. When are you hoping to start?"
    ;;
  "discovery/q3")
    NOTE_TEXT="[LEAD] timeline=$TEXT"
    NEXT_LABEL=""  # will be set to qualified/disqualified in step 5
    NEXT_Q=""
    ;;
esac
```

### Step 4 — Persist the answer + advance

Write the note and add the next stage label:

```bash
# Write the answer as a note
python3 -c "import json,sys; json.dump({'text': sys.argv[1]}, open('/tmp/wa_note.json','w'), ensure_ascii=False)" "$NOTE_TEXT"
curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  -H "Content-Type: application/json" --data-binary @/tmp/wa_note.json \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/notes"

# Add next-stage label (if not on the last question)
if [ -n "$NEXT_LABEL" ]; then
    python3 -c "import json,sys; json.dump({'label': sys.argv[1]}, open('/tmp/wa_label.json','w'))" "$NEXT_LABEL"
    curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      -H "Content-Type: application/json" --data-binary @/tmp/wa_label.json \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/labels"
fi
```

### Step 5 — Ask the next question or apply the qualification rule

If there's a next question, send it. If we just processed the final answer (q3 done), apply the qualification rule and tag `qualified` or `disqualified`.

```bash
if [ -n "$NEXT_Q" ]; then
    python3 -c "import json,sys; json.dump({'text': sys.argv[1]}, open('/tmp/wa_msg.json','w'), ensure_ascii=False)" "$NEXT_Q"
    curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      -H "Content-Type: application/json" --data-binary @/tmp/wa_msg.json \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages"
else
    # Last question done — fetch all answers and apply qualification rule
    MESSAGES=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages?limit=50")
    
    # Extract team_size from the notes. In practice, parse more carefully.
    TEAM_SIZE=$(echo "$MESSAGES" | jq -r '.data.messages[] | select(.message_type=="note") | .text' | grep -oE 'team_size=[0-9]+' | tr -d 'team_size=')
    
    if [ -n "$TEAM_SIZE" ] && [ "$TEAM_SIZE" -ge 5 ]; then
        FINAL_LABEL="qualified"
        CLOSING="Thanks! Based on what you've told me, this is a great fit — I'll have someone on our team reach out within one business day."
    else
        FINAL_LABEL="disqualified"
        CLOSING="Thanks for sharing! Unfortunately we're focused on teams of 5+ right now — I'll keep your info on file and reach out if that changes."
    fi
    
    # Tag + send closing
    python3 -c "import json,sys; json.dump({'label': sys.argv[1]}, open('/tmp/wa_label.json','w'))" "$FINAL_LABEL"
    curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      -H "Content-Type: application/json" --data-binary @/tmp/wa_label.json \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/labels"
    
    python3 -c "import json,sys; json.dump({'text': sys.argv[1]}, open('/tmp/wa_msg.json','w'), ensure_ascii=False)" "$CLOSING"
    curl -sS -X POST -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      -H "Content-Type: application/json" --data-binary @/tmp/wa_msg.json \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages"
fi
```

## Why state on the chat beats an external store

- **Crash safety** — a restarted skill picks up exactly where it left off because every state transition is an HTTP call that's already committed.
- **Visibility** — human teammates see stage progress and agent answers in the same TimelinesAI inbox view they already use for the customer conversation.
- **Clean handoff** — a human can clear `discovery/q2` to rewind the flow, or add `escalate` to take over entirely. The skill respects both without any special handoff code.
- **Audit** — the notes are a permanent log of what the lead told you. Search by tag across chats to find "all leads with team_size >= 20" in one GROQ-like query on TimelinesAI's message feed.

The trade-off: every state transition is an HTTP call (~150-300ms). For customer-facing multi-turn flows with minutes-to-hours cadence, that's fine. For sub-second reactions, put a local cache in front.

## Customizing the question sequence

Everything specific about this skill lives in step 3's question map and step 5's qualification rule. To adapt for a different funnel:

1. Change the question labels (`discovery/q1`, `q2`, ...) to match your number of questions.
2. Change each question's text and the note format it writes.
3. Change the rule in step 5 that decides `qualified` vs `disqualified`.
4. Change the closing messages.

Everything else — state reading, chat ownership check, stop-reply label respect — stays the same.
