# Setup Demo Tenant - demo@demo.nl

Configure the system for real incoming calls with your Telnyx app.

---

## Step 1: Create Supabase Tenant

Run this SQL in your Supabase SQL Editor (https://app.supabase.com → SQL Editor):

```sql
-- Create tenant for demo@demo.nl
INSERT INTO tenant_settings (
  tenant_id,
  ai_name,
  ai_voice,
  ai_language,
  ai_tone,
  ai_temperature,
  business_name,
  custom_instructions
) VALUES (
  'demo-tenant-001',
  'Prabeo',
  'Aoede',
  'Nederlands',
  'professioneel en vriendelijk',
  0.7,
  'Prabeo AI Receptionist',
  'Je bent Prabeo, de AI receptioniste voor Prabeo AI Receptionist v2. Spreek altijd kort, bondig en natuurlijk.'
) ON CONFLICT (tenant_id) DO UPDATE SET
  ai_name = 'Prabeo',
  business_name = 'Prabeo AI Receptionist',
  updated_at = NOW();

-- Link Telnyx phone number to tenant
-- Replace +YOUR_TELNYX_NUMBER with your actual phone number
INSERT INTO telnyx_numbers (
  tenant_id,
  phone_number,
  telnyx_number_id,
  status
) VALUES (
  'demo-tenant-001',
  '+YOUR_TELNYX_NUMBER',
  '2930212006164169924',
  'AVAILABLE'
) ON CONFLICT (phone_number) DO UPDATE SET
  tenant_id = 'demo-tenant-001',
  telnyx_number_id = '2930212006164169924',
  status = 'AVAILABLE',
  updated_at = NOW();

-- Create billing record
INSERT INTO tenant_billing_stats (
  tenant_id,
  included_minutes,
  used_minutes
) VALUES (
  'demo-tenant-001',
  1000,
  0
) ON CONFLICT (tenant_id) DO UPDATE SET
  included_minutes = 1000,
  updated_at = NOW();

-- Verify
SELECT * FROM tenant_settings WHERE tenant_id = 'demo-tenant-001';
SELECT * FROM telnyx_numbers WHERE tenant_id = 'demo-tenant-001';
```

---

## Step 2: Get Your Telnyx Phone Number

1. Go to: https://portal.telnyx.com/phone-numbers
2. Find your phone number in the list
3. Copy it (format: `+1234567890`)
4. Replace `+YOUR_TELNYX_NUMBER` in the SQL above with your actual number

---

## Step 3: Configure Telnyx Webhook

Your app ID: `2930212006164169924`

**Set webhook URL in Telnyx portal:**

1. Go to: https://portal.telnyx.com/app
2. Select **Prabeo AI Receptionist v2** app
3. Go to **Voice** settings
4. Set **Inbound Call URL**: 
   - **Local testing**: `http://localhost:3000/api/v1/telnyx/inbound`
   - **Production**: `https://yourdomain.com/api/v1/telnyx/inbound`
5. Set **Webhook Method**: POST
6. Save

---

## Step 4: Configure .env

Update your `.env` file with these values (get from https://portal.telnyx.com/account/settings):

```env
# Telnyx
TELNYX_API_KEY=KEY...your-api-key...
TELNYX_PUBLIC_KEY=PK...your-public-key...
TELNYX_SIP_USERNAME=your_sip_user
TELNYX_SIP_PASSWORD=your_sip_password

# Logging
LOG_LEVEL=debug
```

---

## Step 5: Start the Server

```bash
npm run dev
```

Expected output:
```
{
  "level": 30,
  "time": "2026-04-17T...",
  "port": 3000,
  "nodeEnv": "development"
}

Event loop monitor started
```

---

## Step 6: Make a Test Call

1. **Call your Telnyx number** from any phone
2. **Wait for AI to respond** (should hear "Welkom bij Prabeo")
3. **Speak to the AI** - it will listen and respond
4. **Check the logs** for call flow

---

## Verify Logging

### In Your Server Terminal

Look for these log entries:

```json
{
  "level": 30,
  "sessionId": "550e8400-...",
  "tenantId": "demo-tenant-001",
  "callControlId": "v3-...",
  "message": "Call session created"
}

{
  "level": 30,
  "sessionId": "550e8400-...",
  "message": "WebSocket media stream connected"
}

{
  "level": 30,
  "sessionId": "550e8400-...",
  "message": "Sent audio chunk to Gemini"
}

{
  "level": 30,
  "sessionId": "550e8400-...",
  "message": "Media stream stopped"
}
```

### In Supabase

Query the call logs:

```sql
SELECT * FROM call_logs 
WHERE tenant_id = 'demo-tenant-001' 
ORDER BY created_at DESC 
LIMIT 1;
```

Query the call traces (full audit trail):

```sql
SELECT step_type, content, created_at FROM call_traces 
WHERE tenant_id = 'demo-tenant-001' 
ORDER BY created_at ASC;
```

You should see:
- `SESSION_INIT` — Call started
- `USER_SPEECH` — User audio received
- `AI_SPEECH` — AI response
- (repeats until call ends)

---

## Local Testing with ngrok

If you want to test locally with real Telnyx calls:

```bash
# Install ngrok from: https://ngrok.com/download

# In one terminal, start your app
npm run dev

# In another terminal, start ngrok tunnel
ngrok http 3000

# You'll see:
# Forwarding  https://abc123.ngrok.io -> http://localhost:3000

# Update Telnyx webhook to:
# https://abc123.ngrok.io/api/v1/telnyx/inbound

# Now call your Telnyx number!
```

---

## Call Flow

```
1. You call your Telnyx number
                    ↓
2. Telnyx sends webhook to your server
   POST /api/v1/telnyx/inbound
                    ↓
3. Server creates call session (logged)
                    ↓
4. Server returns TeXML with WebSocket URL
                    ↓
5. Telnyx connects media stream (WebSocket)
   ws://your-server/media?sessionId=xxx&tenantId=demo-tenant-001
                    ↓
6. Server initializes Gemini connection
                    ↓
7. User audio → DSP → Gemini → Response
                    ↓
8. Each step logged to call_traces table
                    ↓
9. Call ends → call_logs finalized
```

---

## Troubleshooting

### "Cannot find tenant by phone number"
- Verify phone number in `telnyx_numbers` table matches what Telnyx is calling
- Query: `SELECT * FROM telnyx_numbers;`

### "Gemini connection failed"
- Check `GEMINI_API_KEY` in `.env` is valid
- Verify API key has access to `gemini-2.4-flash-live` model

### "No logs appearing"
- Set `LOG_LEVEL=debug` in `.env`
- Restart server: `npm run dev`

### "Webhook not being called"
- Verify webhook URL in Telnyx is correct
- For local testing, use ngrok: `ngrok http 3000`
- Check Telnyx webhook logs in portal

---

## Health Checks

```bash
# Is server running?
curl http://localhost:3000/health/liveness

# Can it accept calls?
curl http://localhost:3000/health/readiness

# System status
curl http://localhost:3000/metrics
```

---

## You're Ready!

Call your Telnyx number and the AI will:
1. ✅ Answer the call
2. ✅ Listen to your voice
3. ✅ Generate intelligent responses
4. ✅ Log everything to Supabase
5. ✅ Track all events in `call_traces`

**Check the logs and Supabase to see the complete call audit trail!**
