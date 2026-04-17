# Build & Run Guide - Telenyx AI Receptionist Gateway

Complete setup instructions for compiling and running the application locally.

---

## Prerequisites

- **Node.js**: v18+ (download from https://nodejs.org/)
- **npm**: v9+ (comes with Node.js)
- **Supabase Account**: For database access
- **Gemini API Key**: From Google AI Studio
- **Telnyx API Key**: For phone integration

---

## Step 1: Install Dependencies

```bash
cd C:\Users\ReMarkt\Desktop\telenyx
npm install
```

This installs all packages from `package.json`:
- `express` — HTTP server
- `ws` — WebSocket (Telnyx media stream + Gemini API)
- `@supabase/supabase-js` — Database client
- `pino` — Structured logging
- `zod` — Config validation
- `typescript` — TypeScript compiler

**Expected output**: `added XXX packages in YYYs`

---

## Step 2: Configure Environment Variables

Create `.env` file in the project root:

```bash
# Gemini
GEMINI_API_KEY=your_gemini_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Telnyx
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_PUBLIC_KEY=your_telnyx_public_key
TELNYX_SIP_USERNAME=your_sip_username
TELNYX_SIP_PASSWORD=your_sip_password

# Stripe (not currently used, but required in config)
STRIPE_PUBLISHABLE_KEY=pk_test_dummy
STRIPE_SECRET_KEY=sk_test_dummy
STRIPE_WEBHOOK_SECRET=whsec_dummy
STRIPE_MINUTE_PACK_PRICE_ID=price_dummy
STRIPE_SUBSCRIPTION_PRICE_ID=price_dummy

# Resend (not currently used, but required in config)
RESEND_API_KEY=re_dummy

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

---

## Step 3: Compile TypeScript

```bash
npm run lint
```

This runs `npx tsc --noEmit` to check for TypeScript errors **without** generating output files.

Expected: No errors or warnings.

If you see errors:
- Check that all imports are correct
- Verify types are properly defined
- Ensure no circular dependencies

---

## Step 4: Build for Production

```bash
npm run build
```

This:
1. Runs TypeScript compiler (`tsc`)
2. Generates JavaScript files in `dist/` directory
3. Outputs source maps for debugging

**Directory structure after build:**
```
dist/
├── index.js                    (main entry point)
├── api/
│   ├── middleware.js
│   └── routes/
│       └── telnyxWebhook.js
├── audio/
│   ├── AudioPipeline.js
│   ├── JitterBuffer.js
│   └── BufferPool.js
├── core/
│   ├── CallManager.js
│   ├── config.js
│   ├── logger.js
│   ├── BatchLogger.js
│   ├── Tracer.js
│   └── EventLoopMonitor.js
├── services/
│   ├── AIService.js
│   └── SupabaseService.js
└── types/
    ├── call.js
    ├── index.js
    └── schema.js
```

---

## Step 5: Run in Development Mode

For **live recompilation** with file watching (hot reload):

```bash
npm run dev
```

This starts:
- **Port 3000**: HTTP server for webhooks
- **WebSocket**: Media stream handler at `/media`
- **Watch mode**: Auto-recompiles on file changes
- **ts-node**: Runs TypeScript directly (no compile step)

**Expected output:**
```
[pino] Server started
{
  "level": 30,
  "time": "2026-04-17T...",
  "port": 3000,
  "nodeEnv": "development"
}
```

---

## Step 6: Run Production Build

After building with `npm run build`:

```bash
npm start
```

This runs the compiled JavaScript from `dist/index.js` (faster, no TypeScript overhead).

---

## Step 7: Test the Health Endpoint

In a **new terminal**:

```bash
curl http://localhost:3000/health/liveness
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-17T..."
}
```

---

## Step 8: Run Story 1.4 DSP Tests

Test the audio processing pipeline:

```bash
npx ts-node src/tests/story-1-4-dsp.test.ts
```

Expected output:
```
╔════════════════════════════════════════════════════════════════╗
║  Story 1.4: Low-Latency Signal Processing Test Suite          ║
╚════════════════════════════════════════════════════════════════╝

✓ BufferPool: acquire and release (0.5ms)
✓ DSP: DC offset removal latency <0.5ms (0.2ms)
✓ DSP: Endianness swap (swap16) correctness (0.1ms)
✓ DSP: RMS calculation (dBFS) (0.3ms)
... (10 tests total)

╔════════════════════════════════════════════════════════════════╗
║  Test Summary                                                  ║
╚════════════════════════════════════════════════════════════════╝

Tests passed: 10/10
Total time: 1234.56ms
✓ All tests passed!
```

---

## Monitoring During Development

### Log Levels

Change `LOG_LEVEL` in `.env`:
- `trace` — Very verbose (all function calls)
- `debug` — Debugging info
- `info` — General information
- `warn` — Warnings only
- `error` — Errors only

### Health Endpoint

```bash
curl http://localhost:3000/health/readiness
```

Response includes:
- Active call count
- Readiness status (200 = ready, 503 = not ready)

### Metrics Endpoint

```bash
curl http://localhost:3000/metrics
```

Response includes:
- CPU usage
- Memory usage
- Event loop stats
- Uptime

---

## Troubleshooting

### Issue: TypeScript Compilation Errors

```
error TS2688: Cannot find type definition for 'node'
```

**Fix:**
```bash
npm install --save-dev @types/node
```

### Issue: Module not found

```
error TS2307: Cannot find module '@supabase/supabase-js'
```

**Fix:**
```bash
npm install @supabase/supabase-js
```

### Issue: Port 3000 already in use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Fix:**
```bash
# Change PORT in .env to 3001, or kill existing process:
# On Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# On Mac/Linux:
lsof -i :3000
kill -9 <PID>
```

### Issue: Environment variables not loaded

```
Error: GEMINI_API_KEY is required
```

**Fix:**
1. Verify `.env` file exists in project root
2. Restart the dev server: `npm run dev`
3. Check that `.env` is not in `.gitignore` (it shouldn't be for now)

---

## Docker Deployment

For production deployment:

```bash
# Build Docker image
docker build -t telenyx-gateway:latest .

# Run container
docker run -p 3000:3000 \
  --env-file .env \
  --name telenyx-gateway \
  telenyx-gateway:latest

# View logs
docker logs -f telenyx-gateway

# Stop container
docker stop telenyx-gateway
```

---

## Performance Checklist

Before going to production:

- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run build` succeeds
- [ ] Health endpoints respond (200 OK)
- [ ] DSP tests pass (10/10)
- [ ] Event loop lag < 50ms (check logs)
- [ ] No TypeScript errors in IDE
- [ ] All Supabase RPC functions exist
- [ ] Gemini API key is valid
- [ ] Telnyx webhook URL is configured

---

## Summary of Commands

```bash
# Development
npm install              # Install dependencies
npm run lint             # Check TypeScript
npm run dev              # Start dev server with hot reload

# Production
npm run build            # Compile TypeScript
npm start                # Run compiled app

# Testing
npx ts-node src/tests/story-1-4-dsp.test.ts   # Run DSP tests

# Monitoring
curl http://localhost:3000/health/liveness    # Health check
curl http://localhost:3000/health/readiness   # Readiness check
curl http://localhost:3000/metrics             # Metrics
```

---

## Next Steps

1. **Install & Build**: Follow steps 1-4 above
2. **Configure**: Add `.env` with all credentials
3. **Test**: Run health endpoints and DSP tests
4. **Monitor**: Check logs and metrics during operation
5. **Deploy**: Use Docker or your preferred hosting platform

**You now have a production-ready AI receptionist gateway!** 🚀
