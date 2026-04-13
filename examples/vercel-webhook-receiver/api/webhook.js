// api/webhook.js
//
// TimelinesAI → OpenClaw webhook receiver.
//
// Deploy to Vercel with `vercel deploy --prod`, then register the deployed URL
// (with ?secret=<WEBHOOK_SECRET>) via `POST /webhooks` on your TimelinesAI
// workspace. When a customer messages your WhatsApp number, TimelinesAI will
// POST here; this function acks fast and forwards the event to your OpenClaw
// host for skill invocation.
//
// Environment variables (set in Vercel project settings):
//   OPENCLAW_HOOK_URL    — HTTPS URL on your OpenClaw host that accepts
//                          {chat_id, text, sender_phone, sender_name,
//                           message_uid, allowed_sender_jid}
//   WEBHOOK_SECRET       — random token appended as ?secret=... to the webhook
//                          URL. Minimal auth defense — rotate if leaked.
//   ALLOWED_SENDER_JID   — JID like "15550100@s.whatsapp.net" that your skills
//                          are allowed to send from. Passed through so the
//                          skill can guardrail against persona leaks.

export default async function handler(req, res) {
  // Path-segment auth: register the webhook as /api/webhook?secret=<token>
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(404).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const { event_type, data } = req.body || {};

  // Ack events we don't handle so TimelinesAI doesn't retry them.
  // Return 200, not 4xx — TimelinesAI retries on anything that isn't 2xx.
  if (event_type !== "message:received:new") {
    return res.status(200).json({ ok: true, ignored: event_type });
  }

  // Ignore sends made by your own agent (echo). TimelinesAI fires
  // `message:received:new` for every inbound including ones your own account
  // syncs from another WhatsApp client — so filter on `from_me` if present.
  if (data && data.from_me === true) {
    return res.status(200).json({ ok: true, ignored: "from_me" });
  }

  // Ack TimelinesAI FAST. The retry policy is 3 attempts with a 5-second
  // timeout per attempt — if your receiver takes longer than 5s, you'll get
  // duplicate deliveries. Do the slow work AFTER sending the response.
  res.status(200).json({ ok: true });

  // Forward to the OpenClaw host. Fire-and-forget after res.status(200).
  // For production-grade durability, replace this inline fetch with a push
  // to QStash / Inngest / a database queue your agent drains separately —
  // if OPENCLAW_HOOK_URL is down when the webhook fires, the event is lost.
  try {
    await fetch(process.env.OPENCLAW_HOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.chat_id,
        text: data.text,
        sender_phone: data.sender_phone,
        sender_name: data.sender_name,
        message_uid: data.message_uid,
        allowed_sender_jid: process.env.ALLOWED_SENDER_JID,
      }),
    });
  } catch (err) {
    console.error("[timelinesai-webhook] agent handoff failed:", err);
  }
}
