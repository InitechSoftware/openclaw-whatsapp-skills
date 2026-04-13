# Compliance — personal WhatsApp numbers vs Business API

This document explains what you can and cannot do with the skills in this repo, why, and what the alternative is for the things you can't.

## TL;DR

- **Personal WhatsApp numbers connected to TimelinesAI** are for **inbound conversations** and **transactional / event-triggered outbound** to customers who expect the message.
- **WhatsApp Business API** is for **cold outreach, broadcasts, and promotional campaigns** to customers on an opt-in list.
- TimelinesAI **already supports** WhatsApp Business API through the product dashboard today. **Public API automation for Business API workflows is coming in Q2 2026**. Until then, Business API sends are managed through the dashboard directly, not through the public API + skills in this repo.

## What you can do with the skills in this repo

Every skill in this repo operates against a **personal WhatsApp number** connected to your TimelinesAI workspace. Under WhatsApp's current enforcement, personal numbers are safe to use for:

### Reply to inbound conversations

If a customer messaged you first, you can reply to them freely within the active session window. WhatsApp's "24-hour customer service window" is the operational boundary — within 24 hours of the customer's last message, you can send any content (text, media, templates, free-form). The `whatsapp-autoresponder` skill is designed for exactly this.

### Send transactional messages the customer expects

A customer who just completed an action with your business is expecting a confirmation. Safe sends include:

- Order confirmation (customer just checked out)
- Shipping update (customer bought something)
- Delivery notification (package arriving)
- Appointment confirmation or reminder (customer booked with you)
- Payment receipt (customer paid)
- Account status notifications (customer has an account with you)

The key test: **would the customer be surprised, annoyed, or confused to receive this?** If the answer is yes, don't send it from a personal number.

### Send event-triggered messages from other tools

This is where TimelinesAI's position as a gateway pays off — your CRM, your billing system, your scheduling tool can all trigger transactional WhatsApp messages through the public API. Examples:

- HubSpot deal hits "demo scheduled" → send the meeting link
- Stripe reports a failed payment → send a recovery note with a link to update the card
- Calendly booking created → send a pre-meeting reminder
- Pipedrive deal stage advanced → send the next-step instructions

These work because they're downstream of an action the customer took. They're not cold outreach.

### Re-engage warm leads inside the session window

If a customer started a conversation with you in the last 24 hours and went quiet, you can follow up inside that window without issue. The `scheduled-follow-ups` pattern in the capability guide is designed for this.

Outside the 24-hour window, a re-engagement send is technically a new-touch message and you're back in "requires opt-in and probably a template" territory. Don't build automated re-engagement for chats older than 24 hours on a personal number.

## What you cannot do with the skills in this repo

### Cold outreach to lists you bought or scraped

Don't do it. WhatsApp's anti-spam enforcement finds these bans personal numbers fast — often within hours of the first few sends.

### Broadcasts to your customer base without opt-in

Even if these are "your customers", if they didn't specifically consent to WhatsApp messaging from you, a broadcast will get reported and your number will get banned.

### Promotional campaigns

Sales offers, discount announcements, "new product launch", seasonal promotions — all of these belong on the Business API route, which has explicit message templates for marketing content and a different ban model.

### Anything resembling a marketing blast

If you find yourself calculating "what throughput can I get per number per minute to send 5,000 messages", you're on the wrong side of the line. Personal numbers are not a scale channel.

## The Business API alternative

**WhatsApp Business API** (sometimes called "Cloud API" or "WABA") is Meta's official API for business-to-consumer messaging at scale. It requires:

- A dedicated phone number you don't use for anything else
- Business verification with Meta
- Message templates approved in advance for outbound campaigns
- A per-message cost ($/message varies by country and category)
- Explicit customer opt-in for marketing content

In exchange, you get the ability to send broadcasts and promotional content without ban risk — provided you stay within the approved templates and respect opt-outs.

### TimelinesAI's Business API support

**TimelinesAI already supports WhatsApp Business API through the product dashboard today.** You can connect a Business API number to your TimelinesAI workspace, manage templates, run broadcasts, and watch them through the shared inbox — all through the UI.

**What's not available yet:** the public API surface (the endpoints at `app.timelines.ai/integrations/api`) doesn't expose Business API workflows. So you can't currently build an OpenClaw skill that automates Business API sends the way the skills in this repo automate personal-number sends.

**Coming in Q2 2026:** public API endpoints for Business API operations. When that ships, this repo will get a new set of skills for Business API workflows — cold outreach templates, opt-in management, broadcast batching, template rendering.

**In the meantime:** if you need to run broadcasts or cold outreach, do it through the TimelinesAI dashboard on a Business API number. Don't try to simulate it through the personal-number skills in this repo.

## How to tell which channel you need

Ask yourself these questions in order:

1. **Did the customer message me first?** → Personal number (reply skill), safe.
2. **Is the customer about to receive something they're expecting from me (order, appointment, payment, delivery)?** → Personal number (transactional send skill), safe.
3. **Is this triggered by an event the customer opted into (signup confirmation, scheduled reminder, payment failure)?** → Personal number, safe.
4. **Is this a marketing broadcast, cold outreach, or promotional campaign?** → **Business API, not this repo.** Handle through the TimelinesAI dashboard until public API support ships in Q2 2026.
5. **I'm not sure.** → Don't send. Ask a human. When in doubt, assume it's promotional and route it to the Business API path.

## What happens if you get it wrong

- **First offense:** warning from WhatsApp, possible short-term rate limiting on the number.
- **Repeat offense:** 24-hour ban of the personal number.
- **Serious abuse:** permanent ban of the number and possibly the associated Meta account.

TimelinesAI cannot protect you from this — the ban lives at WhatsApp's infrastructure layer, not at TimelinesAI's. Once the number is banned, it's banned across every platform and app that uses it, not just TimelinesAI.

**The skills in this repo will send anything you tell them to send.** The compliance check is your job, not the skill's.

## Further reading

- [WhatsApp Business Messaging Policy](https://www.whatsapp.com/legal/business-policy)
- [TimelinesAI public API reference](https://timelinesai.mintlify.app/public-api-reference/overview)
- [OpenClaw + WhatsApp capability guide](https://timelines.ai/guides/openclaw-whatsapp-skills)
