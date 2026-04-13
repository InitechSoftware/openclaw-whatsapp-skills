# whatsapp-delivery-check

Given a `message_uid` from an earlier send, fetch the Sent / Delivered / Read timeline from TimelinesAI.

## When to use

- **After a transactional send**, confirm delivery before reporting success to the user.
- **Answer "did X receive Y"** questions — "did John receive the invoice I sent this morning?"
- **Response-time analytics** — cross-reference send timestamps with delivery timestamps across a bunch of messages.

## Input

`message_uid` — a UUID returned by `whatsapp-send` (or any other send path).

## Output

```json
{
  "message_uid": "...",
  "latest_status": "Sent" | "Delivered" | "Read",
  "sent_at": "...",
  "delivered_at": "...",
  "read_at": "..."
}
```

## How it works

Single GET to `https://app.timelines.ai/integrations/api/messages/{uid}/status_history`. This endpoint **is not listed in the mintlify API reference** but has been empirically confirmed to work. Response is an array of `{status, timestamp}` entries in chronological order.

## Install

```bash
cd ~/.openclaw/workspace
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-delivery-check ~/.openclaw/skills/
```

## Read receipts caveat

Many customers disable read receipts on their end. When that happens, `Read` never appears in the status history — **even if they've seen the message**. Treat the presence of `Read` as positive evidence, but don't treat its absence as evidence of "not read". On an active connection `Delivered` is usually the strongest signal you'll get.

## Cross-workspace UIDs

If the sender and recipient are in different TimelinesAI workspaces, the `message_uid` the sender received is NOT the same as the UID the recipient's workspace assigns — they're per-workspace. You can't use a UID from one workspace to look up delivery in another. To correlate a message across workspaces, match on `(timestamp, sender_phone, text)` instead.
