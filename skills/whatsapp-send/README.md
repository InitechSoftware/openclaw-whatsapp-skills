# whatsapp-send

Send one WhatsApp message via the TimelinesAI public API. Two modes: by phone number (new recipient, creates a chat) or by chat id (existing conversation).

## When to use

**Transactional sends your agent initiates on behalf of an event:**

- Order confirmation, shipping update, delivery notification
- Appointment reminder or booking confirmation
- Payment receipt
- Event-triggered notifications from another tool (HubSpot → demo link, Stripe → failed payment recovery, Calendly → meeting reminder)
- Sending a file the customer asked for (quote PDF, invoice, contract)

**Transactional replies inside active conversations:**

- When you already have the `chat_id` from a webhook and want to send a follow-up programmatically

## When NOT to use

- Cold outreach. WhatsApp bans personal numbers for this. Use the Business API instead.
- Broadcasts to customers who haven't opted in.
- Promotional campaigns.

Full compliance writeup: [`../../docs/compliance.md`](../../docs/compliance.md).

## Install

```bash
cd ~/.openclaw/workspace
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-send ~/.openclaw/skills/
```

## Modes

| Mode | Use when | How |
|---|---|---|
| `phone` | New recipient, or you don't know the chat id | `POST /messages` with `{phone, text}` |
| `chat` | Existing chat, you have the id | `POST /chats/{id}/messages` with `{text}` |

In phone mode, TimelinesAI creates a new chat if one doesn't exist.

## Sender identity

In **phone mode**, TimelinesAI picks the sender from your connected numbers (workspace default in multi-number setups). In **chat mode**, the sender is whatever number owns the chat (`whatsapp_account_id`) — you can't override it.

If you need deterministic sender control in a multi-number workspace, use chat mode with a chat you know the ownership of. See [`../../docs/multi-number.md`](../../docs/multi-number.md).

## Environment

- `TIMELINES_AI_API_KEY` — Bearer token, required.
- `ALLOWED_SENDER_JID` — optional. If set, the skill refuses to send into a chat owned by any other JID. Use this to guardrail against persona leaks in multi-number workspaces.

## UTF-8 safety

Every payload is written to a file with `ensure_ascii=False` and read with `curl --data-binary @file`. This is the only reliable way to send text containing em-dashes, smart quotes, emoji, or any non-ASCII UTF-8 through bash without corruption.

**Never** use `curl -d "..."` with arbitrary text — shell encoding will break it.
