---
name: whatsapp-delivery-check
description: |
  Given a TimelinesAI message_uid, poll GET /messages/{uid}/status_history
  and return the Sent / Delivered / Read timeline. Use after a send to
  confirm a message actually reached the recipient's device, or to answer
  "did X receive Y" questions from the user.
env:
  TIMELINES_AI_API_KEY: required
---

# WhatsApp delivery check

Check whether a previously-sent WhatsApp message was actually delivered. TimelinesAI's `POST /messages` returns a `message_uid` that is **a receipt, not a delivery confirmation** — the real delivery status comes from `GET /messages/{uid}/status_history`.

## When to use

- After a transactional send, confirm delivery before telling the user "message sent".
- Answer "did John actually receive the invoice I sent this morning?" from the human user.
- Retroactively check whether an old message was read.
- Aggregate delivery stats across many messages for response-time analytics.

## Invocation payload

```json
{
  "message_uid": "a8f9b2c1-..."
}
```

## Implementation

```bash
curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/messages/$MESSAGE_UID/status_history"
```

## Response shape

```json
{
  "status": "ok",
  "data": [
    {"status": "Sent",      "timestamp": "2026-04-12 12:28:40 +0000"},
    {"status": "Delivered", "timestamp": "2026-04-12 12:28:41 +0000"},
    {"status": "Read",      "timestamp": "2026-04-12 12:31:15 +0000"}
  ]
}
```

The `data` array is in chronological order. Each entry is a state transition.

## Interpretation

| Latest status | What it means |
|---|---|
| `Sent` | TimelinesAI accepted the send and pushed it to WhatsApp. The recipient's device has NOT confirmed delivery yet. |
| `Delivered` | The recipient's device has received the message. They haven't opened the chat yet. |
| `Read` | The recipient opened the chat (with read receipts enabled on their end). They've seen it. |

**Typical timing on an active number:** Sent → Delivered within ~1 second. Delivered → Read can take minutes or hours depending on when the recipient opens their phone. For customers with read receipts disabled, you'll never see `Read` — treat `Delivered` as the strongest signal you'll get.

## Return value

Return the full status history as structured data so the caller can decide what to do:

```json
{
  "message_uid": "a8f9b2c1-...",
  "latest_status": "Delivered",
  "latest_timestamp": "2026-04-12 12:28:41 +0000",
  "sent_at": "2026-04-12 12:28:40 +0000",
  "delivered_at": "2026-04-12 12:28:41 +0000",
  "read_at": null
}
```

For a natural-language answer to the human user:

> *"Yes — your invoice message to John was delivered at 12:28 UTC this morning, but he hasn't opened the chat yet (or has read receipts disabled)."*

## Failure modes

| Response | Meaning | What to do |
|---|---|---|
| `{"status":"error","message":"Message uid ... not found"}` | Typo in the uid, or the uid belongs to a different workspace | Don't retry; check the uid |
| `{"status":"error","message":"Not authenticated"}` | Wrong token | Check `$TIMELINES_AI_API_KEY` |
| Empty `data: []` array | Send was accepted but no state transition has landed yet | Wait a second and retry once |

## What this skill deliberately does NOT do

- Does not poll continuously — call it once per user question. For real-time delivery tracking, poll on a timer from a different process.
- Does not interpret "missing Read status" as "unread" — many users disable read receipts, which means `Read` never arrives even if they've seen the message. Only assert `Read` is positive evidence, not `not Read` as negative evidence.
- Does not correlate across workspaces — UIDs are workspace-local. If sender and recipient are in different TimelinesAI workspaces, the `message_uid` the sender got is NOT the same UID the recipient's workspace assigned. See `docs/state-persistence.md` for cross-workspace correlation patterns.
