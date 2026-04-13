---
name: whatsapp-send
description: |
  Send a transactional or event-triggered WhatsApp message via the
  TimelinesAI public API. Two modes: by phone number (creates a new chat
  if needed) or into an existing chat by chat_id. Writes JSON payloads
  to a file to avoid UTF-8 encoding traps. Returns the message_uid so
  downstream skills can poll delivery status.
env:
  TIMELINES_AI_API_KEY: required
  ALLOWED_SENDER_JID: optional
---

# WhatsApp send

Send one WhatsApp message. Two paths:

| Path | Use when | Endpoint |
|---|---|---|
| **By phone number** | New recipient, or you don't know the chat id | `POST /messages` with `{"phone":"+...", "text":"..."}` |
| **By chat id** | Existing conversation, you have the chat id (e.g. from a webhook or an earlier send) | `POST /chats/{chat_id}/messages` with `{"text":"..."}` |

**The sender is determined differently in each mode:**

- In **phone-number mode**, TimelinesAI picks the sender from your connected numbers. In a single-number workspace this is unambiguous. In a multi-number workspace it uses the workspace default — if you need deterministic sender control, use chat-id mode with a chat you know the ownership of.
- In **chat-id mode**, the sender is **always** the JID stored in the chat's `whatsapp_account_id` field. You don't pick it, the chat record does. That's why this skill verifies chat ownership when `ALLOWED_SENDER_JID` is set.

## ⚠️ Compliance — read before sending

Personal WhatsApp numbers connected to TimelinesAI are for **transactional messages** and **replies to conversations the customer started**. WhatsApp bans personal numbers for cold outreach quickly and aggressively. This skill **will let you send anything** — it's your responsibility to know the send is safe.

**Safe sends with this skill (personal-number workflow):**

- Order confirmation, shipping update, delivery notification, payment receipt.
- Appointment reminder or booking confirmation.
- Reply to a customer who opened the thread within WhatsApp's 24-hour session window.
- Event-triggered notification the customer explicitly opted into (HubSpot "demo scheduled" → meeting link, Stripe failed payment → recovery note).
- Sending a file (quote, invoice, contract) the customer just asked for.

**Not safe — don't use this skill for:**

- Cold outreach to purchased lists.
- Marketing broadcasts to customers who didn't opt in.
- Any unsolicited promotional message.

Those use cases need the **WhatsApp Business API**, which TimelinesAI supports today through the dashboard — public API automation is coming in **Q2 2026**. See [`../../docs/compliance.md`](../../docs/compliance.md) for the full explanation.

## Invocation payload

```json
{
  "mode": "phone" | "chat",
  "phone": "+15550200",              // mode=phone only
  "chat_id": 12345678,               // mode=chat only
  "text": "Your order shipped. Tracking: ABC123."
}
```

## Step 1 — Chat ownership check (chat mode only)

If you're sending into an existing chat and `ALLOWED_SENDER_JID` is set, verify the chat is owned by the allowed number before sending. This prevents accidentally sending your sales outbound from the support number in a multi-number workspace.

```bash
if [ "$MODE" = "chat" ] && [ -n "$ALLOWED_SENDER_JID" ]; then
    CHAT_JID=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
      "https://app.timelines.ai/integrations/api/chats/$CHAT_ID" \
      | jq -r '.data.whatsapp_account_id')
    if [ "$CHAT_JID" != "$ALLOWED_SENDER_JID" ]; then
        echo "chat $CHAT_ID owned by $CHAT_JID, not $ALLOWED_SENDER_JID — refusing to send"
        exit 1
    fi
fi
```

## Step 2 — Write payload to a file (UTF-8 safe)

NEVER use `curl -d "..."` with arbitrary content. Shell encoding will corrupt non-ASCII characters — em-dashes, smart quotes, emoji — and the TimelinesAI JSON parser will reject the whole request with `'utf-8' codec can't decode byte 0x97...`. Always write to a file with explicit UTF-8, always read with `--data-binary @file`.

```bash
if [ "$MODE" = "phone" ]; then
    python3 -c "
import json, sys
json.dump({'phone': sys.argv[1], 'text': sys.argv[2]}, open('/tmp/wa_send.json','w'), ensure_ascii=False)
" "$PHONE" "$TEXT"
else
    python3 -c "
import json, sys
json.dump({'text': sys.argv[1]}, open('/tmp/wa_send.json','w'), ensure_ascii=False)
" "$TEXT"
fi
```

## Step 3 — Send

```bash
if [ "$MODE" = "phone" ]; then
    ENDPOINT="https://app.timelines.ai/integrations/api/messages"
else
    ENDPOINT="https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages"
fi

RESPONSE=$(curl -sS -X POST \
  -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/wa_send.json \
  "$ENDPOINT")

echo "$RESPONSE"
```

Success:

```json
{"status":"ok","data":{"message_uid":"a8f9b2c1-..."}}
```

Capture the `message_uid` from the response and return it. Downstream skills can use `whatsapp-delivery-check` to poll Sent / Delivered / Read status for this uid.

## Failure modes

| Response | Meaning | What to do |
|---|---|---|
| `{"status":"error","message":"Bad JSON format: 'utf-8'..."}` | Your payload isn't valid UTF-8 | Rewrite using step 2's file pattern; don't use inline `-d` |
| `{"status":"error","message":"Not authenticated"}` | Wrong or missing token | Check `$TIMELINES_AI_API_KEY` |
| `{"status":"error","message":"Whatsapp chat_id ... not found"}` | Chat doesn't exist in your workspace | Don't retry; check the id |
| Branded HTML 404 page | Trailing slash on the URL | Remove it (`/messages`, not `/messages/`) |
| `{"status":"error","message":"Phone number invalid"}` | Bad E.164 format | Format as `+<country><number>` with no spaces or dashes |

## What this skill deliberately does NOT do

- Does not retry on network failure — return the error to the caller, let them decide.
- Does not batch multiple sends — call the skill once per recipient.
- Does not throttle — TimelinesAI enforces its own WhatsApp-compliance throttle server-side.
- Does not warn you about cold outreach — you're expected to know. Read [`../../docs/compliance.md`](../../docs/compliance.md) before wiring this into an agent that can initiate conversations.
