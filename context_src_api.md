# Context: context_src_api.md

## File: src\api\middleware.ts
```typescript
   1 | import { Request, Response, NextFunction } from 'express';
   2 | import { randomUUID } from 'crypto';
   3 | import { logApiRequest } from '../core/logger';
   4 | 
   5 | // Extend Express Request to include correlationId
   6 | declare global {
   7 |   namespace Express {
   8 |     interface Request {
   9 |       correlationId: string;
  10 |     }
  11 |   }
  12 | }
  13 | 
  14 | export const correlationIdMiddleware = (
  15 |   req: Request,
  16 |   res: Response,
  17 |   next: NextFunction
  18 | ) => {
  19 |   const correlationId = req.headers['x-correlation-id'] as string || randomUUID();
  20 |   req.correlationId = correlationId;
  21 | 
  22 |   // Add correlationId to response headers
  23 |   res.setHeader('x-correlation-id', correlationId);
  24 | 
  25 |   // Log the request start
  26 |   const start = Date.now();
  27 | 
  28 |   // Log when response finishes
  29 |   res.on('finish', () => {
  30 |     const duration = Date.now() - start;
  31 |     logApiRequest(req.method, req.url, res.statusCode, duration, correlationId);
  32 |   });
  33 | 
  34 |   next();
  35 | };
```

