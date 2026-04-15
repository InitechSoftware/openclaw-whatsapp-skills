// scenarios/lead-qualifier.js
//
// Four-turn lead-qualifier scenario. The persona ("customer") plays the
// role of an inbound lead reaching out about rolling out a tool across
// a 25-person team in Q3. The agent-under-test runs the real
// whatsapp-lead-qualifier skill from this repo.
//
// Flow:
//   1. persona: "hi I saw your ad"                     → stage discovery/q1
//   2. agent asks q1 "what are you trying to solve"
//      persona: "we want to reduce customer churn"     → stage discovery/q2
//   3. agent asks q2 "how big is your team"
//      persona: "we are 25 people"                     → stage discovery/q3
//   4. agent asks q3 "when are you looking to roll out"
//      persona: "we need to roll out in Q3"            → stage qualified
//
// The persona is scripted: it doesn't reason about the agent's reply, it
// just advances to the next line when the agent says ANYTHING. For
// harder scenarios you'd inspect the agent reply text. For this first
// example we keep it dumb and observable.
//
// Real human intervention: open the TimelinesAI dashboard in a browser
// tab and watch the chat between your persona number and your agent
// number. You can manually send a message from the agent's inbox to
// steer the scenario, add labels, or write notes — the harness only
// cares about webhook events that arrive via `message:received:new`.

import { tlPost } from "../lib/tl.js";
import { logEvent } from "../lib/logger.js";

// Ordered script: what the persona says next, keyed by current stage.
const PERSONA_SCRIPT = [
  { stage: "start",         text: "hi I saw your ad" },
  { stage: "discovery/q1",  text: "we want to reduce customer churn" },
  { stage: "discovery/q2",  text: "we are 25 people" },
  { stage: "discovery/q3",  text: "we need to roll out in Q3" },
];

// In-memory position per chat. For a harness running locally this is
// fine. If you redeploy the receiver, the scenario resets.
const personaPosition = new Map();

/**
 * Called when the agent-under-test receives a message (the customer spoke).
 * This is where your real whatsapp-lead-qualifier skill would normally
 * live. For harness purposes we log and let the skill run normally.
 *
 * In practice, you'd either:
 *   (a) symlink the real skill into this harness and invoke it here, OR
 *   (b) deploy your real OpenClaw host and let this function forward
 *       the webhook payload there (the same pattern as the production
 *       vercel-webhook-receiver example).
 *
 * For the harness example we just log — the reader wires their own skill.
 */
export async function handleAgentTurn({ chatId, incomingText, accountJid }) {
  logEvent("agent", `received chat=${chatId} "${incomingText.slice(0, 60)}"`);
  // Reader plugs their agent skill invocation here. The skill will post
  // its reply via POST /chats/{id}/messages, which TimelinesAI will then
  // deliver to the persona's number as another webhook — that webhook
  // triggers advancePersona() below.
}

/**
 * Called when the persona side receives a message (the agent just replied).
 * Advances the scripted customer through the next turn.
 */
export async function advancePersona({ chatId, agentReply, accountJid }) {
  logEvent("persona", `agent replied: "${agentReply.slice(0, 60)}"`);

  const idx = (personaPosition.get(chatId) ?? 0) + 1;
  personaPosition.set(chatId, idx);

  if (idx >= PERSONA_SCRIPT.length) {
    logEvent("persona", `chat=${chatId} — script complete, standing down`);
    return;
  }

  const next = PERSONA_SCRIPT[idx];
  logEvent("persona", `chat=${chatId} stage=${next.stage} sending "${next.text}"`);

  // Send the next customer turn. The persona's WhatsApp number is
  // connected to TimelinesAI too, so we send FROM it via POST /messages
  // using the agent-under-test's phone number as the recipient.
  await tlPost("/messages", {
    phone: process.env.AGENT_UNDER_TEST_PHONE,
    text: next.text,
  });
}

/**
 * Kick off the first turn. Call this once from a local script to start
 * the scenario after you've registered the webhook.
 */
export async function startScenario() {
  const first = PERSONA_SCRIPT[0];
  logEvent("persona", `starting scenario: "${first.text}"`);
  await tlPost("/messages", {
    phone: process.env.AGENT_UNDER_TEST_PHONE,
    text: first.text,
  });
}
