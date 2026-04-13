# Vercel webhook receiver

A minimal serverless function that accepts TimelinesAI `message:received:new` webhook events and forwards them to your OpenClaw host for skill invocation.

~60 lines including comments. Deploy in two minutes.

## What it does

1. Receives `POST /api/webhook?secret=<token>` from TimelinesAI
2. Checks the `?secret=` path segment matches `WEBHOOK_SECRET`
3. Filters out non-inbound events (ack them with 200, don't retry)
4. **Acks 200 immediately** (TimelinesAI retries if you take longer than 5s)
5. After the ack, fires a fetch to your OpenClaw host with the relevant payload fields

## Deploy

```bash
# 1. Clone this repo and cd into the receiver
git clone https://github.com/InitechSoftware/openclaw-whatsapp-skills.git
cd openclaw-whatsapp-skills/examples/vercel-webhook-receiver

# 2. Generate a random webhook secret
export WEBHOOK_SECRET=$(openssl rand -hex 16)
echo "Your webhook secret (save this): $WEBHOOK_SECRET"

# 3. Deploy to Vercel
vercel deploy --prod
# First run will ask you to link to a Vercel project — accept the defaults or
# create a new one. Note the production URL printed at the end.

# 4. Set environment variables on the Vercel project
vercel env add OPENCLAW_HOOK_URL production    # your OpenClaw host URL
vercel env add WEBHOOK_SECRET production       # paste the secret from step 2
vercel env add ALLOWED_SENDER_JID production   # e.g. 15550100@s.whatsapp.net

# 5. Redeploy so the new env vars take effect
vercel deploy --prod
```

## Register the webhook with TimelinesAI

```bash
WEBHOOK_URL="https://your-project.vercel.app/api/webhook?secret=${WEBHOOK_SECRET}"

curl -sS -X POST \
  -H "Authorization: Bearer $TIMELINES_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"message:received:new\",\"url\":\"${WEBHOOK_URL}\",\"enabled\":true}" \
  https://app.timelines.ai/integrations/api/webhooks
```

You should get back a `{"status":"ok","data":{"id":NNN,...}}`. Your receiver is now wired.

## Test it

Send a WhatsApp message TO your TimelinesAI-connected number from another phone. Watch:

```bash
# Vercel logs
vercel logs

# OpenClaw host logs (depends on your host setup)
```

You should see the receiver get hit within a second of the message arriving, and your OpenClaw host receive the forwarded payload a moment after.

## Durability

The receiver does a fire-and-forget `fetch()` to `OPENCLAW_HOOK_URL` after sending the 200 response. **If your OpenClaw host is down at the moment the webhook fires, the event is silently lost** — TimelinesAI already got its 2xx.

For production-grade durability, replace the inline fetch with a push to a queue your agent drains separately:

```javascript
// Instead of `await fetch(OPENCLAW_HOOK_URL, ...)`:
await fetch("https://qstash.upstash.io/v2/publish/" + encodeURIComponent(OPENCLAW_HOOK_URL), {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.QSTASH_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});
```

Any durable queue works — QStash, Inngest, AWS SQS, Cloudflare Queues. The key property is that the queue holds the event until your agent host comes back online and drains it.

## Why path-segment auth, not a signed header?

TimelinesAI doesn't currently publish a webhook signature verification scheme. The path secret (`?secret=<token>`) is minimum-viable defense against unauthenticated POSTs — anyone hitting your endpoint without the secret gets a 404. Rotate the secret if you suspect it's leaked.

If TimelinesAI publishes a signature scheme in the future, swap this for proper HMAC verification.
