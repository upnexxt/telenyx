# Complete Setup Guide - Telenyx AI Receptionist Gateway

A step-by-step guide to set up and deploy the AI receptionist system.

---

## Prerequisites

- **Node.js** v18+ (download from https://nodejs.org/)
- **npm** v9+ (comes with Node.js)
- A modern code editor (VS Code recommended)
- Access to 3 cloud services (free tiers available):
  - Google Gemini API
  - Supabase (PostgreSQL)
  - Telnyx (VoIP/Phone)

---

## Phase 1: Local Setup (15 minutes)

### Step 1.1: Install Dependencies

```bash
cd C:\Users\ReMarkt\Desktop\telenyx
npm install
```

Expected output:
```
added 150 packages in 45s
```

### Step 1.2: Verify Build

```bash
npm run lint
```

Expected: `0 errors` (0 errors found)

### Step 1.3: Create .env File

```bash
cp .env.example .env
```

Your `.env` file now contains all variable names. You'll fill them in next.

---

## Phase 2: Configure Cloud Services

### A. Google Gemini API (5 minutes)

**Get your API key:**

1. Go to: https://aistudio.google.com/apikey
2. Click **"Create API Key"**
3. Copy the key (starts with `AIzaSy...`)

**Add to `.env`:**

```env
GEMINI_API_KEY=AIzaSy...your-key-here...
VITE_GEMINI_API_KEY=AIzaSy...your-key-here...
```

**Verify it works:**

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.4-flash-live?key=YOUR_KEY" | grep -o "\"name\""
```

Should return: `"name"`

---

### B. Supabase Database (10 minutes)

**Create project:**

1. Go to: https://app.supabase.com
2. Click **"New Project"**
3. Choose: Organization → Region → Password
4. Wait 2-3 minutes for project to start

**Get credentials:**

1. Go to: **Settings** → **API**
2. Copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon key` → `SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

**Add to `.env`:**

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Create database tables:**

Run these SQL queries in **Supabase SQL Editor** (paste each one):

```sql
-- Tenant Settings
CREATE TABLE tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  ai_name TEXT DEFAULT 'Sophie',
  ai_voice TEXT DEFAULT 'Aoede',
  ai_language TEXT DEFAULT 'Nederlands',
  ai_tone TEXT DEFAULT 'vriendelijk en professioneel',
  ai_temperature NUMERIC DEFAULT 0.7,
  business_name TEXT,
  custom_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call Logs
CREATE TABLE call_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant_settings(tenant_id),
  customer_id TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'IN_PROGRESS',
  duration_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call Traces (Audit Trail)
CREATE TYPE step_type_enum AS ENUM (
  'USER_SPEECH',
  'AI_SPEECH',
  'TOOL_CALL',
  'TOOL_RESULT',
  'SYSTEM_ERROR',
  'SESSION_INIT',
  'CONTEXT_UPDATE',
  'AI_METADATA',
  'TOOL_CHAIN_INFO'
);

CREATE TABLE call_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id TEXT REFERENCES call_logs(id),
  tenant_id TEXT NOT NULL REFERENCES tenant_settings(tenant_id),
  step_type step_type_enum NOT NULL,
  content JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  timestamp TIMESTAMPTZ,
  correlation_id TEXT
);

-- System Logs
CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT DEFAULT 'info',
  source TEXT DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  session_id TEXT,
  call_control_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant Billing Stats
