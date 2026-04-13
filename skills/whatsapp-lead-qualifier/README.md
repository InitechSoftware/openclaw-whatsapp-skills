# whatsapp-lead-qualifier

Multi-turn lead qualification over WhatsApp. Asks a fixed sequence of questions, stores answers as notes, tags stages as labels. Stops when qualified or disqualified.

## When to use

- You get leads from a single channel (Facebook ads, Google Forms, website form → WhatsApp) and want to pre-qualify them before a human ever gets involved.
- You want structured data capture over WhatsApp (not just free-text conversations) without forcing the user into a separate form.
- You want the qualification state to be visible to human teammates in the same inbox.

## State pattern

Labels are the state machine, notes are the data. No external database. See [`../../docs/state-persistence.md`](../../docs/state-persistence.md) for the full explanation.

| Label | Meaning |
|---|---|
| `discovery/q1` | Waiting for answer to question 1 |
| `discovery/q2` | q1 answered, waiting for q2 |
| `discovery/q3` | q2 answered, waiting for q3 |
| `qualified` | Passed the rule. Bot is done. Human follow-up expected. |
| `disqualified` | Failed the rule. Bot is done. |
| `escalate` / `needs-human` / `pause-bot` | Hard stop — human took over. |

## Default question sequence

1. *"What are you trying to solve?"* → stored as `[LEAD] use_case=...`
2. *"How big is your team?"* → stored as `[LEAD] team_size=...`
3. *"When are you hoping to start?"* → stored as `[LEAD] timeline=...`
4. Rule: `team_size >= 5` → qualified, else disqualified.

Customize in `SKILL.md` step 3 (questions) and step 5 (rule). Everything else stays the same.

## Why notes and not an external DB

- Every state transition is an HTTP call to TimelinesAI that's already committed. Nothing in the skill process needs to survive a restart.
- Your teammates see the lead's answers inline in the chat without needing to look at a separate admin panel.
- Adding `escalate` to the chat is all a human needs to do to take over. The skill respects it on the next invocation, no special code.
- Searching for all leads with a specific answer is one GROQ-style query against the message feed.

Trade-off: ~300ms per state transition. For WhatsApp-cadence conversations (seconds to minutes between turns), that's invisible.

## Install

```bash
cd ~/.openclaw/workspace
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
ln -s $(pwd)/openclaw-whatsapp-skills/skills/whatsapp-lead-qualifier ~/.openclaw/skills/
```

Set `TIMELINES_AI_API_KEY` and `ALLOWED_SENDER_JID` in your `.env`.

## What it deliberately does NOT do

- **Does not parse answers with NLP by default.** It stores the raw incoming text as the answer. If you want structured extraction (e.g. "how big is your team" → "8" regardless of whether the user said "eight" or "we're a team of 8"), insert an OpenClaw reasoning step between receiving the text and writing the note.
- **Does not re-ask questions if the answer seems incomplete.** You get one try per stage. For retry logic, branch in step 3.
- **Does not send to anyone who hasn't messaged you first.** The skill only runs inside an active inbound conversation. For outbound initiation, see `whatsapp-send` and [compliance docs](../../docs/compliance.md).
