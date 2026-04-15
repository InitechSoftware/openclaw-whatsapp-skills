#!/usr/bin/env node
// scripts/start-scenario.js
//
// Kicks off the lead-qualifier scenario by sending the first customer
// turn from the persona number to the agent-under-test number. After
// this runs, the normal webhook flow takes over and the scenario
// advances as the agent replies.
//
// Usage:
//   cd examples/test-harness
//   cp .env.example .env && $EDITOR .env
//   source .env   # or use dotenv — this script reads process.env
//   node scripts/start-scenario.js

import { startScenario } from "../scenarios/lead-qualifier.js";
import { logEvent } from "../lib/logger.js";

async function main() {
  const required = [
    "TIMELINES_AI_API_KEY",
    "PERSONA_PHONE",
    "AGENT_UNDER_TEST_PHONE",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    logEvent("error", `missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  try {
    await startScenario();
    logEvent("persona", "scenario kicked off — watch the webhook logs");
  } catch (err) {
    logEvent("error", err.message);
    process.exit(1);
  }
}

main();
