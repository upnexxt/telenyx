# Test Call Guide - Telenyx AI Receptionist

This guide shows you how to test incoming calls and verify logging.

---

## Option 1: Simulate an Incoming Call (Local Testing)

You can test without a real Telnyx number by simulating a webhook call.

### Step 1: Start the server

```bash
npm run dev
```

You should see:
```
{
  "level": 30,
  "time": "2026-04-17T...",
  "port": 3000,
  "nodeEnv": "development"
}
```

### Step 2: Trigger a test call in another terminal

```bash
# Simulate Telnyx webhook POST
curl -X POST http://localhost:3000/api/v1/telnyx/inbound \
  -H "Content-Type: application/json" \
  -H "telnyx-signature-ed25519: PLACEHOLDER_SIGNATURE" \
  -H "telnyx-timestamp: $(date +%s)" \
  -d '{
    "event_type": "call.initiated",
    "payload": {
      "call_control_id": "test-call-12345",
      "from": "+1234567890",
      "to": "+1555-AI-AGENT"
    }
  }'
```

**Note:** This will fail signature verification (expected). Real calls use valid Ed25519 signatures from Telnyx.

### Step 3: Check logs

Look in the server terminal for:

```
sessionCreated: {
  correlationId: "...",
  sessionId: "...",
  tenantId: "...",
  callControlId: "test-call-12345"
}
```

---

## Option 2: Real Telnyx Phone Number (Production Testing)

To receive actual phone calls:

### 1. Get a Telnyx Phone Number

- Go to: https://portal.telnyx.com/phone-numbers
- Buy or rent a number
- Copy the number (e.g., +1-555-AI-AGENT)

### 2. Set Up Webhook URL

- In Telnyx portal, go to: **Inbound Call Control Settings**
- **Webhook URL**: `https://your-domain.com/api/v1/telnyx/inbound`
  - Use ngrok to expose localhost: `ngrok http 3000`
  - Your public URL: `https://abc123.ngrok.io`
- **Webhook Method**: POST
- Save settings

### 3. Deploy to Production

```bash
# Build
npm run build

# Run production version
npm start
```

### 4. Make a Test Call

- Call your Telnyx number from any phone
- You should hear: "Connecting to AI..."
- The server logs should show the call flowing through the system

---

## Verify Logging

### Log Levels

Change `LOG_LEVEL` in `.env`:
- `debug` — Most verbose (trace every function)
- `info` — General events (calls, traces)
- `warn` — Warnings (timeouts, retries)
- `error` — Errors only

### Expected Log Output for a Call

```json
{
  "level": 30,
  "time": "2026-04-17T10:30:45.123Z",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-123",
  "callControlId": "call-xyz",
  "message": "Call session created"
}

{
  "level": 30,
  "time": "2026-04-17T10:30:46.456Z",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "WebSocket media stream connected"
}

{
  "level": 30,
  "time": "2026-04-17T10:30:47.789Z",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Received media frame from Telnyx",
  "payloadLength": 320
}

{
  "level": 30,
  "time": "2026-04-17T10:30:48.200Z",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Sent audio chunk to Gemini",
  "chunkSize": 320
}
```

### Health Endpoints

```bash
# Liveness check (server is running)
curl http://localhost:3000/health/liveness

# Readiness check (can accept calls)
curl http://localhost:3000/health/readiness

# System metrics
curl http://localhost:3000/metrics
```

---

## Trace Logging (Call Audit Trail)

Every step of the call is logged to Supabase `call_traces` table:

```sql
SELECT * FROM call_traces 
WHERE call_log_id = 'YOUR_SESSION_ID'
ORDER BY created_at ASC;
```

You should see:
1. `SESSION_INIT` — Call session created
2. `USER_SPEECH` — User audio received
3. `AI_SPEECH` — AI response generated
4. `TOOL_CALL` — AI called a tool (e.g., check_availability)
5. `TOOL_RESULT` — Tool result returned
6. (cycle repeats until call ends)

---

## Troubleshooting

### Server won't start

```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill the process (Windows)
taskkill /PID <PID> /F

# Or use a different port
PORT=3001 npm run dev
```

### No logs appearing

```bash
# Verify LOG_LEVEL in .env
echo LOG_LEVEL=debug >> .env

# Restart server
npm run dev
```

### Signature verification fails

This is normal for test calls. Real calls from Telnyx include a valid Ed25519 signature.

### Gemini connection fails

```
Error: Max retries (5) exceeded for Gemini connection
```

Check:
- [ ] `GEMINI_API_KEY` is valid in `.env`
- [ ] API key has access to `gemini-2.4-flash-live` model
- [ ] Internet connection is working

### No audio from AI

```
Error processing inbound audio
```

Check:
- [ ] Supabase connection is working
- [ ] `tenant_settings` table exists
- [ ] Your tenant has `ai_voice` configured (default: 'Aoede')

---

## Next Steps

1. ✅ Start server: `npm run dev`
2. ✅ Verify health: `curl http://localhost:3000/health/liveness`
3. ✅ Make test call (real or simulated)
4. ✅ Check logs for flow
5. ✅ Query Supabase for trace audit trail

You're ready to handle real calls! 🎉
