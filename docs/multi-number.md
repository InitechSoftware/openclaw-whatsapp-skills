# Multi-number workspaces — how to pin sender identity

If your TimelinesAI workspace has more than one WhatsApp number connected, your OpenClaw skill has to make sure it sends from the intended one. This document explains the problem, the mechanism, and the pattern the skills in this repo use to guardrail against persona leaks.

## The problem

Workspaces can connect multiple WhatsApp numbers. Your support team might have a support number (`+1 555 0100`), your sales team has a sales number (`+1 555 0200`), a regional team has an EU number (`+44 20 7000 0300`). All three numbers live in the same workspace, share the same API token, and appear side-by-side in the TimelinesAI inbox.

If your skill calls `POST /chats/{id}/messages` without thinking about which number will actually send, it's choosing at random. Worst case, your sales bot replies from the support number's persona — and a customer expecting a support answer gets a sales pitch, or vice versa. This is almost impossible to explain afterwards, and it looks terrible.

## How TimelinesAI decides the sender

Every chat record in TimelinesAI has a field called `whatsapp_account_id` containing the full JID (WhatsApp account ID) of the number that owns the chat. A JID looks like:

```
15550100@s.whatsapp.net
```

The number before the `@` is the phone number without the `+` or any formatting characters. The suffix `@s.whatsapp.net` identifies it as a one-to-one chat (group chats use `@g.us`).

**When you call `POST /chats/{id}/messages`, TimelinesAI always sends from the JID stored in the chat's `whatsapp_account_id`.** You can't override it. The chat's ownership is pinned at creation time and persists for the life of the chat.

This is actually good news — it means the sender is deterministic. You just have to check ownership before you send.

## The pattern

Every skill in this repo that can send follows this pattern:

### 1. Hard-code the allowed sender JID in the skill's environment

```bash
# in your .env or your OpenClaw workspace env
ALLOWED_SENDER_JID=15550100@s.whatsapp.net
```

This is the JID your skill is allowed to speak as. For a support bot, it's the support number's JID. For a sales bot, it's the sales number's JID. **One skill, one allowed JID.** If you want a bot that covers multiple personas, run multiple instances with different JIDs.

### 2. Enumerate numbers once to find the right JID

When you first set this up, list your connected numbers:

```bash
curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  https://app.timelines.ai/integrations/api/whatsapp_accounts
```

Response:

```json
{
  "status": "ok",
  "data": {
    "whatsapp_accounts": [
      {
        "id": "15550100@s.whatsapp.net",
        "phone": "+15550100",
        "status": "active",
        "owner_name": "Support Team",
        "account_name": "Support"
      },
      {
        "id": "15550200@s.whatsapp.net",
        "phone": "+15550200",
        "status": "active",
        "owner_name": "Sales Team",
        "account_name": "Sales"
      }
    ]
  }
}
```

Copy the `id` field of the number you want the skill to use into `ALLOWED_SENDER_JID`.

### 3. Verify ownership before every send

Inside the skill, before calling any endpoint that sends a message:

```bash
CHAT_JID=$(curl -sS -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  "https://app.timelines.ai/integrations/api/chats/$CHAT_ID" \
  | jq -r '.data.whatsapp_account_id')

if [ "$CHAT_JID" != "$ALLOWED_SENDER_JID" ]; then
    echo "chat $CHAT_ID owned by $CHAT_JID, not $ALLOWED_SENDER_JID — refusing to send"
    exit 0
fi
```

If the JIDs don't match, the skill exits silently without sending. Either a human teammate already routed the chat to the other number, or the chat was created under a different number, or something else is going on — whatever it is, the skill shouldn't override the chat's ownership by trying to send anyway.

### 4. Single-number workspaces skip this check

If `ALLOWED_SENDER_JID` is empty or unset, the check is skipped. Single-number workspaces have unambiguous sender selection — there's only one number, it's always the sender — so the guardrail isn't necessary.

## Cost

Two extra HTTP calls per turn: one to fetch `/whatsapp_accounts` (usually cached at setup time, not per send) and one to `GET /chats/{id}` to read `whatsapp_account_id`. Each call is ~100-200ms against the TimelinesAI API. Total extra latency per send: ~200-400ms on top of the actual send.

For customer-facing WhatsApp conversations this is invisible — customers expect seconds-to-minutes reply times, not sub-second.

## What if the workspace has only one number today but more tomorrow?

Set `ALLOWED_SENDER_JID` anyway, even if you only have one number. When you add a second number later, the skill will already be doing the check, and you won't get a surprise persona leak the day you connect the new number.

## What about new chats — how does ownership get assigned?

When a customer first messages you, TimelinesAI creates the chat under whichever number received the message. That becomes the chat's `whatsapp_account_id` for the life of the chat.

When you use `POST /messages` (phone mode, no existing chat), TimelinesAI creates the chat under a default number. In single-number workspaces this is unambiguous; in multi-number workspaces, the default is whatever TimelinesAI picks. **For deterministic sender control in multi-number outbound, use chat-id mode** with a chat you already know the ownership of — or open a new chat through the dashboard first, then use its id.

## Worked example — routing customers to EU / US numbers

```
Workspace has:
  - +1 555 0100 (US support)  → 15550100@s.whatsapp.net
  - +44 20 7000 0300 (EU support) → 442070000300@s.whatsapp.net

Incoming chat from a UK customer:
  - TimelinesAI routes the inbound to +44 20 7000 0300 (based on how the
    customer addressed the number — they messaged the UK number).
  - The chat's whatsapp_account_id is "442070000300@s.whatsapp.net".

Your EU bot is running with ALLOWED_SENDER_JID=442070000300@s.whatsapp.net.
  - It sees the webhook, reads the chat, verifies ownership matches, sends.

Your US bot is also running with ALLOWED_SENDER_JID=15550100@s.whatsapp.net.
  - It also sees the webhook (same workspace, same webhook endpoint).
  - It reads the chat, sees ownership doesn't match its ALLOWED JID, exits.

Only one bot replies. No persona leak.
```

The two bots don't need to know about each other — each one just checks ownership against its own allowed JID and gets out of the way when the chat isn't theirs.