CREATE TABLE tenant_billing_stats (
  tenant_id TEXT PRIMARY KEY REFERENCES tenant_settings(tenant_id),
  included_minutes INT DEFAULT 0,
  used_minutes INT DEFAULT 0,
  pack_minutes_remaining INT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telnyx Numbers
CREATE TABLE telnyx_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenant_settings(tenant_id),
  phone_number TEXT NOT NULL UNIQUE,
  telnyx_number_id TEXT,
  status TEXT DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Insert test tenant:**

```sql
INSERT INTO tenant_settings (
  tenant_id, ai_name, business_name, ai_voice
) VALUES (
  'tenant-test-001',
  'Sophie',
  'Test Salon',
  'Aoede'
);

INSERT INTO telnyx_numbers (tenant_id, phone_number) VALUES (
  'tenant-test-001',
  '+1-555-TEST-AI'
);
```

**Verify:**

```sql
SELECT * FROM tenant_settings;
SELECT * FROM telnyx_numbers;
```

---

### C. Telnyx Phone Integration (10 minutes)

**Create account:**

1. Go to: https://telnyx.com/sign-up
2. Sign up with email
3. Verify email

**Get API credentials:**

1. Go to: https://portal.telnyx.com/account/settings
2. Copy: `API Key` → `TELNYX_API_KEY`
3. Go to: **Auth** → **API Keys**
4. Create new key, copy it → `TELNYX_API_KEY`

**Get public key:**

1. Go to **Messaging** or **Voice**
2. Find **Public Key** for signature verification
3. Copy → `TELNYX_PUBLIC_KEY`

**Add to `.env`:**

```env
TELNYX_API_KEY=KEY...your-key...
TELNYX_PUBLIC_KEY=PK...your-public-key...
TELNYX_SIP_USERNAME=sip_user
TELNYX_SIP_PASSWORD=sip_pass
```

**Buy a phone number:**

1. Go to: https://portal.telnyx.com/phone-numbers
2. Click **"Buy Phone Numbers"**
3. Choose region and quantity
4. Complete checkout

**Configure webhook:**

1. Go to: **Voice** → **Inbound Call Control**
2. Set **Webhook URL**: `http://localhost:3000/api/v1/telnyx/inbound` (for local testing)
3. Set **Webhook Method**: POST
4. Save

(Later, use ngrok or a production domain like `https://yourdomain.com/api/v1/telnyx/inbound`)

---

## Phase 3: Run the System

### Step 3.1: Start Development Server

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

Server is running at: `http://localhost:3000`

### Step 3.2: Verify Server Health

In **another terminal**:

```bash
# Liveness check
curl http://localhost:3000/health/liveness

# Expected:
{"status":"ok","timestamp":"2026-04-17T..."}

# Readiness check
curl http://localhost:3000/health/readiness

# Expected:
{"status":"ready","activeCalls":0,"timestamp":"2026-04-17T..."}

# Metrics
curl http://localhost:3000/metrics

# Expected:
{"activeCalls":0,"cpuUsage":{...},"memoryUsage":{...},"uptime":5.234}
```

### Step 3.3: Run DSP Tests

```bash
npx ts-node src/tests/story-1-4-dsp.test.ts
```

Expected: All 10 tests pass ✓

```
╔════════════════════════════════════════════════════════════════╗
║  Story 1.4: Low-Latency Signal Processing Test Suite          ║
╚════════════════════════════════════════════════════════════════╝

✓ BufferPool: acquire and release (0.5ms)
✓ DSP: DC offset removal latency <0.5ms (0.2ms)
✓ DSP: Endianness swap (swap16) correctness (0.1ms)
... (10 tests total)

✓ All tests passed!
```

---

## Phase 4: Test a Call

See **TEST_CALL.md** for:
- ✅ Simulating a test call (local)
- ✅ Making a real phone call (production)
- ✅ Verifying logging
- ✅ Checking Supabase traces

---

## Phase 5: Production Deployment

### Option A: Docker

```bash
# Build image
docker build -t telenyx-ai:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name telenyx-ai \
  telenyx-ai:latest

# View logs
docker logs -f telenyx-ai
```

### Option B: Cloud Hosting (e.g., Railway, Render, Heroku)

1. Push code to GitHub
2. Connect repository to hosting platform
3. Set environment variables from `.env`
4. Deploy
5. Update Telnyx webhook URL to your production domain

### Option C: Local Machine (Windows)

Use **ngrok** to expose localhost to the internet:

```bash
# Install ngrok
# Download from: https://ngrok.com/download

# Run ngrok tunnel
ngrok http 3000

# You'll see:
# Forwarding                    https://abc123.ngrok.io -> http://localhost:3000
```

Update Telnyx webhook URL to: `https://abc123.ngrok.io/api/v1/telnyx/inbound`

---

## Verification Checklist

Before calling:

- [ ] Node.js installed (`node --version`)
- [ ] Dependencies installed (`npm install`)
- [ ] Build succeeds (`npm run lint` = 0 errors)
- [ ] `.env` file created with all keys
- [ ] Gemini API key valid
- [ ] Supabase project created and tables inserted
- [ ] Supabase test tenant created
- [ ] Telnyx account with phone number
- [ ] Telnyx API key copied to `.env`
- [ ] Server running (`npm run dev`)
- [ ] Health check passes (`curl http://localhost:3000/health/liveness`)
- [ ] DSP tests pass (`npx ts-node src/tests/story-1-4-dsp.test.ts`)

---

## Common Issues

### "GEMINI_API_KEY is required"
- Check `.env` file has `GEMINI_API_KEY=...` (not empty)
- Restart dev server: `npm run dev`

### "Cannot connect to Supabase"
- Verify `SUPABASE_URL` format: `https://xxx.supabase.co`
- Verify `SUPABASE_SERVICE_ROLE_KEY` is not empty
- Check internet connection

### "Webhook signature verification failed"
- Normal for test calls
- Use ngrok for real phone testing

### "No logs appearing"
- Set `LOG_LEVEL=debug` in `.env`
- Restart server

### "Port 3000 already in use"
- Kill existing process: `taskkill /PID <PID> /F`
- Or use: `PORT=3001 npm run dev`

---

## Troubleshooting Commands

```bash
# Check Node version
node --version

# Verify npm packages
npm list

# Clean and reinstall
rm -r node_modules package-lock.json
npm install

# Type check only (no build)
npm run lint

# View full server logs
npm run dev 2>&1 | tee server.log

# Test Gemini connection
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.4-flash-live?key=$GEMINI_API_KEY" | head -20
```

---

## Success Indicators

When everything is set up correctly, you'll see:

1. **Server starts** without errors
2. **Health check** returns `status: "ok"`
3. **Incoming call** appears in logs as:
   ```json
   {"sessionId": "...", "message": "Call session created"}
   ```
4. **Supabase** shows new entry in `call_logs` table
5. **Call traces** appear in `call_traces` table with `step_type: "SESSION_INIT"`

---

## Next: Make Your First Call

Follow **TEST_CALL.md** to make a test call and see the AI respond! 🚀
