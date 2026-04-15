// lib/logger.js
//
// Split-pane structured logger for the test harness. In a real terminal
// you get color-coded prefixes ("persona", "agent", "error") so you can
// follow both sides of the conversation at a glance. In a serverless
// environment (Vercel) you get the same prefixes in the platform logs.

const COLORS = {
  persona: "\x1b[36m", // cyan
  agent:   "\x1b[33m", // yellow
  unknown: "\x1b[90m", // grey
  error:   "\x1b[31m", // red
  reset:   "\x1b[0m",
};

export function logEvent(role, message) {
  const color = COLORS[role] ?? COLORS.unknown;
  const ts = new Date().toISOString().slice(11, 19);
  // eslint-disable-next-line no-console
  console.log(`${color}[${ts} ${role.padEnd(7)}]${COLORS.reset} ${message}`);
}
