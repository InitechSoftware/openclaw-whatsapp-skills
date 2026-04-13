---
name: whatsapp-autoresponder
description: |
  Reply to an inbound WhatsApp message routed through the TimelinesAI webhook.
  Triggers on payloads shaped like {chat_id, text, sender_phone, sender_name}
  from the TimelinesAI webhook receiver. Verifies the chat belongs to the
  allowed sender JID before sending, and honors stop-reply labels
  (needs-human / escalate / pause-bot) so a human can pause the bot on any
  chat with one tag.
env:
  TIMELINES_AI_API_KEY: required
  ALLOWED_SENDER_JID: required
---

# WhatsApp autoresponder

You receive an invocation from the webhook receiver with a payload like:

```json
{
  "chat_id": 12345678,
  "text": "do you support Shopify?",
  "sender_phone": "+15550200",
  "sender_name": "Customer",
  "message_uid": "c9054496-c8d2-4596-9786-aa872da4b743",
  "allowed_sender_jid": "15550100@s.whatsapp.net"
}
```

Your job: compose a reply to the incoming `text` and send it back into the same chat. But before you send, check two guardrails.

## Step 1 — Verify chat ownership (multi-number safety)

If your workspace has more than one WhatsApp number connected, the chat's `whatsapp_account_id` determines who the reply will come from. You must confirm that matches the sender JID this skill is allowed to speak as, or you will leak persona — replying to a sales chat from the support number is a hard mistake to explain.

```bash
CHAT_JID=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID" \
  | jq -r '.data.whatsapp_account_id')

if [ "$CHAT_JID" != "$ALLOWED_SENDER_JID" ]; then
  echo "chat $CHAT_ID owned by $CHAT_JID, not $ALLOWED_SENDER_JID — skipping"
  exit 0
fi
```

Single-number workspaces can skip this check — there's only one possible sender.

## Step 2 — Check for stop-reply labels

If a human teammate has tagged the chat with `needs-human`, `escalate`, or `pause-bot`, the bot must exit silently without sending anything. This is how humans take over without confusing the customer with an overlapping agent reply.

```bash
LABELS=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/labels" \
  | jq -r '.data.labels[]? // empty')

case "$LABELS" in
  *needs-human*|*escalate*|*pause-bot*)
    echo "stop-reply label present — exiting without reply"
    exit 0
    ;;
esac
```

## Step 3 — Reply

Compose your reply text (one short paragraph; if you need conversation history for context, fetch it with `GET /chats/$CHAT_ID/messages?limit=20`). Write the payload to a file with explicit UTF-8 encoding — never use inline `-d "..."` with anything that might contain em-dashes, smart quotes, or emoji, because shell encoding will mangle the bytes and the JSON parser will reject the whole request.

```bash
REPLY_TEXT="Your composed reply here."

python3 -c "import json,sys; json.dump({'text': sys.argv[1]}, open('/tmp/wa_reply.json','w'), ensure_ascii=False)" \
  "$REPLY_TEXT"

curl -sS -X POST \
  -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/wa_reply.json \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID/messages"
```

A successful send returns:

```json
{"status":"ok","data":{"message_uid":"<new-uid>"}}
```

Capture that `message_uid` and return it in your skill output — downstream skills can use it to poll delivery status via `GET /messages/{uid}/status_history`.

## Error responses to watch for

- `{"status":"error","message":"Bad JSON format: 'utf-8' codec can't decode byte 0x97..."}` — your payload isn't valid UTF-8. Go back to step 3 and make sure you're writing the file with `ensure_ascii=False` and reading it with `--data-binary`.
- `{"status":"error","message":"Not authenticated"}` — the token is wrong or missing. Check `$TIMELINES_AI_API_KEY`.
- `{"status":"error","message":"Whatsapp chat_id ... not found"}` — either the chat doesn't exist, or your token's workspace doesn't own it. Either way, don't retry.
- An HTML 404 page instead of JSON — you probably have a trailing slash on the path. Remove it.

## What this skill deliberately does NOT do

- It does not reply if the chat is owned by a different WhatsApp number in a multi-number workspace.
- It does not reply if any stop-reply label is present.
- It does not retry on failure — if the send 5xx's, let the caller decide.
- It does not send unsolicited first-touch messages to people who haven't messaged you — for outbound, use the `whatsapp-send` skill and read the compliance notes first.
