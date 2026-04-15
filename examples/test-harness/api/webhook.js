// api/webhook.js
//
// Test harness receiver for the two-number OpenClaw pattern.
//
// Two WhatsApp numbers are connected to the same TimelinesAI workspace:
// - PERSONA_JID          — a simulated customer ("+1 555 0100")
// - AGENT_UNDER_TEST_JID — your real agent stack ("+1 555 0200")
//
// Both numbers send `message:received:new` webhooks to this receiver.
// The receiver reads `data.whatsapp_account_id` (the JID of the TimelinesAI
// account that OWNS the chat — not the sender) and routes the event to
// whichever side the reader wants to drive for that chat.
//
// Env vars (set in Vercel project settings or `vercel dev` .env):
//   WEBHOOK_SECRET          — random token appended as ?secret=... to the URL
//   TIMELINES_AI_API_KEY    — Bearer token for POST /messages etc.
//   PERSONA_JID             — JID of the "customer" number, e.g. 15550100@s.whatsapp.net
//   AGENT_UNDER_TEST_JID    — JID of the "agent" number, e.g. 15550200@s.whatsapp.net
//   PERSONA_PHONE           — E.164 phone of the customer, e.g. +15550100
//   AGENT_UNDER_TEST_PHONE  — E.164 phone of the agent, e.g. +15550200

import { handleAgentTurn, advancePersona } from "../scenarios/lead-qualifier.js";
import { logEvent } from "../lib/logger.js";

export default async function handler(req, res) {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(404).end();
  }
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { event_type, data } = req.body || {};
  if (event_type !== "message:received:new") {
    return res.status(200).json({ ignored: event_type });
  }

  // Drop echoes of your own sends re-ingesting as "received".
  if (data && data.from_me === true) {
    return res.status(200).json({ ignored: "from_me" });
  }

  // Flat-vs-nested payload fallback — see Things-to-know in the guide.
  const accountJid =
    data.whatsapp_account_id ?? data.chat?.whatsapp_account_id;
  const chatId = data.chat_id ?? data.chat?.id;
  const text = data.text ?? "";

  // Ack FAST — TimelinesAI retries 3x with a 5s timeout per attempt.
  res.status(200).json({ ok: true });

  // Route by JID. The message was received BY the WhatsApp account whose JID
  // is `accountJid`. If that's the agent's number, the sender was the
  // customer — run the agent-under-test skill. If it's the customer's
  // number, the sender was the agent — run the persona, which will fire
  // the next scripted customer turn.
  try {
    if (accountJid === process.env.AGENT_UNDER_TEST_JID) {
      logEvent("agent", `inbound chat=${chatId} text=${text.slice(0, 80)}`);
      await handleAgentTurn({
        chatId,
        incomingText: text,
        accountJid,
      });
    } else if (accountJid === process.env.PERSONA_JID) {
      logEvent("persona", `inbound chat=${chatId} text=${text.slice(0, 80)}`);
      // Persona side is reactive: when the agent's reply lands here,
      // the scenario script decides the next customer turn based on
      // which question was just answered. See scenarios/lead-qualifier.js.
      await advancePersona({
        chatId,
        agentReply: text,
        accountJid,
      });
    } else {
      logEvent("unknown", `jid=${accountJid} chat=${chatId} — not in harness`);
    }
  } catch (err) {
    logEvent("error", `handler failed: ${err.message}`);
    console.error("[test-harness] handler failed:", err);
  }
}