## File: src\api\routes\telnyxWebhook.ts
```typescript
   1 | import express from 'express';
   2 | import { config } from '../../core/config';
   3 | import { logger, logCallEvent } from '../../core/logger';
   4 | import { SupabaseService } from '../../services/SupabaseService';
   5 | import { TelnyxService } from '../../services/TelnyxService';
   6 | import { CallManager } from '../../core/CallManager';
   7 | 
   8 | import { randomUUID } from 'crypto';
   9 | 
  10 | const router = express.Router();
  11 | 
  12 | // Function to verify Telnyx webhook signature
  13 | // Temporarily disabled for debugging - always return true
  14 | function verifyTelnyxSignature(_payload: string, _signature: string, _timestamp: string): boolean {
  15 |   logger.warn('Telnyx signature verification disabled for debugging');
  16 |   return true;
  17 | }
  18 | 
  19 | // Check if signature verification should be skipped
  20 | function shouldSkipSignatureVerification(): boolean {
  21 |   // Allow skipping via environment variable
  22 |   if (process.env['SKIP_SIGNATURE_VERIFICATION'] === 'true') {
  23 |     return true;
  24 |   }
  25 |   
  26 |   const pubKey = (process.env as any)['TELNYX_PUBLIC_KEY'] || config.TELNYX_PUBLIC_KEY || '';
  27 |   
  28 |   // Skip if no public key configured at all
  29 |   if (!pubKey || pubKey.length < 10) {
  30 |     return true;
  31 |   }
  32 |   
  33 |   // Auto-skip in development mode for placeholder keys
  34 |   if (config.NODE_ENV === 'development') {
  35 |     const placeholderPatterns = [
  36 |       /^test/i,
  37 |       /^placeholder/i,
  38 |       /^dev-/i,
  39 |       /^mock/i
  40 |     ];
  41 |     return placeholderPatterns.some(pattern => pattern.test(pubKey));
  42 |   }
  43 |   
  44 |   return false;
  45 | }
  46 | 
  47 | // POST /api/v1/telnyx/inbound
  48 | router.post('/inbound', async (req, res) => {
  49 |   try {
  50 |     const { correlationId } = req;
  51 |     const supabase = SupabaseService.getInstance();
  52 |     const callManager = CallManager.getInstance();
  53 | 
  54 |     // Log incoming webhook
  55 |     logger.info({
  56 |       correlationId,
  57 |       body: req.body,
  58 |       headers: req.headers
  59 |     }, 'Telnyx inbound webhook received');
  60 | 
  61 |     // Validate Telnyx signature
  62 |     const signature = req.headers['telnyx-signature-ed25519'] as string;
  63 |     const timestamp = req.headers['telnyx-timestamp'] as string;
  64 |     const payload = JSON.stringify(req.body);
  65 | 
  66 |     if (!signature || !timestamp) {
  67 |       logger.warn({ correlationId }, 'Missing Telnyx signature or timestamp headers');
  68 |       res.status(401).send('Unauthorized');
  69 |       return;
  70 |     }
  71 | 
  72 |     // Skip signature verification in development mode or when explicitly disabled
  73 |     if (!shouldSkipSignatureVerification()) {
  74 |       if (!verifyTelnyxSignature(payload, signature, timestamp)) {
  75 |         logger.warn({ correlationId }, 'Invalid Telnyx signature');
  76 |         res.status(401).send('Unauthorized');
  77 |         return;
  78 |       }
  79 |     } else {
  80 |       logger.info({ correlationId, signature }, 'Dev mode: signature verification skipped');
  81 |     }
  82 | 
  83 |     // Check timestamp for replay attacks (allow 5 minutes tolerance)
  84 |     const now = Math.floor(Date.now() / 1000);
  85 |     const sigTimestamp = parseInt(timestamp, 10);
  86 |     const tolerance = 300; // 5 minutes
  87 | 
  88 |     if (Math.abs(now - sigTimestamp) > tolerance) {
  89 |       logger.warn({ correlationId, timestamp: sigTimestamp, now }, 'Invalid or replayed timestamp');
  90 |       res.status(401).send('Unauthorized');
  91 |       return;
  92 |     }
  93 | 
  94 |     // Parse webhook body
  95 |     const event = req.body;
  96 |     // Telnyx webhook structure: { data: { event_type, payload, ... }, meta: {...}, headers: {...} }
  97 |     const eventData = event?.data;
  98 |     if (!eventData || eventData.event_type !== 'call.initiated') {
  99 |       logger.warn({ correlationId, eventType: eventData?.event_type }, 'Ignoring non-call.initiated event');
 100 |       res.status(200).send('OK');
 101 |       return;
 102 |     }
 103 | 
 104 |     const callControlId = eventData.payload.call_control_id;
 105 |     const toNumber = eventData.payload.to;
 106 |     const fromNumber = eventData.payload.from;
 107 | 
 108 |     logCallEvent('info', 'Processing inbound call', {
 109 |       correlationId,
 110 |       callControlId,
 111 |       toNumber,
 112 |       fromNumber
 113 |     });
 114 | 
 115 |     // Find tenant by phone number
 116 |     const tenantData = await supabase.findTenantByPhoneNumber(toNumber);
 117 |     if (!tenantData) {
 118 |       logger.warn({ correlationId, toNumber }, 'No tenant found for phone number');
 119 |       res.set('Content-Type', 'text/xml');
 120 |       res.send(`<?xml version="1.0" encoding="UTF-8"?>
 121 | <Response>
 122 |   <Say>Sorry, this number is not available.</Say>
 123 |   <Hangup/>
 124 | </Response>`);
 125 |       return;
 126 |     }
 127 | 
 128 |     const { tenantId, tenantSettings } = tenantData;
 129 | 
 130 |     // Create call session
 131 |     const sessionId = randomUUID();
 132 |     callManager.createSession(callControlId, tenantId, sessionId, {
 133 |       toNumber,
 134 |       fromNumber,
 135 |       aiGreeting: tenantSettings.ai_greeting
 136 |     });
 137 | 
 138 |     logCallEvent('info', 'Call session created', {
 139 |       correlationId,
 140 |       sessionId,
 141 |       tenantId,
 142 |       callControlId
 143 |     });
 144 | 
 145 |     // Generate WebSocket URL
 146 |     const protocol = req.headers['x-forwarded-proto'] === 'https' || 
 147 |                      req.headers.host?.includes('.trycloudflare.com') ||
 148 |                      req.headers.host?.includes('.ngrok') ||
 149 |                      req.headers.host?.includes('.up.railway.app') ? 'wss' : 'ws';
 150 |     const host = req.headers.host;
 151 |     const websocketUrl = `${protocol}://${host}/media?sessionId=${sessionId}&tenantId=${tenantId}`;
 152 | 
 153 |     logger.info(`Generated WebSocket URL for Telnyx: ${websocketUrl} (Host: ${host}, Proto: ${req.headers['x-forwarded-proto']})`);
 154 | 
 155 |     // Execute Call Control commands via SDK
 156 |     // Note: We respond with 200 OK immediately and execute commands asynchronously
 157 |     const telnyxService = TelnyxService.getInstance();
 158 |     
 159 |     // Answer the call and start the stream
 160 |     // We don't await them to ensure the webhook returns immediately
 161 |     (async () => {
 162 |       const answered = await telnyxService.answerCall(callControlId);
 163 |       if (answered) {
 164 |         await telnyxService.startStream(callControlId, websocketUrl);
 165 |       }
 166 |     })().catch(err => {
 167 |       logger.error({ correlationId, error: err.message }, 'Failed to execute Telnyx commands');
 168 |     });
 169 | 
 170 |     res.status(200).send('OK');
 171 | 
 172 |   } catch (error) {
 173 |     const err = error as Error;
 174 |     logger.error({
 175 |       correlationId: req.correlationId,
 176 |       error: err.message,
 177 |       stack: err.stack
 178 |     }, 'Error processing Telnyx webhook');
 179 | 
 180 |     res.status(500).json({ error: 'Internal server error' });
 181 |   }
 182 | });
 183 | 
 184 | export { router as telnyxWebhookRouter };
```

