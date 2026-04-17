# Setup for demo@demo.nl with Prabeo AI Receptionist v2

Your tenant: **daan** (ID: `c37ecc35-3e81-4f7d-8131-69dfaa427143`)  
Telnyx App: **Prabeo AI Receptionist v2** (ID: `2930212006164169924`)

---

## Step 1: Configure .env

Add these values to your `.env` file:

```env
# Get from https://portal.telnyx.com/account/settings
TELNYX_API_KEY=KEY...your-key...
TELNYX_PUBLIC_KEY=PK...your-public-key...
TELNYX_SIP_USERNAME=your_sip_user
TELNYX_SIP_PASSWORD=your_sip_password

# Logging
LOG_LEVEL=debug

# Server
NODE_ENV=development
PORT=3000
```

---

## Step 2: Add Telnyx Number to Your Tenant

Run this SQL in Supabase (project: `prabeo-prod`):

```sql
-- Add Telnyx number to daan tenant
-- Replace YOUR_TELNYX_NUMBER with your actual phone number (e.g., +31612345678)
INSERT INTO public.telnyx_numbers (
  tenant_id,
  phone_number,
  connection_id,
  status
) VALUES (
  'c37ecc35-3e81-4f7d-8131-69dfaa427143',
  'YOUR_TELNYX_NUMBER',
  '2930212006164169924',
  'ASSIGNED'
) ON CONFLICT (phone_number) DO UPDATE SET
  tenant_id = 'c37ecc35-3e81-4f7d-8131-69dfaa427143',
  connection_id = '2930212006164169924',
  status = 'ASSIGNED',
  updated_at = NOW();

-- Verify
SELECT phone_number, connection_id, status FROM public.telnyx_numbers 
WHERE tenant_id = 'c37ecc35-3e81-4f7d-8131-69dfaa427143';
```

---

## Step 3: Set Telnyx Webhook URL

In **Telnyx Portal** (https://portal.telnyx.com):

1. Go to **Applications** → **Prabeo AI Receptionist v2**
2. Find **Voice Settings** / **Inbound Call URL**
3. Set to your server URL:
   - **Local (for testing)**: `http://localhost:3000/api/v1/telnyx/inbound`
   - **Production**: `https://yourdomain.com/api/v1/telnyx/inbound`
4. Save

For local testing with real phone calls, use **ngrok**:
```bash
ngrok http 3000
# Get URL like: https://abc123.ngrok.io
# Set Webhook URL to: https://abc123.ngrok.io/api/v1/telnyx/inbound
```

---

## Step 4: Start the Server

```bash
npm run dev
```

Expected output:
```json
{
  "level": 30,
  "time": "2026-04-17T10:30:45.123Z",
  "port": 3000,
  "nodeEnv": "development"
}
```

---

## Step 5: Make a Test Call

1. **Call your Telnyx number** from any phone
2. **Server logs** will show:
   ```json
   {
     "sessionId": "550e8400-...",
     "tenantId": "c37ecc35-3e81-4f7d-8131-69dfaa427143",
     "message": "Call session created"
   }
   ```
3. **Speak to the AI** - it will respond

---

## Step 6: Verify Logging

### In Server Terminal

You should see these events:

```json
{
  "level": 30,
  "sessionId": "...",
  "correlationId": "...",
  "message": "Call session created"
}

{
  "level": 30,
  "sessionId": "...",
  "message": "WebSocket media stream connected"
}

{
  "level": 30,
  "sessionId": "...",
  "message": "Sent audio chunk to Gemini"
}

{
  "level": 30,
  "sessionId": "...",
  "message": "Received media frame from Telnyx"
}

{
  "level": 30,
  "sessionId": "...",
  "message": "Media stream stopped"
}
```

### In Supabase

Query the call logs:

```sql
-- See all calls
SELECT id, created_at, status FROM public.call_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- See detailed trace for a specific call
SELECT step_type, content, created_at FROM public.call_traces 
WHERE call_log_id = 'YOUR_SESSION_ID'
ORDER BY created_at ASC;
```

Expected trace steps:
- `SESSION_INIT` — Call started
- `USER_SPEECH` — User audio captured
- `AI_SPEECH` — AI response generated
- `TOOL_CALL` — (if AI used tools like checking availability)
- `TOOL_RESULT` — Tool result returned

---

## Quick Checklist

- [ ] `.env` file configured with Telnyx credentials
- [ ] Telnyx number added to daan tenant in Supabase
- [ ] Telnyx webhook URL set (local or production)
- [ ] Server running: `npm run dev`
- [ ] Health check passes: `curl http://localhost:3000/health/liveness`
- [ ] Call your Telnyx number
- [ ] Check server logs for `"Call session created"`
- [ ] Check Supabase for new entries in `call_logs` and `call_traces`

---

## Tenant Information

| Field | Value |
|-------|-------|
| Tenant Name | daan |
| Tenant ID | `c37ecc35-3e81-4f7d-8131-69dfaa427143` |
| Email | demo@demo.nl |
| Telnyx App | Prabeo AI Receptionist v2 |
| App ID | `2930212006164169924` |
| Supabase Project | `prabeo-prod` |
| Project Ref | `ollrwbogmvmydgrmcnhn` |

---

## Troubleshooting

### "Phone number not found in telnyx_numbers"
- Make sure you added the number to Supabase with the correct tenant_id
- Query: `SELECT * FROM telnyx_numbers WHERE tenant_id = 'c37ecc35-3e81-4f7d-8131-69dfaa427143';`

### "Gemini connection failed"
- Check `GEMINI_API_KEY` in `.env`
- Verify it has access to `gemini-2.4-flash-live` model

### "No logs appearing"
- Set `LOG_LEVEL=debug` in `.env`
- Restart server

### "Webhook not being called"
- Verify webhook URL is correct in Telnyx portal
- For local testing, use ngrok: `ngrok http 3000`
- Check Telnyx webhook logs in the portal

---

## You're Ready!

Call your Telnyx number and all events will be logged to:
1. **Server console** (real-time logs)
2. **Supabase `call_logs` table** (call metadata)
3. **Supabase `call_traces` table** (detailed audit trail)

🎉 Start with `npm run dev` and make a call!
