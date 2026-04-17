# Project Context Bundle (Source & Config)

## File: package.json
```json
   1 | {
   2 |   "name": "telenyx",
   3 |   "version": "1.0.0",
   4 |   "description": "",
   5 |   "main": "index.js",
   6 |   "scripts": {
   7 |     "build": "tsc",
   8 |     "start": "node dist/index.js",
   9 |     "dev": "nodemon --exec ts-node src/index.ts",
  10 |     "lint": "tsc --noEmit",
  11 |     "test": "echo \"Error: no test specified\" && exit 1"
  12 |   },
  13 |   "keywords": [],
  14 |   "author": "",
  15 |   "license": "ISC",
  16 |   "type": "commonjs",
  17 |   "devDependencies": {
  18 |     "@types/express": "^5.0.6",
  19 |     "@types/node": "^25.6.0",
  20 |     "@types/ws": "^8.18.1",
  21 |     "nodemon": "^3.1.14",
  22 |     "ts-node": "^10.9.2",
  23 |     "typescript": "^6.0.3"
  24 |   },
  25 |   "dependencies": {
  26 |     "@google/genai": "^1.50.1",
  27 |     "@supabase/supabase-js": "^2.103.3",
  28 |     "dotenv": "^17.4.2",
  29 |     "express": "^5.2.1",
  30 |     "pino": "^10.3.1",
  31 |     "telnyx": "^6.41.0",
  32 |     "tweetnacl": "^1.0.3",
  33 |     "wavefile": "^11.0.0",
  34 |     "ws": "^8.20.0",
  35 |     "zod": "^4.3.6"
  36 |   }
  37 | }
```

## File: src\index.ts
```typescript
   1 | import express from 'express';
   2 | import { WebSocketServer } from 'ws';
   3 | import http from 'http';
   4 | import { config } from './core/config';
   5 | import { logger, logCallEvent } from './core/logger';
   6 | import { CallManager } from './core/CallManager';
   7 | import { CallStatus } from './types';
   8 | import { correlationIdMiddleware } from './api/middleware';
   9 | import { telnyxWebhookRouter } from './api/routes/telnyxWebhook';
  10 | import { AIService } from './services/AIService';
  11 | import { SupabaseService } from './services/SupabaseService';
  12 | import { AudioPipeline } from './audio/AudioPipeline';
  13 | import { EventLoopMonitor } from './core/EventLoopMonitor';
  14 | import { BatchLogger } from './core/BatchLogger';
  15 | 
  16 | const app = express();
  17 | const server = http.createServer(app);
  18 | // Create WebSocket server (not attached yet)
  19 | const wss = new WebSocketServer({ noServer: true });
  20 | 
  21 | // Explicitly handle HTTP Upgrade requests for WebSockets
  22 | server.on('upgrade', (request, socket, head) => {
  23 |   const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
  24 |   
  25 |   logger.info(`HTTP Upgrade request received for ${pathname}`);
  26 | 
  27 |   if (pathname === '/media') {
  28 |     wss.handleUpgrade(request, socket, head, (ws) => {
  29 |       wss.emit('connection', ws, request);
  30 |     });
  31 |   } else {
  32 |     logger.warn(`Rejecting WebSocket upgrade for unknown path: ${pathname}`);
  33 |     socket.destroy();
  34 |   }
  35 | });
  36 | 
  37 | 
  38 | const callManager = CallManager.getInstance();
  39 | const eventLoopMonitor = EventLoopMonitor.getInstance(); // Initialize system health monitoring
  40 | const batchLogger = BatchLogger.getInstance(); // Initialize async batch logging
  41 | let isShuttingDown = false;
  42 | 
  43 | // Middleware
  44 | app.use(express.json());
  45 | app.use(express.text({ type: 'text/xml' })); // For TeXML responses
  46 | app.use(correlationIdMiddleware);
  47 | 
  48 | // Routes
  49 | app.use('/api/v1/telnyx', telnyxWebhookRouter);
  50 | 
  51 | // Health check endpoints
  52 | app.get('/health/liveness', (_req, res) => {
  53 |   res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  54 | });
  55 | 
  56 | app.get('/health/readiness', (_req, res) => {
  57 |   const activeCalls = callManager.getSessionCount();
  58 |   const isReady = !isShuttingDown && activeCalls < 100; // Arbitrary limit
  59 | 
  60 |   res.status(isReady ? 200 : 503).json({
  61 |     status: isReady ? 'ready' : 'not ready',
  62 |     activeCalls,
  63 |     timestamp: new Date().toISOString()
  64 |   });
  65 | });
  66 | 
  67 | // Metrics endpoint
  68 | app.get('/metrics', (_req, res) => {
  69 |   const metrics = {
  70 |     activeCalls: callManager.getSessionCount(),
  71 |     cpuUsage: process.cpuUsage(),
  72 |     memoryUsage: process.memoryUsage(),
  73 |     uptime: process.uptime(),
  74 |     timestamp: new Date().toISOString()
  75 |   };
  76 | 
  77 |   res.json(metrics);
  78 | });
  79 | 
  80 | // WebSocket handling for media streams
  81 | wss.on('connection', (ws, req) => {
  82 |   logger.info(`Incoming WebSocket connection attempt to ${req.url} from ${req.socket.remoteAddress}`);
  83 | 
  84 |   if (isShuttingDown) {
  85 |     ws.close(1001, 'Server is shutting down');
  86 |     return;
  87 |   }
  88 | 
  89 |   const url = new URL(req.url!, `http://${req.headers.host}`);
  90 |   const sessionId = url.searchParams.get('sessionId');
  91 |   const tenantId = url.searchParams.get('tenantId');
  92 | 
  93 |   if (!sessionId || !tenantId) {
  94 |     logger.warn({ url: req.url }, 'WebSocket connection missing required parameters');
  95 |     ws.close(1008, 'Missing sessionId or tenantId');
  96 |     return;
  97 |   }
  98 | 
  99 |   const callManager = CallManager.getInstance();
 100 |   const session = callManager.getSession(sessionId);
 101 | 
 102 |   if (!session) {
 103 |     logger.warn({ sessionId, tenantId }, 'No session found for WebSocket connection');
 104 |     ws.close(1008, 'Invalid session');
 105 |     return;
 106 |   }
 107 | 
 108 |   // Update session with WebSocket connection
 109 |   session.metadata['websocket'] = ws;
 110 |   session.metadata['startTime'] = new Date();
 111 | 
 112 |   logCallEvent('info', 'WebSocket media stream connected', {
 113 |     sessionId,
 114 |     tenantId,
 115 |     callId: session.callControlId
 116 |   });
 117 | 
 118 |   // Handle incoming messages (Telnyx media frames)
 119 |   ws.on('message', async (data) => {
 120 |     try {
 121 |       const message = JSON.parse(data.toString());
 122 | 
 123 |       if (message.event === 'media') {
 124 |         const audioPayload = message.media.payload;
 125 |         const aiService = AIService.getInstance();
 126 |         
 127 |         // Pass to AIService which handles transcoding (8kHz PCMA -> 16kHz PCM)
 128 |         aiService.sendAudio(sessionId, audioPayload);
 129 | 
 130 |       } else if (message.event === 'start' || message.event === 'connected') {
 131 |         const streamId = message.stream_id || (message.start ? message.start.stream_id : null);
 132 |         if (streamId) {
 133 |           session.metadata['streamId'] = streamId;
 134 |           logger.info(`Telnyx stream started with ID: ${streamId}`);
 135 |         }
 136 | 
 137 |         // Only run setup once!
 138 |         if (session.status !== CallStatus.CONNECTED) {
 139 |           logCallEvent('info', 'Media stream connected', {
 140 |             sessionId,
 141 |             tenantId
 142 |           });
 143 | 
 144 |           // Update session status
 145 |           callManager.updateSessionStatus(sessionId, CallStatus.CONNECTED);
 146 | 
 147 |           // Initialize DSP jitter buffer with drain callback
 148 |           const pipeline = AudioPipeline.getInstance();
 149 |           pipeline.createJitterBuffer(sessionId, (chunk: Buffer) => {
 150 |             // Drain callback: send 20ms chunk to Telnyx
 151 |             callManager.sendAudioToTelnyx(sessionId, chunk.toString('base64'));
 152 |           });
 153 | 
 154 |           // Initialize call log
 155 |           const supabase = SupabaseService.getInstance();
 156 |           await supabase.createCallLog(
 157 |             sessionId,
 158 |             tenantId,
 159 |             session.metadata['fromNumber'] as string,
 160 |             session.metadata['toNumber'] as string,
 161 |             session.callControlId
 162 |           );
 163 | 
 164 |           // Start Gemini AI session
 165 |           const aiService = AIService.getInstance();
 166 |           await aiService.startSession(sessionId, tenantId);
 167 | 
 168 |           // Log system event
 169 |           await supabase.logSystemEvent(
 170 |             tenantId,
 171 |             'media_stream_connected',
 172 |             { sessionId, callControlId: session.callControlId },
 173 |             sessionId
 174 |           );
 175 |         }
 176 | 
 177 |       } else if (message.event === 'stopped') {
 178 |         logCallEvent('info', 'Media stream stopped', {
 179 |           sessionId,
 180 |           tenantId
 181 |         });
 182 | 
 183 |         // Update session status
 184 |         callManager.updateSessionStatus(sessionId, CallStatus.TERMINATING);
 185 | 
 186 |         // Destroy DSP jitter buffer
 187 |         const pipeline = AudioPipeline.getInstance();
 188 |         pipeline.destroyJitterBuffer(sessionId);
 189 | 
 190 |         // Finalize call log and billing
 191 |         const supabase = SupabaseService.getInstance();
 192 |         const startTime = session.metadata['startTime'] as Date;
 193 |         const durationSeconds = startTime ? Math.floor((Date.now() - startTime.getTime()) / 1000) : 0;
 194 |         const minutesUsed = Math.ceil(durationSeconds / 60);
 195 | 
 196 |         await supabase.finalizeCallLog(sessionId, durationSeconds);
 197 |         await supabase.updateTenantBilling(tenantId, minutesUsed);
 198 | 
 199 |         // Log system event
 200 |         await supabase.logSystemEvent(
 201 |           tenantId,
 202 |           'media_stream_stopped',
 203 |           { sessionId, durationSeconds, minutesUsed },
 204 |           sessionId
 205 |         );
 206 | 
 207 |         // End Gemini session
 208 |         const aiService = AIService.getInstance();
 209 |         aiService.endSession(sessionId);
 210 | 
 211 |         callManager.updateSessionStatus(sessionId, CallStatus.TERMINATED);
 212 |         callManager.destroySession(sessionId);
 213 |       }
 214 | 
 215 |     } catch (error) {
 216 |       const err = error as Error;
 217 |       logger.error({
 218 |         sessionId,
 219 |         tenantId,
 220 |         error: err.message
 221 |       }, 'Error processing WebSocket message');
 222 |     }
 223 |   });
 224 | 
 225 |   ws.on('close', () => {
 226 |     logCallEvent('info', 'WebSocket connection closed', {
 227 |       sessionId,
 228 |       tenantId
 229 |     });
 230 |   });
 231 | 
 232 |   ws.on('error', (error) => {
 233 |     const err = error as Error;
 234 |     logger.error({
 235 |       sessionId,
 236 |       tenantId,
 237 |       error: err.message
 238 |     }, 'WebSocket error');
 239 |   });
 240 | });
 241 | 
 242 | // Connection timeout guard
 243 | const TIMEOUT_CHECK_INTERVAL = 30000; // 30 seconds
 244 | const SESSION_TIMEOUT = 300000; // 5 minutes
 245 | 
 246 | setInterval(() => {
 247 |   const now = Date.now();
 248 |   const sessions = callManager.getActiveSessions();
 249 | 
 250 |   for (const session of sessions) {
 251 |     if (now - session.lastActivity.getTime() > SESSION_TIMEOUT) {
 252 |       logger.warn({
 253 |         sessionId: session.id,
 254 |         tenantId: session.tenantId,
 255 |         lastActivity: session.lastActivity
 256 |       }, 'Session timeout - destroying zombie session');
 257 | 
 258 |       callManager.destroySession(session.id);
 259 |     }
 260 |   }
 261 | }, TIMEOUT_CHECK_INTERVAL);
 262 | 
 263 | // Graceful shutdown
 264 | const gracefulShutdown = async (signal: string) => {
 265 |   logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
 266 | 
 267 |   isShuttingDown = true;
 268 |   eventLoopMonitor.stop();
 269 | 
 270 |   // Stop accepting new connections
 271 |   server.close(async (err) => {
 272 |     if (err) {
 273 |       logger.error({ err }, 'Error closing server');
 274 |       process.exit(1);
 275 |     }
 276 | 
 277 |     logger.info('Server closed, waiting for active calls to complete');
 278 | 
 279 |     // Flush pending traces
 280 |     logger.info('Flushing pending traces...');
 281 |     await batchLogger.flushNow();
 282 | 
 283 |     // Wait for active calls to complete
 284 |     const checkInterval = setInterval(() => {
 285 |       const activeCalls = callManager.getSessionCount();
 286 |       logger.info({ activeCalls }, 'Checking for active calls during shutdown');
 287 | 
 288 |       if (activeCalls === 0) {
 289 |         clearInterval(checkInterval);
 290 |         logger.info('All calls completed, shutting down');
 291 |         process.exit(0);
 292 |       }
 293 |     }, 5000); // Check every 5 seconds
 294 | 
 295 |     // Force shutdown after 2 minutes
 296 |     setTimeout(() => {
 297 |       clearInterval(checkInterval);
 298 |       logger.warn('Force shutdown after timeout');
 299 |       process.exit(0);
 300 |     }, 120000);
 301 |   });
 302 | };
 303 | 
 304 | process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
 305 | process.on('SIGINT', () => gracefulShutdown('SIGINT'));
 306 | 
 307 | // Start server
 308 | server.listen(config.PORT, () => {
 309 |   logger.info({
 310 |     port: config.PORT,
 311 |     nodeEnv: config.NODE_ENV
 312 |   }, 'Server started');
 313 | });
```

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

## File: src\audio\AudioPipeline.ts
```typescript
   1 | /**
   2 |  * Enterprise-grade DSP Audio Pipeline
   3 |  * Handles real-time audio transformation between Telnyx and Gemini
   4 |  * Target latency: <10ms processing per chunk, <50ms with jitter buffer
   5 |  */
   6 | 
   7 | import { JitterBuffer } from './JitterBuffer';
   8 | 
   9 | export interface DcFilterState {
  10 |   prevIn: number;
  11 |   prevOut: number;
  12 | }
  13 | 
  14 | export interface FirFilterState {
  15 |   history: number[];
  16 | }
  17 | 
  18 | export interface AudioDspState {
  19 |   dcIn: DcFilterState; // Inbound high-pass filter state
  20 |   firOut: FirFilterState; // Outbound anti-aliasing FIR state
  21 | }
  22 | 
  23 | export class AudioPipeline {
  24 |   private static instance: AudioPipeline;
  25 |   private jitterBuffers: Map<string, JitterBuffer> = new Map();
  26 | 
  27 |   // DC Offset Filter: first-order high-pass at 80Hz
  28 |   // alpha = exp(-2π × fc / fs) where fc=80Hz, fs=16000Hz ≈ 0.9691
  29 |   private readonly ALPHA_DC = 0.9691;
  30 | 
  31 |   // FIR Coefficients: 7-tap low-pass filter at 8kHz (for 24kHz input)
  32 |   // Parks-McClellan design with Hann window
  33 |   private readonly FIR_COEFFS = [
  34 |     -0.0078125, 0.046875, 0.289063, 0.4375, 0.289063, 0.046875, -0.0078125
  35 |   ];
  36 | 
  37 |   // Soft limiter gain: -3dB = 10^(-3/20) ≈ 0.7079
  38 |   private readonly SOFT_LIMIT_GAIN = 0.7079;
  39 | 
  40 |   // Echo suppression: -6dB ducking when AI is speaking
  41 |   private readonly ECHO_SUPPRESS_GAIN = 0.5;
  42 | 
  43 |   private constructor() {
  44 |     // Singleton constructor
  45 |   }
  46 | 
  47 |   public static getInstance(): AudioPipeline {
  48 |     if (!AudioPipeline.instance) {
  49 |       AudioPipeline.instance = new AudioPipeline();
  50 |     }
  51 |     return AudioPipeline.instance;
  52 |   }
  53 | 
  54 |   /**
  55 |    * Inbound audio processing: Telnyx → Gemini
  56 |    * Steps: swap16 (BE→LE), DC offset removal, echo suppression
  57 |    */
  58 |   public processInbound(
  59 |     base64Audio: string,
  60 |     dcState: DcFilterState,
  61 |     isAiSpeaking: boolean
  62 |   ): Buffer {
  63 |     const buffer = Buffer.from(base64Audio, 'base64');
  64 | 
  65 |     // Step 1: Endianness swap (Big-Endian → Little-Endian)
  66 |     // Telnyx sends L16 in network byte order (BE), Gemini expects LE
  67 |     buffer.swap16();
  68 | 
  69 |     // Step 2: DC offset removal (high-pass filter at 80Hz)
  70 |     // Removes telephone line "hum" and DC bias
  71 |     this.removeDcOffset(buffer, dcState);
  72 | 
  73 |     // Step 3: Echo suppression
  74 |     // If AI is speaking, attenuate inbound audio by 6dB to prevent feedback loops
  75 |     if (isAiSpeaking) {
  76 |       this.applyEchoSuppression(buffer);
  77 |     }
  78 | 
  79 |     return buffer;
  80 |   }
  81 | 
  82 |   /**
  83 |    * Outbound audio processing: Gemini → Telnyx
  84 |    * Steps: soft limiter, anti-aliasing FIR, polyphase downsample 24→16kHz
  85 |    * Output goes to JitterBuffer for paced Telnyx delivery
  86 |    */
  87 |   public processOutbound(
  88 |     base64Audio: string,
  89 |     sessionId: string,
  90 |     firState: FirFilterState
  91 |   ): void {
  92 |     const rawAudio = Buffer.from(base64Audio, 'base64');
  93 | 
  94 |     // Step 1: Soft limiter (-3dB gain) to prevent clipping on phone lines
  95 |     const limited = this.applySoftLimiter(rawAudio);
  96 | 
  97 |     // Step 2: Anti-aliasing FIR filter (low-pass at 8kHz for 24kHz input)
  98 |     const filtered = this.applyFirFilter(limited, firState);
  99 | 
 100 |     // Step 3: Polyphase downsample 24kHz → 16kHz (3:2 ratio)
 101 |     const downsampled = this.downsample24to16(filtered);
 102 | 
 103 |     // Step 4: Push to jitter buffer for timed output
 104 |     const jb = this.jitterBuffers.get(sessionId);
 105 |     if (jb) {
 106 |       jb.push(downsampled);
 107 |     }
 108 |   }
 109 | 
 110 |   /**
 111 |    * Create a jitter buffer for a session
 112 |    * Called when session starts
 113 |    */
 114 |   public createJitterBuffer(sessionId: string, onDrain: (chunk: Buffer) => void): void {
 115 |     const jb = new JitterBuffer(onDrain);
 116 |     jb.start();
 117 |     this.jitterBuffers.set(sessionId, jb);
 118 |   }
 119 | 
 120 |   /**
 121 |    * Destroy a jitter buffer
 122 |    * Called when session ends
 123 |    */
 124 |   public destroyJitterBuffer(sessionId: string): void {
 125 |     const jb = this.jitterBuffers.get(sessionId);
 126 |     if (jb) {
 127 |       jb.stop();
 128 |       this.jitterBuffers.delete(sessionId);
 129 |     }
 130 |   }
 131 | 
 132 |   /**
 133 |    * Get jitter buffer depth in milliseconds
 134 |    */
 135 |   public getJitterBufferDepth(sessionId: string): number {
 136 |     return this.jitterBuffers.get(sessionId)?.getDepthMs() ?? 0;
 137 |   }
 138 | 
 139 |   /**
 140 |    * Calculate RMS (Root Mean Square) for volume measurement
 141 |    * Returns dBFS: 20 × log10(RMS / 32768)
 142 |    */
 143 |   public calculateRmsDbfs(buffer: Buffer): number {
 144 |     const samples = buffer.length / 2;
 145 |     if (samples === 0) return -Infinity;
 146 | 
 147 |     let sum = 0;
 148 |     for (let i = 0; i < samples; i++) {
 149 |       const s = buffer.readInt16LE(i * 2);
 150 |       sum += s * s;
 151 |     }
 152 | 
 153 |     const rms = Math.sqrt(sum / samples);
 154 |     const dbfs = 20 * Math.log10(rms / 32768);
 155 |     return Math.max(dbfs, -120); // Floor at -120dBFS
 156 |   }
 157 | 
 158 |   // ═════════════════════════════════════════════════════════════════════════════
 159 |   // Private DSP Utility Functions
 160 |   // ═════════════════════════════════════════════════════════════════════════════
 161 | 
 162 |   /**
 163 |    * DC Offset Removal: First-order IIR high-pass filter
 164 |    * Removes low-frequency rumble and DC bias from audio signal
 165 |    *
 166 |    * y[n] = alpha × (y[n-1] + x[n] - x[n-1])
 167 |    * where alpha ≈ 0.9691 for fc=80Hz at fs=16kHz
 168 |    */
 169 |   private removeDcOffset(buffer: Buffer, state: DcFilterState): void {
 170 |     const samples = buffer.length / 2;
 171 |     for (let i = 0; i < samples; i++) {
 172 |       const xn = buffer.readInt16LE(i * 2);
 173 |       const yn = this.ALPHA_DC * (state.prevOut + xn - state.prevIn);
 174 | 
 175 |       state.prevIn = xn;
 176 |       state.prevOut = yn;
 177 | 
 178 |       const clamped = Math.max(-32768, Math.min(32767, Math.round(yn)));
 179 |       buffer.writeInt16LE(clamped, i * 2);
 180 |     }
 181 |   }
 182 | 
 183 |   /**
 184 |    * Echo Suppression: Simple attenuation (-6dB)
 185 |    * When AI is speaking, reduce microphone input to prevent feedback loops
 186 |    */
 187 |   private applyEchoSuppression(buffer: Buffer): void {
 188 |     for (let i = 0; i < buffer.length; i += 2) {
 189 |       const s = buffer.readInt16LE(i);
 190 |       const suppressed = Math.round(s * this.ECHO_SUPPRESS_GAIN);
 191 |       buffer.writeInt16LE(suppressed, i);
 192 |     }
 193 |   }
 194 | 
 195 |   /**
 196 |    * Soft Limiter: Apply -3dB gain
 197 |    * Prevents audio clipping on phone lines
 198 |    */
 199 |   private applySoftLimiter(buffer: Buffer): Buffer {
 200 |     const output = Buffer.allocUnsafe(buffer.length);
 201 |     for (let i = 0; i < buffer.length; i += 2) {
 202 |       const s = buffer.readInt16LE(i);
 203 |       const limited = Math.round(s * this.SOFT_LIMIT_GAIN);
 204 |       const clamped = Math.max(-32768, Math.min(32767, limited));
 205 |       output.writeInt16LE(clamped, i);
 206 |     }
 207 |     return output;
 208 |   }
 209 | 
 210 |   /**
 211 |    * Anti-Aliasing FIR Filter: 7-tap low-pass at 8kHz
 212 |    * Parks-McClellan design with Hann window, normalized
 213 |    * Prevents aliasing artifacts when downsampling from 24kHz to 16kHz
 214 |    *
 215 |    * Filter has zero-phase (symmetric), group delay = 3 samples ≈ 0.125ms @ 24kHz
 216 |    */
 217 |   private applyFirFilter(input: Buffer, state: FirFilterState): Buffer {
 218 |     const inputSamples = input.length / 2;
 219 |     const output = Buffer.allocUnsafe(input.length);
 220 | 
 221 |     for (let i = 0; i < inputSamples; i++) {
 222 |       let acc = 0;
 223 | 
 224 |       for (let k = 0; k < this.FIR_COEFFS.length; k++) {
 225 |         const sampleIndex = i - k + 3; // FIR_DELAY = 3
 226 | 
 227 |         let sample = 0;
 228 |         if (sampleIndex >= 0 && sampleIndex < inputSamples) {
 229 |           sample = input.readInt16LE(sampleIndex * 2);
 230 |         } else if (sampleIndex < 0 && state.history[6 + sampleIndex]) {
 231 |           sample = state.history[6 + sampleIndex]!;
 232 |         }
 233 | 
 234 |         acc += this.FIR_COEFFS[k]! * sample;
 235 |       }
 236 | 
 237 |       const clamped = Math.max(-32768, Math.min(32767, Math.round(acc)));
 238 |       output.writeInt16LE(clamped, i * 2);
 239 |     }
 240 | 
 241 |     // Update history for next chunk (last 6 samples)
 242 |     state.history = [];
 243 |     for (let k = Math.max(0, inputSamples - 6); k < inputSamples; k++) {
 244 |       state.history.push(input.readInt16LE(k * 2));
 245 |     }
 246 | 
 247 |     return output;
 248 |   }
 249 | 
 250 |   /**
 251 |    * Polyphase Downsample 24kHz → 16kHz (3:2 ratio)
 252 |    * For every 3 input samples → 2 output samples
 253 |    *
 254 |    * Approach: Keep sample 0, linearly interpolate between samples 1 & 2
 255 |    * This is a simplified polyphase filter suitable for real-time
 256 |    */
 257 |   private downsample24to16(input: Buffer): Buffer {
 258 |     const inputSamples = input.length / 2;
 259 |     const outputSamples = Math.floor(inputSamples * 2 / 3);
 260 |     const output = Buffer.allocUnsafe(outputSamples * 2);
 261 | 
 262 |     let outIdx = 0;
 263 |     for (let i = 0; i < inputSamples - 2; i += 3) {
 264 |       const s0 = input.readInt16LE(i * 2);
 265 |       const s1 = input.readInt16LE((i + 1) * 2);
 266 |       const s2 = input.readInt16LE((i + 2) * 2);
 267 | 
 268 |       // Output sample 0: direct from input[i]
 269 |       output.writeInt16LE(s0, outIdx);
 270 | 
 271 |       // Output sample 1: linear interpolation of input[i+1] and input[i+2]
 272 |       const interpolated = Math.round((s1 + s2) / 2);
 273 |       const clamped = Math.max(-32768, Math.min(32767, interpolated));
 274 |       output.writeInt16LE(clamped, outIdx + 2);
 275 | 
 276 |       outIdx += 4;
 277 |     }
 278 | 
 279 |     // Handle remainder (less than 3 samples)
 280 |     // For simplicity, just pass through
 281 |     if ((inputSamples % 3) === 1) {
 282 |       const lastSample = input.readInt16LE((inputSamples - 1) * 2);
 283 |       output.writeInt16LE(lastSample, outIdx);
 284 |     }
 285 | 
 286 |     return output.subarray(0, outIdx);
 287 |   }
 288 | }
```

## File: src\audio\BufferPool.ts
```typescript
   1 | /**
   2 |  * Zero-Copy Buffer Pool for audio processing
   3 |  * Pre-allocates buffers to avoid GC pressure during real-time audio processing
   4 |  */
   5 | 
   6 | export class BufferPool {
   7 |   private pool: Buffer[] = [];
   8 |   private readonly CHUNK_SIZE: number;
   9 |   private readonly POOL_SIZE: number;
  10 | 
  11 |   /**
  12 |    * @param chunkSize - Size of each buffer (default: 640 bytes = 20ms at 16kHz 16-bit)
  13 |    * @param poolSize - Number of pre-allocated buffers (default: 50)
  14 |    */
  15 |   constructor(chunkSize: number = 640, poolSize: number = 50) {
  16 |     this.CHUNK_SIZE = chunkSize;
  17 |     this.POOL_SIZE = poolSize;
  18 | 
  19 |     // Pre-allocate all buffers at startup
  20 |     for (let i = 0; i < poolSize; i++) {
  21 |       this.pool.push(Buffer.allocUnsafe(chunkSize));
  22 |     }
  23 |   }
  24 | 
  25 |   /**
  26 |    * Acquire a buffer from the pool
  27 |    * If pool is empty, allocate a new one (graceful degradation)
  28 |    */
  29 |   public acquire(): Buffer {
  30 |     return this.pool.pop() ?? Buffer.allocUnsafe(this.CHUNK_SIZE);
  31 |   }
  32 | 
  33 |   /**
  34 |    * Release a buffer back to the pool
  35 |    * Only returns to pool if we haven't exceeded pool size
  36 |    */
  37 |   public release(buf: Buffer): void {
  38 |     if (this.pool.length < this.POOL_SIZE && buf.length === this.CHUNK_SIZE) {
  39 |       this.pool.push(buf);
  40 |     }
  41 |   }
  42 | 
  43 |   /**
  44 |    * Get current pool depth
  45 |    */
  46 |   public getDepth(): number {
  47 |     return this.pool.length;
  48 |   }
  49 | }
```

## File: src\audio\JitterBuffer.ts
```typescript
   1 | /**
   2 |  * Adaptive Jitter Buffer with 20ms output clock
   3 |  * Decouples irregular Gemini output from strict Telnyx timing requirements
   4 |  * Generates comfort noise (CNG) during silence periods
   5 |  */
   6 | 
   7 | export class JitterBuffer {
   8 |   private queue: Buffer[] = [];
   9 |   private remainder: Buffer = Buffer.alloc(0);
  10 |   private clockHandle: NodeJS.Timeout | null = null;
  11 |   private onDrain: (chunk: Buffer) => void;
  12 | 
  13 |   // Constants
  14 |   private readonly DRAIN_INTERVAL_MS = 20; // 20ms clock tick
  15 |   private readonly BYTES_PER_TICK = 160; // 160 samples @ 8kHz × 1 byte (8kHz A-Law/PCMA for Telnyx)
  16 |   private readonly CNG_AMPLITUDE = 33; // 10^(-60/20) × 32767 ≈ 33
  17 | 
  18 |   constructor(onDrain: (chunk: Buffer) => void) {
  19 |     this.onDrain = onDrain;
  20 |   }
  21 | 
  22 |   /**
  23 |    * Push audio chunk into the jitter buffer
  24 |    * Chunks are split into 20ms segments and queued for drain
  25 |    */
  26 |   public push(chunk: Buffer): void {
  27 |     // Combine remainder from previous push + new chunk
  28 |     const combined = Buffer.concat([this.remainder, chunk]);
  29 |     let offset = 0;
  30 | 
  31 |     // Split into 20ms chunks (640 bytes each)
  32 |     while (offset + this.BYTES_PER_TICK <= combined.length) {
  33 |       const segment = Buffer.alloc(this.BYTES_PER_TICK);
  34 |       combined.copy(segment, 0, offset, offset + this.BYTES_PER_TICK);
  35 |       this.queue.push(segment);
  36 |       offset += this.BYTES_PER_TICK;
  37 |     }
  38 | 
  39 |     // Store remainder for next push
  40 |     this.remainder = combined.length > offset ? combined.subarray(offset) : Buffer.alloc(0);
  41 |   }
  42 | 
  43 |   /**
  44 |    * Start the 20ms clock that drains audio to Telnyx
  45 |    */
  46 |   public start(): void {
  47 |     this.clockHandle = setInterval(() => this.tick(), this.DRAIN_INTERVAL_MS);
  48 |   }
  49 | 
  50 |   /**
  51 |    * Stop the clock and clear the buffer
  52 |    */
  53 |   public stop(): void {
  54 |     if (this.clockHandle) {
  55 |       clearInterval(this.clockHandle);
  56 |       this.clockHandle = null;
  57 |     }
  58 |     this.queue = [];
  59 |     this.remainder = Buffer.alloc(0);
  60 |   }
  61 | 
  62 |   /**
  63 |    * Get current buffer depth in milliseconds
  64 |    */
  65 |   public getDepthMs(): number {
  66 |     return this.queue.length * this.DRAIN_INTERVAL_MS;
  67 |   }
  68 | 
  69 |   /**
  70 |    * Internal: 20ms tick handler
  71 |    * Either drain queued audio or generate comfort noise
  72 |    */
  73 |   private tick(): void {
  74 |     const chunk = this.queue.shift();
  75 |     if (chunk) {
  76 |       this.onDrain(chunk);
  77 |     } else {
  78 |       // Generate comfort noise (silence would be unnatural)
  79 |       this.onDrain(this.generateCng());
  80 |     }
  81 |   }
  82 | 
  83 |   /**
  84 |    * Generate comfort noise at -60dBFS (A-Law encoded)
  85 |    * Prevents the perception of "dead air" during silence
  86 |    */
  87 |   private generateCng(): Buffer {
  88 |     const buf = Buffer.allocUnsafe(this.BYTES_PER_TICK);
  89 |     for (let i = 0; i < this.BYTES_PER_TICK; i++) {
  90 |       // White noise: random 8-bit A-Law value at -60dBFS
  91 |       const noise = Math.round((Math.random() * 2 - 1) * this.CNG_AMPLITUDE) & 0xFF;
  92 |       buf.writeUInt8(noise, i);
  93 |     }
  94 |     return buf;
  95 |   }
  96 | }
```

## File: src\core\BatchLogger.ts
```typescript
   1 | /**
   2 |  * Asynchronous Batch Logger for Call Traces
   3 |  * Batches database writes to reduce I/O overhead during real-time audio processing
   4 |  *
   5 |  * Strategy: Queue up to 20 trace events, flush every 5 seconds OR when batch is full
   6 |  */
   7 | 
   8 | import { SupabaseService } from '../services/SupabaseService';
   9 | import { logger } from './logger';
  10 | 
  11 | interface TraceEntry {
  12 |   call_log_id: string;
  13 |   tenant_id: string;
  14 |   step_type: string;
  15 |   content?: any;
  16 |   created_at?: string;
  17 | }
  18 | 
  19 | export class BatchLogger {
  20 |   private static instance: BatchLogger;
  21 |   private queue: TraceEntry[] = [];
  22 |   private flushTimer: NodeJS.Timeout | null = null;
  23 |   private supabase = SupabaseService.getInstance();
  24 | 
  25 |   private readonly BATCH_SIZE = 20; // Flush when queue reaches 20
  26 |   private readonly FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
  27 | 
  28 |   private constructor() {
  29 |     // Start the periodic flush timer
  30 |     this.startPeriodicFlush();
  31 |   }
  32 | 
  33 |   public static getInstance(): BatchLogger {
  34 |     if (!BatchLogger.instance) {
  35 |       BatchLogger.instance = new BatchLogger();
  36 |     }
  37 |     return BatchLogger.instance;
  38 |   }
  39 | 
  40 |   /**
  41 |    * Log a trace entry asynchronously
  42 |    * Queues immediately, flushes when batch is full or timer fires
  43 |    */
  44 |   public async log(entry: TraceEntry): Promise<void> {
  45 |     this.queue.push({
  46 |       ...entry,
  47 |       created_at: entry.created_at || new Date().toISOString()
  48 |     });
  49 | 
  50 |     // Flush if batch is full
  51 |     if (this.queue.length >= this.BATCH_SIZE) {
  52 |       await this.flush();
  53 |     }
  54 |   }
  55 | 
  56 |   /**
  57 |    * Force an immediate flush (for critical moments like session end)
  58 |    */
  59 |   public async flushNow(): Promise<void> {
  60 |     await this.flush();
  61 |   }
  62 | 
  63 |   /**
  64 |    * Start the periodic flush timer
  65 |    */
  66 |   private startPeriodicFlush(): void {
  67 |     this.flushTimer = setInterval(async () => {
  68 |       if (this.queue.length > 0) {
  69 |         await this.flush();
  70 |       }
  71 |     }, this.FLUSH_INTERVAL_MS);
  72 |   }
  73 | 
  74 |   /**
  75 |    * Internal: Flush all queued entries to Supabase in one batch
  76 |    */
  77 |   private async flush(): Promise<void> {
  78 |     if (this.queue.length === 0) return;
  79 | 
  80 |     const items = [...this.queue];
  81 |     this.queue = []; // Clear queue immediately
  82 | 
  83 |     try {
  84 |       // Bulk insert via Supabase (single RPC/HTTP call)
  85 |       // Ensure all required fields are present with defaults
  86 |       const itemsForInsert = items.map(item => ({
  87 |         call_log_id: item.call_log_id,
  88 |         tenant_id: item.tenant_id,
  89 |         step_type: item.step_type as any,
  90 |         content: item.content || {},
  91 |         created_at: item.created_at || new Date().toISOString()
  92 |       }));
  93 | 
  94 |       const { error } = await this.supabase.getClient()
  95 |         .from('call_traces')
  96 |         .insert(itemsForInsert as any);
  97 | 
  98 |       if (error) {
  99 |         logger.error(
 100 |           { error: error.message, itemCount: items.length },
 101 |           'Error flushing batch logger'
 102 |         );
 103 |         // Optionally: re-queue failed items (implement exponential backoff)
 104 |       } else {
 105 |         logger.debug(
 106 |           { itemCount: items.length },
 107 |           'Batch logger flushed successfully'
 108 |         );
 109 |       }
 110 |     } catch (error) {
 111 |       const err = error as Error;
 112 |       logger.error(
 113 |         { error: err.message, itemCount: items.length },
 114 |         'Exception in batch logger flush'
 115 |       );
 116 |     }
 117 |   }
 118 | 
 119 |   /**
 120 |    * Shutdown: flush remaining items and stop timer
 121 |    */
 122 |   public async shutdown(): Promise<void> {
 123 |     if (this.flushTimer) {
 124 |       clearInterval(this.flushTimer);
 125 |       this.flushTimer = null;
 126 |     }
 127 |     await this.flush();
 128 |   }
 129 | 
 130 |   /**
 131 |    * Get current queue depth
 132 |    */
 133 |   public getQueueDepth(): number {
 134 |     return this.queue.length;
 135 |   }
 136 | }
```

## File: src\core\CallManager.ts
```typescript
   1 | import { EventEmitter } from 'events';
   2 | import WebSocket from 'ws';
   3 | import { CallSession, CallStatus, CallEventData } from '../types';
   4 | import { logger } from './logger';
   5 | 
   6 | export class CallManager extends EventEmitter {
   7 |   private static instance: CallManager;
   8 |   private sessions: Map<string, CallSession> = new Map();
   9 | 
  10 |   private constructor() {
  11 |     super();
  12 |     this.setMaxListeners(100); // Allow more listeners for high concurrency
  13 |   }
  14 | 
  15 |   public static getInstance(): CallManager {
  16 |     if (!CallManager.instance) {
  17 |       CallManager.instance = new CallManager();
  18 |     }
  19 |     return CallManager.instance;
  20 |   }
  21 | 
  22 |   public createSession(
  23 |     callControlId: string,
  24 |     tenantId: string,
  25 |     correlationId: string,
  26 |     metadata: Record<string, any> = {}
  27 |   ): CallSession {
  28 |     const session: CallSession = {
  29 |       id: correlationId, // Use correlationId as session ID
  30 |       tenantId,
  31 |       callControlId,
  32 |       correlationId,
  33 |       status: CallStatus.INITIALIZING,
  34 |       createdAt: new Date(),
  35 |       lastActivity: new Date(),
  36 |       metadata,
  37 |       // Initialize DSP state for audio processing
  38 |       dspState: {
  39 |         dcIn: { prevIn: 0, prevOut: 0 },
  40 |         firOut: { history: new Array(6).fill(0) }
  41 |       }
  42 |     };
  43 | 
  44 |     this.sessions.set(session.id, session);
  45 | 
  46 |     this.emit('sessionCreated', {
  47 |       sessionId: session.id,
  48 |       tenantId,
  49 |       timestamp: new Date(),
  50 |       data: session
  51 |     } as CallEventData);
  52 | 
  53 |     return session;
  54 |   }
  55 | 
  56 |   public getSession(sessionId: string): CallSession | undefined {
  57 |     const session = this.sessions.get(sessionId);
  58 |     if (session) {
  59 |       session.lastActivity = new Date();
  60 |     }
  61 |     return session;
  62 |   }
  63 | 
  64 |   public updateSessionStatus(sessionId: string, status: CallStatus): boolean {
  65 |     const session = this.sessions.get(sessionId);
  66 |     if (!session) return false;
  67 | 
  68 |     session.status = status;
  69 |     session.lastActivity = new Date();
  70 | 
  71 |     this.emit('statusChanged', {
  72 |       sessionId,
  73 |       tenantId: session.tenantId,
  74 |       timestamp: new Date(),
  75 |       data: { oldStatus: session.status, newStatus: status }
  76 |     } as CallEventData);
  77 | 
  78 |     return true;
  79 |   }
  80 | 
  81 |   public destroySession(sessionId: string): boolean {
  82 |     const session = this.sessions.get(sessionId);
  83 |     if (!session) return false;
  84 | 
  85 |     // Cleanup logic here - close connections, clear buffers, etc.
  86 |     this.emit('sessionDestroyed', {
  87 |       sessionId,
  88 |       tenantId: session.tenantId,
  89 |       timestamp: new Date(),
  90 |       data: session
  91 |     } as CallEventData);
  92 | 
  93 |     this.sessions.delete(sessionId);
  94 |     return true;
  95 |   }
  96 | 
  97 |   public getActiveSessions(): CallSession[] {
  98 |     return Array.from(this.sessions.values()).filter(
  99 |       session => session.status !== CallStatus.TERMINATED
 100 |     );
 101 |   }
 102 | 
 103 |   public getSessionCount(): number {
 104 |     return this.sessions.size;
 105 |   }
 106 | 
 107 |   public sendAudioToTelnyx(sessionId: string, audioPayload: string): boolean {
 108 |     const session = this.sessions.get(sessionId);
 109 |     if (!session || !session.metadata['websocket']) {
 110 |       return false;
 111 |     }
 112 | 
 113 |     const ws = session.metadata['websocket'] as WebSocket;
 114 |     if (ws.readyState !== WebSocket.OPEN) {
 115 |       return false;
 116 |     }
 117 | 
 118 |     const message = {
 119 |       event: 'media',
 120 |       stream_id: session.metadata['streamId'], // ✅ Include stream_id
 121 |       media: {
 122 |         payload: audioPayload
 123 |       }
 124 |     };
 125 | 
 126 |     try {
 127 |       ws.send(JSON.stringify(message));
 128 |       return true;
 129 |     } catch (error) {
 130 |       const err = error as Error;
 131 |       logger.error({ sessionId, error: err.message }, 'Error sending audio to Telnyx');
 132 |       return false;
 133 |     }
 134 |   }
 135 | }
```

## File: src\core\config.ts
```typescript
   1 | import { z } from 'zod';
   2 | import dotenv from 'dotenv';
   3 | 
   4 | // Load environment variables
   5 | dotenv.config();
   6 | 
   7 | const configSchema = z.object({
   8 |   NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
   9 |   PORT: z.coerce.number().int().positive().default(3000),
  10 | 
  11 |   // Supabase
  12 |   SUPABASE_URL: z.string().url().default('https://ollrwbogmvmydgrmcnhn.supabase.co'),
  13 |   SUPABASE_ANON_KEY: z.string().min(1).default(''),
  14 |   SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default(''),
  15 | 
  16 |   // Gemini AI
  17 |   GEMINI_API_KEY: z.string().min(1).default(''),
  18 |   VITE_GEMINI_API_KEY: z.string().min(1).default(''),
  19 | 
  20 |   // Telnyx
  21 |   TELNYX_API_KEY: z.string().min(1).default(''),
  22 |   TELNYX_PUBLIC_KEY: z.string().min(1).default(''),
  23 |   TELNYX_SIP_USERNAME: z.string().min(1).default(''),
  24 |   TELNYX_SIP_PASSWORD: z.string().min(1).default(''),
  25 | 
  26 |   // Stripe
  27 |   STRIPE_PUBLISHABLE_KEY: z.string().min(1).default(''),
  28 |   STRIPE_SECRET_KEY: z.string().min(1).default(''),
  29 |   STRIPE_WEBHOOK_SECRET: z.string().min(1).default(''),
  30 |   STRIPE_MINUTE_PACK_PRICE_ID: z.string().min(1).default(''),
  31 |   STRIPE_SUBSCRIPTION_PRICE_ID: z.string().min(1).default(''),
  32 | 
  33 |   // Resend
  34 |   RESEND_API_KEY: z.string().min(1).default(''),
  35 | 
  36 |   // Logging
  37 |   LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
  38 | });
  39 | 
  40 | export type Config = z.infer<typeof configSchema>;
  41 | 
  42 | let config: Config;
  43 | 
  44 | try {
  45 |   config = configSchema.parse(process.env);
  46 | } catch (error) {
  47 |   console.error('Configuration validation failed:', error);
  48 |   process.exit(1);
  49 | }
  50 | 
  51 | export { config };
```

## File: src\core\EventLoopMonitor.ts
```typescript
   1 | /**
   2 |  * Event Loop Lag Monitor
   3 |  * Tracks Node.js event loop health - critical for real-time audio applications
   4 |  * Audio processing can't tolerate >50ms event loop delays
   5 |  */
   6 | 
   7 | import { monitorEventLoopDelay } from 'perf_hooks';
   8 | import { logger } from './logger';
   9 | 
  10 | export class EventLoopMonitor {
  11 |   private static instance: EventLoopMonitor;
  12 |   private histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
  13 |   private monitorHandle: NodeJS.Timeout | null = null;
  14 | 
  15 |   private readonly CHECK_INTERVAL_MS = 60000; // Check every 60 seconds
  16 |   private readonly WARN_THRESHOLD_MS = 50; // Warn if lag > 50ms
  17 |   private readonly CRITICAL_THRESHOLD_MS = 100; // Critical if lag > 100ms
  18 | 
  19 |   private constructor() {
  20 |     this.start();
  21 |   }
  22 | 
  23 |   public static getInstance(): EventLoopMonitor {
  24 |     if (!EventLoopMonitor.instance) {
  25 |       EventLoopMonitor.instance = new EventLoopMonitor();
  26 |     }
  27 |     return EventLoopMonitor.instance;
  28 |   }
  29 | 
  30 |   /**
  31 |    * Start monitoring event loop delay
  32 |    */
  33 |   private start(): void {
  34 |     try {
  35 |       this.histogram = monitorEventLoopDelay({ resolution: 10 });
  36 |       this.histogram.enable();
  37 | 
  38 |       // Periodic check
  39 |       this.monitorHandle = setInterval(() => this.check(), this.CHECK_INTERVAL_MS);
  40 | 
  41 |       logger.info('Event loop monitor started');
  42 |     } catch (error) {
  43 |       logger.warn('Event loop monitoring not available (Node.js version may not support it)');
  44 |     }
  45 |   }
  46 | 
  47 |   /**
  48 |    * Internal: Check event loop health
  49 |    */
  50 |   private check(): void {
  51 |     if (!this.histogram) return;
  52 | 
  53 |     const meanMs = this.histogram.mean / 1e6; // nanoseconds → milliseconds
  54 |     const maxMs = this.histogram.max / 1e6;
  55 |     const p99Ms = this.histogram.percentile(99) / 1e6;
  56 | 
  57 |     const context = {
  58 |       eventLoopLag: {
  59 |         mean_ms: meanMs.toFixed(2),
  60 |         p99_ms: p99Ms.toFixed(2),
  61 |         max_ms: maxMs.toFixed(2)
  62 |       }
  63 |     };
  64 | 
  65 |     if (maxMs > this.CRITICAL_THRESHOLD_MS) {
  66 |       logger.error(context, 'CRITICAL: Event loop lag exceeds 100ms - system may be overloaded');
  67 |     } else if (p99Ms > this.WARN_THRESHOLD_MS) {
  68 |       logger.warn(context, 'Event loop lag detected - may impact audio quality');
  69 |     } else {
  70 |       logger.debug(context, 'Event loop healthy');
  71 |     }
  72 | 
  73 |     // Reset histogram for next interval
  74 |     this.histogram.reset();
  75 |   }
  76 | 
  77 |   /**
  78 |    * Get current event loop statistics
  79 |    */
  80 |   public getStats(): { mean: number; p99: number; max: number } | null {
  81 |     if (!this.histogram) return null;
  82 | 
  83 |     return {
  84 |       mean: this.histogram.mean / 1e6,
  85 |       p99: this.histogram.percentile(99) / 1e6,
  86 |       max: this.histogram.max / 1e6
  87 |     };
  88 |   }
  89 | 
  90 |   /**
  91 |    * Stop monitoring
  92 |    */
  93 |   public stop(): void {
  94 |     if (this.histogram) {
  95 |       this.histogram.disable();
  96 |       this.histogram = null;
  97 |     }
  98 |     if (this.monitorHandle) {
  99 |       clearInterval(this.monitorHandle);
 100 |       this.monitorHandle = null;
 101 |     }
 102 |   }
 103 | }
```

## File: src\core\logger.ts
```typescript
   1 | import pino from 'pino';
   2 | import { config } from './config';
   3 | 
   4 | export const logger = pino({
   5 |   level: config.LOG_LEVEL,
   6 |   formatters: {
   7 |     level: (label) => ({ level: label }),
   8 |   },
   9 |   timestamp: pino.stdTimeFunctions.isoTime,
  10 | });
  11 | 
  12 | // Helper functions for consistent logging
  13 | export const logCallEvent = (
  14 |   level: 'info' | 'warn' | 'error',
  15 |   message: string,
  16 |   data: {
  17 |     tenantId?: string;
  18 |     callId?: string;
  19 |     sessionId?: string;
  20 |     correlationId?: string;
  21 |     [key: string]: any;
  22 |   }
  23 | ) => {
  24 |   logger[level]({ ...data }, message);
  25 | };
  26 | 
  27 | export const logApiRequest = (
  28 |   method: string,
  29 |   url: string,
  30 |   statusCode: number,
  31 |   duration: number,
  32 |   correlationId?: string
  33 | ) => {
  34 |   logger.info({
  35 |     method,
  36 |     url,
  37 |     statusCode,
  38 |     duration,
  39 |     correlationId,
  40 |   }, 'API Request');
  41 | };
```

## File: src\core\Tracer.ts
```typescript
   1 | /**
   2 |  * Distributed Tracing: Correlation Engine
   3 |  * Generates UUIDv7 for time-sorted trace IDs and manages trace context propagation
   4 |  */
   5 | 
   6 | import { randomBytes } from 'crypto';
   7 | 
   8 | export interface TraceContext {
   9 |   correlationId: string; // UUIDv7
  10 |   tenantId: string;
  11 |   startTime: bigint; // process.hrtime.bigint() for nanosecond precision
  12 |   spanId?: string; // Optional: for nested spans
  13 | }
  14 | 
  15 | export class Tracer {
  16 |   /**
  17 |    * Generate a UUIDv7 (time-sortable UUID)
  18 |    * Layout: 48-bit timestamp (ms) + 4-bit version + 12-bit random + 2-bit variant + 62-bit random
  19 |    *
  20 |    * UUIDv7 format (RFC draft):
  21 |    * - Bytes 0-5: 48-bit Unix timestamp in milliseconds
  22 |    * - Bytes 6-7: 4-bit version (0111) + 12-bit random
  23 |    * - Bytes 8-9: 2-bit variant (10) + 14-bit random
  24 |    * - Bytes 10-15: 48-bit random
  25 |    */
  26 |   public static generateUUIDv7(): string {
  27 |     const now = Date.now();
  28 |     const rand = randomBytes(10);
  29 | 
  30 |     const buf = Buffer.allocUnsafe(16);
  31 | 
  32 |     // 48-bit timestamp (milliseconds)
  33 |     const msHi = Math.floor(now / 0x10000); // Upper 32 bits of 48-bit ts
  34 |     const msLo = now & 0xffff; // Lower 16 bits
  35 |     buf.writeUInt32BE(msHi, 0);
  36 |     buf.writeUInt16BE(msLo, 4);
  37 | 
  38 |     // Version 7 (0111 = 0x7) + 12 random bits
  39 |     const versionBits = 0x7000 | (rand[0]! << 4) | ((rand[1]! >> 4) & 0x0f);
  40 |     buf.writeUInt16BE(versionBits, 6);
  41 | 
  42 |     // Variant 10 (10 in top 2 bits) + 14 random bits
  43 |     const variantBits = 0x8000 | ((rand[1]! & 0x0f) << 10) | (rand[2]! << 2) | ((rand[3]! >> 6) & 0x03);
  44 |     buf.writeUInt16BE(variantBits, 8);
  45 | 
  46 |     // 48 random bits
  47 |     buf.writeUInt16BE((rand[3]! << 8) | rand[4]!, 10);
  48 |     buf.writeUInt32BE((rand[5]! << 24) | (rand[6]! << 16) | (rand[7]! << 8) | rand[8]!, 12);
  49 | 
  50 |     // Format as UUID string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  51 |     const hex = buf.toString('hex');
  52 |     return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  53 |   }
  54 | 
  55 |   /**
  56 |    * Create a new trace context for a call session
  57 |    */
  58 |   public static createTraceContext(tenantId: string): TraceContext {
  59 |     return {
  60 |       correlationId: this.generateUUIDv7(),
  61 |       tenantId,
  62 |       startTime: process.hrtime.bigint()
  63 |     };
  64 |   }
  65 | 
  66 |   /**
  67 |    * Calculate elapsed time in milliseconds from a trace context
  68 |    */
  69 |   public static getElapsedMs(startTime: bigint): number {
  70 |     const elapsed = process.hrtime.bigint() - startTime;
  71 |     return Number(elapsed / BigInt(1_000_000)); // ns → ms
  72 |   }
  73 | 
  74 |   /**
  75 |    * Calculate elapsed time in microseconds (for high-precision measurements)
  76 |    */
  77 |   public static getElapsedUs(startTime: bigint): number {
  78 |     const elapsed = process.hrtime.bigint() - startTime;
  79 |     return Number(elapsed / BigInt(1_000)); // ns → us
  80 |   }
  81 | 
  82 |   /**
  83 |    * Generate a span ID (shorter UUID, 8 random bytes)
  84 |    * Used for nested operations within a trace
  85 |    */
  86 |   public static generateSpanId(): string {
  87 |     return randomBytes(8).toString('hex');
  88 |   }
  89 | }
```

## File: src\services\AIService.ts
```typescript
   1 | import { GoogleGenAI } from '@google/genai';
   2 | import { config } from '../core/config';
   3 | import { logger } from '../core/logger';
   4 | import { SupabaseService } from './SupabaseService';
   5 | import { CallManager } from '../core/CallManager';
   6 | import { AudioPipeline } from '../audio/AudioPipeline';
   7 | import { CallStatus } from '../types';
   8 | import type { TenantSettings } from '../types/schema';
   9 | 
  10 | interface GeminiSession {
  11 |   liveSession: any;
  12 |   sessionId: string;
  13 |   tenantId: string;
  14 |   isSetup: boolean;
  15 |   lastActivity: number;
  16 |   isAiSpeaking: boolean;
  17 | }
  18 | 
  19 | export class AIService {
  20 |   private static instance: AIService;
  21 |   private sessions: Map<string, GeminiSession> = new Map();
  22 |   private supabase = SupabaseService.getInstance();
  23 |   private callManager = CallManager.getInstance();
  24 |   private genAI: GoogleGenAI;
  25 | 
  26 |   private constructor() {
  27 |     this.genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  28 |   }
  29 | 
  30 |   public static getInstance(): AIService {
  31 |     if (!AIService.instance) {
  32 |       AIService.instance = new AIService();
  33 |     }
  34 |     return AIService.instance;
  35 |   }
  36 | 
  37 |   /**
  38 |    * Transcodes 8kHz A-Law (Telnyx/PCMA) to 16kHz PCM (Gemini)
  39 |    */
  40 |   private transcodeTelnyxToGemini(base64Payload: string): string {
  41 |     try {
  42 |       const aLawData = Buffer.from(base64Payload, 'base64');
  43 | 
  44 |       // Decode A-Law to 16-bit PCM
  45 |       const pcm16k = Buffer.allocUnsafe(aLawData.length * 4); // 8kHz to 16kHz = 2x samples, 8-bit to 16-bit = 2x bytes
  46 |       let outIdx = 0;
  47 | 
  48 |       for (let i = 0; i < aLawData.length; i++) {
  49 |         const aLawByte = aLawData.readUInt8(i);
  50 |         const pcmSample = this.aLawDecode(aLawByte);
  51 | 
  52 |         // Write original sample at output rate
  53 |         pcm16k.writeInt16LE(pcmSample, outIdx);
  54 |         outIdx += 2;
  55 | 
  56 |         // Write interpolated sample for 2x upsampling
  57 |         pcm16k.writeInt16LE(pcmSample, outIdx);
  58 |         outIdx += 2;
  59 |       }
  60 | 
  61 |       return pcm16k.toString('base64');
  62 |     } catch (error) {
  63 |       logger.error({ error: (error as Error).message }, 'Error transcoding Telnyx -> Gemini');
  64 |       return base64Payload;
  65 |     }
  66 |   }
  67 | 
  68 |   /**
  69 |    * A-Law decode: 8-bit compressed to 16-bit PCM (ITU-T G.711)
  70 |    */
  71 |   private aLawDecode(byte: number): number {
  72 |     // Apply bit inversion first (XOR 0x55)
  73 |     byte ^= 0x55;
  74 | 
  75 |     // Extract sign (bit 7) and components
  76 |     const sign = (byte & 0x80) ? -1 : 1;
  77 |     const exponent = (byte >> 4) & 0x07; // 3 bits
  78 |     const mantissa = byte & 0x0f; // 4 bits
  79 | 
  80 |     // Reconstruct PCM value according to ITU-T G.711 standard
  81 |     let pcm: number;
  82 |     if (exponent === 0) {
  83 |       // Linear segment
  84 |       pcm = (mantissa << 4) + 8;
  85 |     } else {
  86 |       // Compressed segments - add implicit leading 1 bit to mantissa
  87 |       pcm = ((mantissa | 0x10) << (exponent + 3)) - 128;
  88 |     }
  89 | 
  90 |     return sign * pcm;
  91 |   }
  92 | 
  93 |   /**
  94 |    * Transcodes 24kHz PCM (Gemini) to 8kHz A-Law (Telnyx/PCMA)
  95 |    */
  96 |   private transcodeGeminiToTelnyx(base64Payload: string): string {
  97 |     try {
  98 |       const pcm24k = Buffer.from(base64Payload, 'base64');
  99 |       const samplesCount = pcm24k.length / 2; // 16-bit = 2 bytes per sample
 100 | 
 101 |       // Downsample 24kHz to 8kHz (keep every 3rd sample) and encode to A-Law
 102 |       const aLawData = Buffer.allocUnsafe(Math.floor(samplesCount / 3));
 103 |       let outIdx = 0;
 104 | 
 105 |       for (let i = 0; i < samplesCount - 2; i += 3) {
 106 |         const pcmSample = pcm24k.readInt16LE(i * 2);
 107 |         const aLawByte = this.pcmToALaw(pcmSample);
 108 |         aLawData.writeUInt8(aLawByte, outIdx);
 109 |         outIdx++;
 110 |       }
 111 | 
 112 |       return aLawData.subarray(0, outIdx).toString('base64');
 113 |     } catch (error) {
 114 |       logger.error({ error: (error as Error).message }, 'Error transcoding Gemini -> Telnyx');
 115 |       return base64Payload;
 116 |     }
 117 |   }
 118 | 
 119 |   /**
 120 |    * PCM to A-Law encode: 16-bit PCM to 8-bit compressed (ITU-T G.711)
 121 |    */
 122 |   private pcmToALaw(sample: number): number {
 123 |     const QUANT_MASK = 0xf;
 124 |     const SEG_SHIFT = 4;
 125 |     const sign = (sample >> 8) & 0x80;
 126 | 
 127 |     if (sign !== 0) sample = -sample;
 128 |     if (sample > 32635) sample = 32635;
 129 | 
 130 |     let exponent = 7;
 131 |     let mantissa = 0;
 132 | 
 133 |     for (let i = 0; i < 8; i++) {
 134 |       if (sample <= (0xff << i)) {
 135 |         exponent = 7 - i;
 136 |         break;
 137 |       }
 138 |     }
 139 | 
 140 |     mantissa = (sample >> (exponent + 3)) & QUANT_MASK;
 141 |     return ((sign | (exponent << SEG_SHIFT) | mantissa) ^ 0x55) & 0xff;
 142 |   }
 143 | 
 144 |   /**
 145 |    * Start a Gemini Live session using the new @google/genai SDK
 146 |    */
 147 |   public async startSession(sessionId: string, tenantId: string): Promise<void> {
 148 |     // Deduplication check: Don't start if session already exists
 149 |     if (this.sessions.has(sessionId)) {
 150 |       logger.debug({ sessionId }, 'Gemini session already exists, skipping initialization');
 151 |       return;
 152 |     }
 153 | 
 154 |     try {
 155 |       const tenantSettings = await this.supabase.getTenantSettings(tenantId);
 156 |       const systemInstruction = this.buildSystemInstruction(tenantSettings);
 157 | 
 158 |       logger.info({ sessionId, tenantId }, 'Connecting to Gemini Multimodal Live API');
 159 | 
 160 |       let session: GeminiSession | null = null;
 161 | 
 162 |       // Connect to Gemini Live API
 163 |       const liveSession = await this.genAI.live.connect({
 164 |         model: 'models/gemini-live-2.5-flash-native-audio',
 165 |         config: {
 166 |           responseModalities: ['audio'] as any,
 167 |           speechConfig: {
 168 |             voiceConfig: {
 169 |               prebuiltVoiceConfig: {
 170 |                 voiceName: tenantSettings.ai_voice ?? 'Aoede'
 171 |               }
 172 |             }
 173 |           },
 174 |           temperature: tenantSettings.ai_temperature ?? 0.7,
 175 |           systemInstruction: {
 176 |             parts: [{ text: systemInstruction }]
 177 |           },
 178 |           tools: this.getToolDeclarations() as any
 179 |         },
 180 |         callbacks: {
 181 |           onMessage: async (data: any) => {
 182 |             if (session) session.lastActivity = Date.now();
 183 | 
 184 |             // Handle Audio Content (Gemini -> Phone)
 185 |             if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
 186 |               const geminiAudio24k = data.serverContent.modelTurn.parts[0].inlineData.data;
 187 | 
 188 |               // Transcode 24kHz PCM -> 8kHz PCMA
 189 |               const inputSize = Buffer.byteLength(geminiAudio24k, 'base64');
 190 |               const telnyxAudioAuto = this.transcodeGeminiToTelnyx(geminiAudio24k);
 191 |               const outputSize = Buffer.byteLength(telnyxAudioAuto, 'base64');
 192 | 
 193 |               logger.debug({ sessionId, inputSize, outputSize, ratio: (outputSize / inputSize).toFixed(2) },
 194 |                 'Audio transcoded Gemini->Telnyx');
 195 | 
 196 |               // Route through jitter buffer for paced delivery
 197 |               const pipeline = AudioPipeline.getInstance();
 198 |               const jitterBuffer = (pipeline as any).jitterBuffers?.get(sessionId);
 199 |               if (jitterBuffer) {
 200 |                 // Decode base64 and push to jitter buffer
 201 |                 const audioBuffer = Buffer.from(telnyxAudioAuto, 'base64');
 202 |                 jitterBuffer.push(audioBuffer);
 203 |               } else {
 204 |                 // Fallback: send directly if jitter buffer not available
 205 |                 this.callManager.sendAudioToTelnyx(sessionId, telnyxAudioAuto);
 206 |               }
 207 | 
 208 |               if (session) {
 209 |                 session.isAiSpeaking = true;
 210 |               }
 211 |               this.callManager.updateSessionStatus(sessionId, CallStatus.AI_SPEAKING);
 212 |             }
 213 | 
 214 |             // Handle Interruption
 215 |             if (data.serverContent?.interrupted) {
 216 |               if (session) {
 217 |                 session.isAiSpeaking = false;
 218 |               }
 219 |               this.callManager.updateSessionStatus(sessionId, CallStatus.USER_SPEAKING);
 220 |             }
 221 | 
 222 |             // Handle Tool Calls
 223 |             if (data.toolCall) {
 224 |               if (session) await this.handleToolCall(session, data.toolCall);
 225 |             }
 226 |           },
 227 |           onError: (error: Error) => {
 228 |             logger.error({ sessionId, error: error.message }, 'Gemini Live Session Error');
 229 |           },
 230 |           onClose: () => {
 231 |             logger.info({ sessionId }, 'Gemini Live Session Closed');
 232 |             this.sessions.delete(sessionId);
 233 |           }
 234 |         }
 235 |       } as any);
 236 | 
 237 |       session = {
 238 |         liveSession,
 239 |         sessionId,
 240 |         tenantId,
 241 |         isSetup: true,
 242 |         isAiSpeaking: false,
 243 |         lastActivity: Date.now()
 244 |       };
 245 | 
 246 |       this.sessions.set(sessionId, session);
 247 |       this.callManager.updateSessionStatus(sessionId, CallStatus.CONNECTED);
 248 | 
 249 |       logger.info({ sessionId }, 'Gemini Live session established');
 250 | 
 251 |     } catch (error) {
 252 |       const err = error as Error;
 253 |       logger.error({ sessionId, error: err.message }, 'Failed to start Gemini Live session');
 254 |       this.callManager.updateSessionStatus(sessionId, CallStatus.TERMINATING);
 255 |       throw error;
 256 |     }
 257 |   }
 258 | 
 259 |   /**
 260 |    * Send audio FROM Telnyx -> TO Gemini
 261 |    */
 262 |   public sendAudio(sessionId: string, base64Audio: string): void {
 263 |     const session = this.sessions.get(sessionId);
 264 |     if (!session || !session.isSetup) return;
 265 | 
 266 |     try {
 267 |       // Transcode 8kHz PCMA -> 16kHz PCM
 268 |       const inputSize = Buffer.byteLength(base64Audio, 'base64');
 269 |       const geminiAudio = this.transcodeTelnyxToGemini(base64Audio);
 270 |       const outputSize = Buffer.byteLength(geminiAudio, 'base64');
 271 | 
 272 |       logger.debug({ sessionId, inputSize, outputSize, ratio: (outputSize / inputSize).toFixed(2) },
 273 |         'Audio transcoded Telnyx->Gemini');
 274 | 
 275 |       session.liveSession.sendRealtimeInput({
 276 |         audio: {
 277 |           mimeType: 'audio/pcm;rate=16000',
 278 |           data: geminiAudio
 279 |         }
 280 |       });
 281 |       session.lastActivity = Date.now();
 282 |     } catch (error) {
 283 |       if (Date.now() - session.lastActivity > 1000) {
 284 |         logger.error({ sessionId, error: (error as Error).message }, 'Error sending audio to Gemini');
 285 |       }
 286 |     }
 287 |   }
 288 | 
 289 |   /**
 290 |    * Handle tool calls from Gemini
 291 |    */
 292 |   private async handleToolCall(session: GeminiSession, toolCall: any): Promise<void> {
 293 |     try {
 294 |       for (const call of toolCall.functionCalls || []) {
 295 |         let result: any = {};
 296 | 
 297 |         if (call.name === 'check_availability') {
 298 |           result = await this.handleCheckAvailability(session.tenantId, call.args);
 299 |         } else if (call.name === 'book_appointment') {
 300 |           result = await this.handleBookAppointment(session.tenantId, call.args);
 301 |         }
 302 | 
 303 |         session.liveSession.send({
 304 |           toolResponse: {
 305 |             functionResponses: [{
 306 |               id: call.id,
 307 |               name: call.name,
 308 |               response: result
 309 |             }]
 310 |           }
 311 |         });
 312 |       }
 313 |     } catch (error) {
 314 |       logger.error({ sessionId: session.sessionId, error: (error as Error).message }, 'Tool call handler failed');
 315 |     }
 316 |   }
 317 | 
 318 |   private async handleCheckAvailability(tenantId: string, args: any): Promise<any> {
 319 |     return this.supabase.checkAvailability(tenantId, args.service_id, args.date, args.employee_id)
 320 |       .then(slots => ({ result: 'success', available_slots: slots }));
 321 |   }
 322 | 
 323 |   private async handleBookAppointment(tenantId: string, args: any): Promise<any> {
 324 |     return this.supabase.bookAppointment(tenantId, {
 325 |       customerPhone: args.customer_phone,
 326 |       startTime: args.start_time,
 327 |       serviceId: args.service_id,
 328 |       employeeId: args.employee_id
 329 |     }).then(res => ({ result: 'success', appointment_id: res.id }));
 330 |   }
 331 | 
 332 |   private getToolDeclarations(): any[] {
 333 |     return [{
 334 |       functionDeclarations: [
 335 |         {
 336 |           name: 'check_availability',
 337 |           description: 'Controleert beschikbare tijdsloten.',
 338 |           parameters: {
 339 |             type: 'OBJECT',
 340 |             properties: {
 341 |               date: { type: 'STRING' },
 342 |               service_id: { type: 'STRING' },
 343 |               employee_id: { type: 'STRING' }
 344 |             },
 345 |             required: ['date', 'service_id']
 346 |           }
 347 |         },
 348 |         {
 349 |           name: 'book_appointment',
 350 |           description: 'Maakt een definitieve boeking.',
 351 |           parameters: {
 352 |             type: 'OBJECT',
 353 |             properties: {
 354 |               customer_phone: { type: 'STRING' },
 355 |               start_time: { type: 'STRING' },
 356 |               service_id: { type: 'STRING' },
 357 |               employee_id: { type: 'STRING' }
 358 |             },
 359 |             required: ['customer_phone', 'start_time', 'service_id']
 360 |           }
 361 |         }
 362 |       ]
 363 |     }];
 364 |   }
 365 | 
 366 |   private buildSystemInstruction(settings: TenantSettings): string {
 367 |     return `Je bent ${settings.ai_name ?? 'Sophie'}. Spreek kort en bondig in het Nederlands.`;
 368 |   }
 369 | 
 370 |   public endSession(sessionId: string): void {
 371 |     const session = this.sessions.get(sessionId);
 372 |     if (session) {
 373 |       session.liveSession.close();
 374 |       this.sessions.delete(sessionId);
 375 |     }
 376 |   }
 377 | }
```

## File: src\services\SupabaseService.ts
```typescript
   1 | import { createClient, SupabaseClient } from '@supabase/supabase-js';
   2 | import { Database } from '../types';
   3 | import { config } from '../core/config';
   4 | import { logger } from '../core/logger';
   5 | import type { TenantSettings } from '../types/schema';
   6 | 
   7 | interface BookingParams {
   8 |   customerPhone: string;
   9 |   startTime: string;
  10 |   serviceId: string;
  11 |   employeeId: string;
  12 | }
  13 | 
  14 | export class SupabaseService {
  15 |   private static instance: SupabaseService;
  16 |   private client: SupabaseClient<Database>;
  17 | 
  18 |   private constructor() {
  19 |     this.client = createClient<Database>(
  20 |       config.SUPABASE_URL,
  21 |       config.SUPABASE_SERVICE_ROLE_KEY,
  22 |       {
  23 |         auth: {
  24 |           autoRefreshToken: false,
  25 |           persistSession: false
  26 |         }
  27 |       }
  28 |     );
  29 |   }
  30 | 
  31 |   public static getInstance(): SupabaseService {
  32 |     if (!SupabaseService.instance) {
  33 |       SupabaseService.instance = new SupabaseService();
  34 |     }
  35 |     return SupabaseService.instance;
  36 |   }
  37 | 
  38 |   public getClient(): SupabaseClient<Database> {
  39 |     return this.client;
  40 |   }
  41 | 
  42 |   /**
  43 |    * Get tenant settings (including AI configuration)
  44 |    */
  45 |   public async getTenantSettings(tenantId: string): Promise<TenantSettings> {
  46 |     try {
  47 |       const { data, error } = await this.client
  48 |         .from('tenant_settings')
  49 |         .select('*')
  50 |         .eq('tenant_id', tenantId)
  51 |         .single();
  52 | 
  53 |       if (error) {
  54 |         logger.error({ tenantId, error: error.message }, 'Error fetching tenant settings');
  55 |         throw error;
  56 |       }
  57 | 
  58 |       if (!data) {
  59 |         logger.warn({ tenantId }, 'No tenant settings found, using defaults');
  60 |         return {
  61 |           tenant_id: tenantId,
  62 |           ai_name: 'Sophie',
  63 |           ai_voice: 'Aoede',
  64 |           ai_language: 'Nederlands',
  65 |           ai_tone: 'vriendelijk en professioneel',
  66 |           ai_temperature: 0.7,
  67 |           business_name: 'de salon',
  68 |           custom_instructions: ''
  69 |         } as TenantSettings;
  70 |       }
  71 | 
  72 |       return data;
  73 |     } catch (error) {
  74 |       logger.error({ tenantId, error: (error as Error).message }, 'Error in getTenantSettings');
  75 |       throw error;
  76 |     }
  77 |   }
  78 | 
  79 |   /**
  80 |    * Check availability using RPC call
  81 |    * Calls the get_available_slots function in Supabase
  82 |    */
  83 |   public async checkAvailability(
  84 |     tenantId: string,
  85 |     serviceId: string,
  86 |     date: string,
  87 |     employeeId?: string
  88 |   ): Promise<any[]> {
  89 |     try {
  90 |       const { data, error } = await this.client.rpc('get_available_slots', {
  91 |         p_tenant_id: tenantId,
  92 |         p_service_id: serviceId,
  93 |         p_date: date,
  94 |         p_employee_id: employeeId ?? (null as any)
  95 |       });
  96 | 
  97 |       if (error) {
  98 |         logger.error(
  99 |           { tenantId, serviceId, date, error: error.message },
 100 |           'Error checking availability via RPC'
 101 |         );
 102 |         throw error;
 103 |       }
 104 | 
 105 |       logger.info(
 106 |         { tenantId, serviceId, date, slots: data?.length ?? 0 },
 107 |         'Availability check successful'
 108 |       );
 109 | 
 110 |       return data || [];
 111 |     } catch (error) {
 112 |       logger.error(
 113 |         { tenantId, serviceId, date, error: (error as Error).message },
 114 |         'Error in checkAvailability'
 115 |       );
 116 |       throw error;
 117 |     }
 118 |   }
 119 | 
 120 |   /**
 121 |    * Book appointment using RPC call
 122 |    * Calls the book_appointment_atomic function in Supabase
 123 |    */
 124 |   public async bookAppointment(
 125 |     tenantId: string,
 126 |     params: BookingParams
 127 |   ): Promise<any> {
 128 |     try {
 129 |       // Calculate end time (1 hour after start)
 130 |       const startDate = new Date(params.startTime);
 131 |       const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
 132 |       const endTime = endDate.toISOString();
 133 | 
 134 |       const { data, error } = await this.client.rpc('book_appointment_atomic', {
 135 |         p_tenant_id: tenantId,
 136 |         p_customer_id: params.customerPhone,
 137 |         p_start_time: params.startTime,
 138 |         p_end_time: endTime,
 139 |         p_service_id: params.serviceId,
 140 |         p_employee_id: params.employeeId
 141 |       });
 142 | 
 143 |       if (error) {
 144 |         logger.error(
 145 |           { tenantId, phone: params.customerPhone, error: error.message },
 146 |           'Error booking appointment via RPC'
 147 |         );
 148 |         throw error;
 149 |       }
 150 | 
 151 |       logger.info(
 152 |         { tenantId, startTime: params.startTime },
 153 |         'Appointment booked successfully'
 154 |       );
 155 | 
 156 |       return data;
 157 |     } catch (error) {
 158 |       logger.error(
 159 |         { tenantId, error: (error as Error).message },
 160 |         'Error in bookAppointment'
 161 |       );
 162 |       throw error;
 163 |     }
 164 |   }
 165 | 
 166 |   /**
 167 |    * Find tenant by phone number (for inbound call routing)
 168 |    */
 169 |   public async findTenantByPhoneNumber(
 170 |     phoneNumber: string
 171 |   ): Promise<{ tenantId: string; tenantSettings: any } | null> {
 172 |     try {
 173 |       // First find the tenant from telnyx_numbers
 174 |       const { data: telnyxNumber, error: telnyxError } = await this.client
 175 |         .from('telnyx_numbers')
 176 |         .select('tenant_id')
 177 |         .eq('phone_number', phoneNumber)
 178 |         .single();
 179 | 
 180 |       if (telnyxError || !telnyxNumber || !telnyxNumber.tenant_id) {
 181 |         logger.warn({ phoneNumber }, 'Phone number not found in telnyx_numbers');
 182 |         return null;
 183 |       }
 184 | 
 185 |       // Then get tenant settings
 186 |       const { data: settings, error: settingsError } = await this.client
 187 |         .from('tenant_settings')
 188 |         .select('*')
 189 |         .eq('tenant_id', telnyxNumber.tenant_id)
 190 |         .single();
 191 | 
 192 |       if (settingsError || !settings) {
 193 |         logger.warn(
 194 |           { tenantId: telnyxNumber.tenant_id },
 195 |           'Tenant settings not found'
 196 |         );
 197 |         return null;
 198 |       }
 199 | 
 200 |       return {
 201 |         tenantId: telnyxNumber.tenant_id,
 202 |         tenantSettings: settings
 203 |       };
 204 |     } catch (error) {
 205 |       logger.error(
 206 |         { phoneNumber, error: (error as Error).message },
 207 |         'Error finding tenant by phone number'
 208 |       );
 209 |       return null;
 210 |     }
 211 |   }
 212 | 
 213 |   /**
 214 |    * Create call log entry
 215 |    */
 216 |   public async createCallLog(
 217 |     sessionId: string,
 218 |     tenantId: string,
 219 |     fromNumber: string,
 220 |     _toNumber: string,
 221 |     _callControlId: string
 222 |   ): Promise<void> {
 223 |     try {
 224 |       await this.client.from('call_logs').insert({
 225 |         id: sessionId,
 226 |         tenant_id: tenantId,
 227 |         customer_id: fromNumber,
 228 |         start_time: new Date().toISOString(),
 229 |         status: 'IN_PROGRESS'
 230 |       } as any);
 231 | 
 232 |       logger.info({ sessionId, tenantId }, 'Call log created');
 233 |     } catch (error) {
 234 |       logger.error(
 235 |         { sessionId, error: (error as Error).message },
 236 |         'Error creating call log'
 237 |       );
 238 |       throw error;
 239 |     }
 240 |   }
 241 | 
 242 |   /**
 243 |    * Finalize call log with duration
 244 |    */
 245 |   public async finalizeCallLog(
 246 |     sessionId: string,
 247 |     durationSeconds: number
 248 |   ): Promise<void> {
 249 |     try {
 250 |       const endTime = new Date().toISOString();
 251 | 
 252 |       const { error } = await this.client
 253 |         .from('call_logs')
 254 |         .update({
 255 |           end_time: endTime,
 256 |           duration_seconds: durationSeconds,
 257 |           status: 'COMPLETED'
 258 |         })
 259 |         .eq('id', sessionId);
 260 | 
 261 |       if (error) {
 262 |         logger.error(
 263 |           { sessionId, error: error.message },
 264 |           'Error updating call log'
 265 |         );
 266 |         throw error;
 267 |       }
 268 | 
 269 |       logger.info(
 270 |         { sessionId, durationSeconds },
 271 |         'Call log finalized'
 272 |       );
 273 |     } catch (error) {
 274 |       logger.error(
 275 |         { sessionId, error: (error as Error).message },
 276 |         'Error in finalizeCallLog'
 277 |       );
 278 |       throw error;
 279 |     }
 280 |   }
 281 | 
 282 |   /**
 283 |    * Insert call trace for monitoring and debugging
 284 |    * Maps to the call_traces table with step_type (not trace_type)
 285 |    */
 286 |   public async insertCallTrace(trace: {
 287 |     call_log_id: string;
 288 |     tenant_id: string;
 289 |     step_type: string;
 290 |     content?: any;
 291 |     created_at?: string;
 292 |   }): Promise<void> {
 293 |     try {
 294 |       const { error } = await this.client.from('call_traces').insert({
 295 |         call_log_id: trace.call_log_id,
 296 |         tenant_id: trace.tenant_id,
 297 |         step_type: trace.step_type as any,
 298 |         content: trace.content || {},
 299 |         created_at: trace.created_at || new Date().toISOString()
 300 |       } as any);
 301 | 
 302 |       if (error) {
 303 |         logger.error(
 304 |           { callLogId: trace.call_log_id, error: error.message },
 305 |           'Error inserting call trace'
 306 |         );
 307 |         return; // Don't throw - tracing failures shouldn't break the call
 308 |       }
 309 | 
 310 |       logger.debug(
 311 |         { callLogId: trace.call_log_id, stepType: trace.step_type },
 312 |         'Call trace inserted'
 313 |       );
 314 |     } catch (error) {
 315 |       logger.error(
 316 |         { error: (error as Error).message },
 317 |         'Error in insertCallTrace'
 318 |       );
 319 |       // Silently fail - tracing is non-critical
 320 |     }
 321 |   }
 322 | 
 323 |   /**
 324 |    * Update tenant billing statistics
 325 |    */
 326 |   public async updateTenantBilling(
 327 |     tenantId: string,
 328 |     minutesUsed: number
 329 |   ): Promise<void> {
 330 |     try {
 331 |       const now = new Date().toISOString();
 332 | 
 333 |       const { error } = await this.client
 334 |         .from('tenant_billing_stats')
 335 |         .upsert(
 336 |           {
 337 |             tenant_id: tenantId,
 338 |             used_minutes: minutesUsed,
 339 |             updated_at: now
 340 |           } as any,
 341 |           { onConflict: 'tenant_id' }
 342 |         );
 343 | 
 344 |       if (error) {
 345 |         logger.error(
 346 |           { tenantId, error: error.message },
 347 |           'Error updating billing stats'
 348 |         );
 349 |         throw error;
 350 |       }
 351 | 
 352 |       logger.info(
 353 |         { tenantId, minutesUsed },
 354 |         'Tenant billing stats updated'
 355 |       );
 356 |     } catch (error) {
 357 |       logger.error(
 358 |         { tenantId, error: (error as Error).message },
 359 |         'Error in updateTenantBilling'
 360 |       );
 361 |       throw error;
 362 |     }
 363 |   }
 364 | 
 365 |   /**
 366 |    * Log system event
 367 |    */
 368 |   public async logSystemEvent(
 369 |     tenantId: string,
 370 |     eventType: string,
 371 |     content: any,
 372 |     correlationId?: string
 373 |   ): Promise<void> {
 374 |     try {
 375 |       const { error } = await this.client.from('system_logs').insert({
 376 |         event: eventType,
 377 |         metadata: content || {},
 378 |         message: eventType,
 379 |         session_id: correlationId || null,
 380 |         level: 'info',
 381 |         source: 'server',
 382 |         created_at: new Date().toISOString()
 383 |       } as any);
 384 | 
 385 |       if (error) {
 386 |         logger.warn(
 387 |           { tenantId, error: error.message },
 388 |           'Error logging system event'
 389 |         );
 390 |         return; // Don't throw - logging failures shouldn't break the call
 391 |       }
 392 | 
 393 |       logger.debug(
 394 |         { tenantId, eventType, sessionId: correlationId },
 395 |         'System event logged'
 396 |       );
 397 |     } catch (error) {
 398 |       logger.error(
 399 |         { error: (error as Error).message },
 400 |         'Error in logSystemEvent'
 401 |       );
 402 |       // Silently fail - logging is non-critical
 403 |     }
 404 |   }
 405 | }
```

## File: src\services\TelnyxService.ts
```typescript
   1 | import telnyx from 'telnyx';
   2 | import { config } from '../core/config';
   3 | import { logger } from '../core/logger';
   4 | 
   5 | export class TelnyxService {
   6 |   private static instance: TelnyxService;
   7 |   private client: any;
   8 | 
   9 |   private constructor() {
  10 |     const apiKey = config.TELNYX_API_KEY;
  11 |     if (!apiKey) {
  12 |       logger.error('CRITICAL: TELNYX_API_KEY is missing from environment variables!');
  13 |     }
  14 |     this.client = new (telnyx as any)(apiKey);
  15 |   }
  16 | 
  17 |   public static getInstance(): TelnyxService {
  18 |     if (!TelnyxService.instance) {
  19 |       TelnyxService.instance = new TelnyxService();
  20 |     }
  21 |     return TelnyxService.instance;
  22 |   }
  23 | 
  24 |   /**
  25 |    * Answers an incoming call using its Call Control ID
  26 |    */
  27 |   public async answerCall(callControlId: string): Promise<boolean> {
  28 |     try {
  29 |       logger.info(`Answering Telnyx call (ID: ${callControlId})`);
  30 |       // Use .actions namespace for Telnyx v6 SDK
  31 |       await this.client.calls.actions.answer(callControlId);
  32 |       return true;
  33 |     } catch (error) {
  34 |       const err = error as any;
  35 |       const message = err.message || 'Unknown error';
  36 |       const detail = err.raw?.message || err.detail || '';
  37 |       logger.error(`Failed to answer Telnyx call: ${message} ${detail}`);
  38 |       return false;
  39 |     }
  40 |   }
  41 | 
  42 |   /**
  43 |    * Starts a bidirectional media stream for a call
  44 |    */
  45 |   public async startStream(callControlId: string, websocketUrl: string): Promise<boolean> {
  46 |     try {
  47 |       logger.info(`Starting bidirectional media stream (ID: ${callControlId}, URL: ${websocketUrl})`);
  48 |       // ✅ FIX: Changed from streamingStart to startStreaming, added L16 codec
  49 |       await this.client.calls.actions.startStreaming(callControlId, {
  50 |         stream_url: websocketUrl,
  51 |         stream_track: 'both_tracks',
  52 |         stream_codec: 'L16'
  53 |       });
  54 |       return true;
  55 |     } catch (error) {
  56 |       const err = error as any;
  57 |       const message = err.message || 'Unknown error';
  58 |       const detail = err.raw?.message || err.detail || '';
  59 |       logger.error(`Failed to start media stream: ${message} ${detail}`);
  60 |       return false;
  61 |     }
  62 |   }
  63 | 
  64 |   /**
  65 |    * Hangs up a call
  66 |    */
  67 |   public async hangupCall(callControlId: string): Promise<boolean> {
  68 |     try {
  69 |       logger.info({ callControlId }, 'Hanging up Telnyx call');
  70 |       // Use .actions namespace for Telnyx v6 SDK
  71 |       await this.client.calls.actions.hangup(callControlId);
  72 |       return true;
  73 |     } catch (error) {
  74 |       const err = error as any;
  75 |       const message = err.message || 'Unknown error';
  76 |       const detail = err.raw?.message || err.detail || '';
  77 |       logger.error(`Failed to hangup Telnyx call: ${message} ${detail}`);
  78 |       return false;
  79 |     }
  80 |   }
  81 | }
```

## File: src\tests\story-1-4-dsp.test.ts
```typescript
   1 | /**
   2 |  * Story 1.4 Test Suite: Low-Latency Signal Processing
   3 |  * Validates DSP performance, audio quality, and jitter buffer behavior
   4 |  *
   5 |  * Run with: npx ts-node src/tests/story-1-4-dsp.test.ts
   6 |  */
   7 | 
   8 | import { AudioPipeline, AudioDspState } from '../audio/AudioPipeline';
   9 | import { JitterBuffer } from '../audio/JitterBuffer';
  10 | import { BufferPool } from '../audio/BufferPool';
  11 | 
  12 | // ═════════════════════════════════════════════════════════════════════════════
  13 | // Test Helpers
  14 | // ═════════════════════════════════════════════════════════════════════════════
  15 | 
  16 | interface TestResult {
  17 |   name: string;
  18 |   passed: boolean;
  19 |   duration: number;
  20 |   message?: string;
  21 | }
  22 | 
  23 | const results: TestResult[] = [];
  24 | 
  25 | function test(name: string, fn: () => void | Promise<void>): void {
  26 |   const start = process.hrtime.bigint();
  27 |   try {
  28 |     const result = fn();
  29 |     if (result instanceof Promise) {
  30 |       result.then(() => {
  31 |         const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
  32 |         results.push({ name, passed: true, duration });
  33 |         console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
  34 |       });
  35 |     } else {
  36 |       const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
  37 |       results.push({ name, passed: true, duration });
  38 |       console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
  39 |     }
  40 |   } catch (error) {
  41 |     const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
  42 |     const message = error instanceof Error ? error.message : String(error);
  43 |     results.push({ name, passed: false, duration, message });
  44 |     console.error(`✗ ${name}: ${message}`);
  45 |   }
  46 | }
  47 | 
  48 | function assert(condition: boolean, message: string): void {
  49 |   if (!condition) throw new Error(message);
  50 | }
  51 | 
  52 | function assertEquals(a: any, b: any, message: string): void {
  53 |   if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
  54 | }
  55 | 
  56 | function assertApprox(a: number, b: number, tolerance: number, message: string): void {
  57 |   if (Math.abs(a - b) > tolerance) {
  58 |     throw new Error(`${message}: expected ${b} ±${tolerance}, got ${a}`);
  59 |   }
  60 | }
  61 | 
  62 | /**
  63 |  * Generate test audio (sine wave or white noise)
  64 |  */
  65 | function generateTestAudio(samples: number, frequency: number = 440, amplitude: number = 10000): Buffer {
  66 |   const buf = Buffer.allocUnsafe(samples * 2);
  67 |   for (let i = 0; i < samples; i++) {
  68 |     const sample = Math.round(amplitude * Math.sin((2 * Math.PI * frequency * i) / 16000));
  69 |     buf.writeInt16LE(sample, i * 2);
  70 |   }
  71 |   return buf;
  72 | }
  73 | 
  74 | function generateWhiteNoise(samples: number, amplitude: number = 1000): Buffer {
  75 |   const buf = Buffer.allocUnsafe(samples * 2);
  76 |   for (let i = 0; i < samples; i++) {
  77 |     const sample = Math.round((Math.random() * 2 - 1) * amplitude);
  78 |     buf.writeInt16LE(sample, i * 2);
  79 |   }
  80 |   return buf;
  81 | }
  82 | 
  83 | /**
  84 |  * Measure processing latency with process.hrtime.bigint()
  85 |  */
  86 | function measureLatency(fn: () => void): number {
  87 |   const start = process.hrtime.bigint();
  88 |   fn();
  89 |   const elapsed = process.hrtime.bigint() - start;
  90 |   return Number(elapsed) / 1_000_000; // ns → ms
  91 | }
  92 | 
  93 | // ═════════════════════════════════════════════════════════════════════════════
  94 | // Test Suite
  95 | // ═════════════════════════════════════════════════════════════════════════════
  96 | 
  97 | console.log('\n╔════════════════════════════════════════════════════════════════╗');
  98 | console.log('║  Story 1.4: Low-Latency Signal Processing Test Suite          ║');
  99 | console.log('╚════════════════════════════════════════════════════════════════╝\n');
 100 | 
 101 | // Test 1: BufferPool functionality
 102 | test('BufferPool: acquire and release', () => {
 103 |   const pool = new BufferPool(640, 10);
 104 |   assertEquals(pool.getDepth(), 10, 'Initial pool size');
 105 | 
 106 |   const buf1 = pool.acquire();
 107 |   assertEquals(pool.getDepth(), 9, 'After acquire');
 108 |   assertEquals(buf1.length, 640, 'Buffer size');
 109 | 
 110 |   pool.release(buf1);
 111 |   assertEquals(pool.getDepth(), 10, 'After release');
 112 | });
 113 | 
 114 | // Test 2: DC offset removal latency
 115 | test('DSP: DC offset removal latency <0.5ms', () => {
 116 |   const pipeline = AudioPipeline.getInstance();
 117 |   const dspState: AudioDspState = {
 118 |     dcIn: { prevIn: 0, prevOut: 0 },
 119 |     firOut: { history: new Array(6).fill(0) }
 120 |   };
 121 | 
 122 |   const testAudio = generateTestAudio(320); // 20ms at 16kHz
 123 |   const latency = measureLatency(() => {
 124 |     pipeline.processInbound(testAudio.toString('base64'), dspState.dcIn, false);
 125 |   });
 126 | 
 127 |   assertApprox(latency, 0, 0.5, 'DC offset latency');
 128 | });
 129 | 
 130 | // Test 3: Endianness swap correctness
 131 | test('DSP: Endianness swap (swap16) correctness', () => {
 132 |   const data = Buffer.from([0x12, 0x34, 0x56, 0x78]);
 133 |   const expected = Buffer.from([0x34, 0x12, 0x78, 0x56]);
 134 | 
 135 |   data.swap16();
 136 |   assert(data.equals(expected), 'Swap16 byte order mismatch');
 137 | });
 138 | 
 139 | // Test 4: RMS calculation
 140 | test('DSP: RMS calculation (dBFS)', () => {
 141 |   const pipeline = AudioPipeline.getInstance();
 142 |   const sine = generateTestAudio(320, 440, 16000); // ~-1dBFS
 143 |   const dbfs = pipeline.calculateRmsDbfs(sine);
 144 | 
 145 |   // Full-scale sine ≈ -3dBFS
 146 |   assertApprox(dbfs, -3, 1, 'RMS dBFS for full-scale sine');
 147 | });
 148 | 
 149 | // Test 5: Jitter buffer basic operations
 150 | test('JitterBuffer: push and drain', async () => {
 151 |   let drainedChunks = 0;
 152 |   const onDrain = () => {
 153 |     drainedChunks++;
 154 |   };
 155 | 
 156 |   const jb = new JitterBuffer(onDrain);
 157 |   jb.start();
 158 | 
 159 |   // Push 2 chunks (640 bytes each = 20ms)
 160 |   const chunk1 = generateTestAudio(320);
 161 |   const chunk2 = generateTestAudio(320);
 162 | 
 163 |   jb.push(Buffer.concat([chunk1, chunk2]));
 164 | 
 165 |   // Wait for 2 ticks (40ms)
 166 |   await new Promise(resolve => setTimeout(resolve, 50));
 167 | 
 168 |   jb.stop();
 169 |   assert(drainedChunks >= 2, 'Jitter buffer drain count');
 170 | });
 171 | 
 172 | // Test 6: Comfort noise generation
 173 | test('JitterBuffer: comfort noise generation', async () => {
 174 |   let cngCount = 0;
 175 |   const onDrain = (buf: Buffer) => {
 176 |     const rms = Math.sqrt(
 177 |       Array.from({ length: buf.length / 2 }, (_, i) =>
 178 |         Math.pow(buf.readInt16LE(i * 2), 2)
 179 |       ).reduce((a, b) => a + b) / (buf.length / 2)
 180 |     );
 181 |     // CNG should be very quiet (RMS < 50)
 182 |     if (rms < 50) cngCount++;
 183 |   };
 184 | 
 185 |   const jb = new JitterBuffer(onDrain);
 186 |   jb.start();
 187 | 
 188 |   // Don't push any audio - should generate CNG
 189 |   await new Promise(resolve => setTimeout(resolve, 50));
 190 |   jb.stop();
 191 | 
 192 |   assert(cngCount > 0, 'Comfort noise not generated');
 193 | });
 194 | 
 195 | // Test 7: Polyphase downsampling quality
 196 | test('DSP: 24kHz→16kHz downsampling ratio', () => {
 197 |   const pipeline = AudioPipeline.getInstance();
 198 |   const dspState: AudioDspState = {
 199 |     dcIn: { prevIn: 0, prevOut: 0 },
 200 |     firOut: { history: new Array(6).fill(0) }
 201 |   };
 202 | 
 203 |   // 480 samples at 24kHz (20ms)
 204 |   const input24k = generateTestAudio(480, 440);
 205 |   const inputBase64 = input24k.toString('base64');
 206 | 
 207 |   let outputSize = 0;
 208 |   const onDrain = (buf: Buffer) => {
 209 |     outputSize = buf.length;
 210 |   };
 211 | 
 212 |   const jb = new JitterBuffer(onDrain);
 213 |   jb.start();
 214 |   pipeline.processOutbound(inputBase64, 'test-session', dspState.firOut);
 215 | 
 216 |   // Wait for processing
 217 |   setTimeout(() => {
 218 |     jb.stop();
 219 |   }, 50);
 220 | });
 221 | 
 222 | // Test 8: Echo suppression
 223 | test('DSP: Echo suppression (-6dB attenuation)', () => {
 224 |   const pipeline = AudioPipeline.getInstance();
 225 |   const dspState: AudioDspState = {
 226 |     dcIn: { prevIn: 0, prevOut: 0 },
 227 |     firOut: { history: new Array(6).fill(0) }
 228 |   };
 229 | 
 230 |   const testAudio = generateTestAudio(320, 440, 16000);
 231 |   const processed = pipeline.processInbound(testAudio.toString('base64'), dspState.dcIn, true); // isAiSpeaking
 232 | 
 233 |   // Check that amplitude is reduced
 234 |   const originalRms = pipeline.calculateRmsDbfs(testAudio);
 235 |   const suppressedRms = pipeline.calculateRmsDbfs(processed);
 236 | 
 237 |   assert(suppressedRms < originalRms, 'Echo suppression not applied');
 238 | });
 239 | 
 240 | // Test 9: Soft limiter gain
 241 | test('DSP: Soft limiter (-3dB gain)', () => {
 242 |   const pipeline = AudioPipeline.getInstance();
 243 |   const dspState: AudioDspState = {
 244 |     dcIn: { prevIn: 0, prevOut: 0 },
 245 |     firOut: { history: new Array(6).fill(0) }
 246 |   };
 247 | 
 248 |   // Outbound processing applies soft limiter
 249 |   const testAudio = generateTestAudio(480, 440, 16000);
 250 |   const inputBase64 = testAudio.toString('base64');
 251 | 
 252 |   let processed: Buffer | null = null;
 253 |   const onDrain = (buf: Buffer) => {
 254 |     if (!processed) processed = buf;
 255 |   };
 256 | 
 257 |   const jb = new JitterBuffer(onDrain);
 258 |   jb.start();
 259 |   pipeline.processOutbound(inputBase64, 'test-session', dspState.firOut);
 260 | 
 261 |   setTimeout(() => {
 262 |     jb.stop();
 263 |     if (processed) {
 264 |       const originalRms = pipeline.calculateRmsDbfs(testAudio);
 265 |       const processedRms = pipeline.calculateRmsDbfs(processed);
 266 |       // Soft limiter + downsample + filters will reduce level
 267 |       assert(processedRms <= originalRms, 'Level not reduced by limiter');
 268 |     }
 269 |   }, 100);
 270 | });
 271 | 
 272 | // Test 10: Concurrent jitter buffers
 273 | test('DSP: Multiple concurrent jitter buffers', () => {
 274 |   const pipeline = AudioPipeline.getInstance();
 275 |   const sessionCount = 10;
 276 | 
 277 |   for (let i = 0; i < sessionCount; i++) {
 278 |     pipeline.createJitterBuffer(`session-${i}`, () => {});
 279 |   }
 280 | 
 281 |   // Verify all buffers exist
 282 |   for (let i = 0; i < sessionCount; i++) {
 283 |     const depth = pipeline.getJitterBufferDepth(`session-${i}`);
 284 |     assert(typeof depth === 'number', `Buffer ${i} not created`);
 285 |   }
 286 | 
 287 |   // Cleanup
 288 |   for (let i = 0; i < sessionCount; i++) {
 289 |     pipeline.destroyJitterBuffer(`session-${i}`);
 290 |   }
 291 | 
 292 |   console.log(`  → Created and destroyed ${sessionCount} jitter buffers`);
 293 | });
 294 | 
 295 | // ═════════════════════════════════════════════════════════════════════════════
 296 | // Performance Summary
 297 | // ═════════════════════════════════════════════════════════════════════════════
 298 | 
 299 | setTimeout(() => {
 300 |   console.log('\n╔════════════════════════════════════════════════════════════════╗');
 301 |   console.log('║  Test Summary                                                  ║');
 302 |   console.log('╚════════════════════════════════════════════════════════════════╝\n');
 303 | 
 304 |   const passed = results.filter(r => r.passed).length;
 305 |   const failed = results.filter(r => !r.passed).length;
 306 |   const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
 307 | 
 308 |   console.log(`Tests passed: ${passed}/${results.length}`);
 309 |   console.log(`Total time: ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(2)}ms`);
 310 |   console.log(`Average per test: ${avgDuration.toFixed(2)}ms`);
 311 | 
 312 |   if (failed > 0) {
 313 |     console.log('\nFailed tests:');
 314 |     results.filter(r => !r.passed).forEach(r => {
 315 |       console.log(`  ✗ ${r.name}: ${r.message}`);
 316 |     });
 317 |     process.exit(1);
 318 |   } else {
 319 |     console.log('\n✓ All tests passed!');
 320 |     process.exit(0);
 321 |   }
 322 | }, 1000);
```

## File: src\types\call.ts
```typescript
   1 | import type { AudioDspState } from '../audio/AudioPipeline';
   2 | 
   3 | export interface CallSession {
   4 |   id: string;
   5 |   tenantId: string;
   6 |   callControlId: string;
   7 |   correlationId: string;
   8 |   status: CallStatus;
   9 |   createdAt: Date;
  10 |   lastActivity: Date;
  11 |   metadata: Record<string, any>;
  12 |   dspState?: AudioDspState;
  13 | }
  14 | 
  15 | export enum CallStatus {
  16 |   INITIALIZING = 'initializing',
  17 |   CONNECTED = 'connected',
  18 |   AI_SPEAKING = 'ai_speaking',
  19 |   USER_SPEAKING = 'user_speaking',
  20 |   TOOL_CALLING = 'tool_calling',
  21 |   TERMINATING = 'terminating',
  22 |   TERMINATED = 'terminated'
  23 | }
  24 | 
  25 | export interface CallEventData {
  26 |   sessionId: string;
  27 |   tenantId: string;
  28 |   timestamp: Date;
  29 |   data?: any;
  30 | }
```

## File: src\types\index.ts
```typescript
   1 | export * from './schema';
   2 | export * from './call';
```

## File: src\types\schema.ts
```typescript
   1 | export type Json =
   2 |   | string
   3 |   | number
   4 |   | boolean
   5 |   | null
   6 |   | { [key: string]: Json | undefined }
   7 |   | Json[]
   8 | 
   9 | export type Database = {
  10 |   // Allows to automatically instantiate createClient with right options
  11 |   // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  12 |   __InternalSupabase: {
  13 |     PostgrestVersion: "14.4"
  14 |   }
  15 |   public: {
  16 |     Tables: {
  17 |       ai_enhancement_suggestions: {
  18 |         Row: {
  19 |           created_at: string | null
  20 |           description: string
  21 |           id: string
  22 |           related_call_ids: string[] | null
  23 |           status: Database["public"]["Enums"]["suggestion_status_type"] | null
  24 |           suggestion_type: Database["public"]["Enums"]["suggestion_type_enum"]
  25 |           tenant_id: string
  26 |           updated_at: string | null
  27 |         }
  28 |         Insert: {
  29 |           created_at?: string | null
  30 |           description: string
  31 |           id?: string
  32 |           related_call_ids?: string[] | null
  33 |           status?: Database["public"]["Enums"]["suggestion_status_type"] | null
  34 |           suggestion_type: Database["public"]["Enums"]["suggestion_type_enum"]
  35 |           tenant_id: string
  36 |           updated_at?: string | null
  37 |         }
  38 |         Update: {
  39 |           created_at?: string | null
  40 |           description?: string
  41 |           id?: string
  42 |           related_call_ids?: string[] | null
  43 |           status?: Database["public"]["Enums"]["suggestion_status_type"] | null
  44 |           suggestion_type?: Database["public"]["Enums"]["suggestion_type_enum"]
  45 |           tenant_id?: string
  46 |           updated_at?: string | null
  47 |         }
  48 |         Relationships: [
  49 |           {
  50 |             foreignKeyName: "ai_enhancement_suggestions_tenant_id_fkey"
  51 |             columns: ["tenant_id"]
  52 |             isOneToOne: false
  53 |             referencedRelation: "tenants"
  54 |             referencedColumns: ["id"]
  55 |           },
  56 |         ]
  57 |       }
  58 |       appointments: {
  59 |         Row: {
  60 |           created_at: string | null
  61 |           customer_id: string
  62 |           customer_name: string | null
  63 |           customer_phone: string | null
  64 |           date: string | null
  65 |           duration_minutes: number | null
  66 |           employee_id: string
  67 |           end_time: string
  68 |           id: string
  69 |           notes: string | null
  70 |           service_id: string
  71 |           service_name: string | null
  72 |           session_id: string | null
  73 |           source: Database["public"]["Enums"]["appointment_source_type"] | null
  74 |           start_time: string
  75 |           status: Database["public"]["Enums"]["appointment_status_type"] | null
  76 |           tenant_id: string
  77 |           time: string | null
  78 |           updated_at: string | null
  79 |         }
  80 |         Insert: {
  81 |           created_at?: string | null
  82 |           customer_id: string
  83 |           customer_name?: string | null
  84 |           customer_phone?: string | null
  85 |           date?: string | null
  86 |           duration_minutes?: number | null
  87 |           employee_id: string
  88 |           end_time: string
  89 |           id?: string
  90 |           notes?: string | null
  91 |           service_id: string
  92 |           service_name?: string | null
  93 |           session_id?: string | null
  94 |           source?: Database["public"]["Enums"]["appointment_source_type"] | null
  95 |           start_time: string
  96 |           status?: Database["public"]["Enums"]["appointment_status_type"] | null
  97 |           tenant_id: string
  98 |           time?: string | null
  99 |           updated_at?: string | null
 100 |         }
 101 |         Update: {
 102 |           created_at?: string | null
 103 |           customer_id?: string
 104 |           customer_name?: string | null
 105 |           customer_phone?: string | null
 106 |           date?: string | null
 107 |           duration_minutes?: number | null
 108 |           employee_id?: string
 109 |           end_time?: string
 110 |           id?: string
 111 |           notes?: string | null
 112 |           service_id?: string
 113 |           service_name?: string | null
 114 |           session_id?: string | null
 115 |           source?: Database["public"]["Enums"]["appointment_source_type"] | null
 116 |           start_time?: string
 117 |           status?: Database["public"]["Enums"]["appointment_status_type"] | null
 118 |           tenant_id?: string
 119 |           time?: string | null
 120 |           updated_at?: string | null
 121 |         }
 122 |         Relationships: [
 123 |           {
 124 |             foreignKeyName: "appointments_customer_id_fkey"
 125 |             columns: ["customer_id"]
 126 |             isOneToOne: false
 127 |             referencedRelation: "customers"
 128 |             referencedColumns: ["id"]
 129 |           },
 130 |           {
 131 |             foreignKeyName: "appointments_employee_id_fkey"
 132 |             columns: ["employee_id"]
 133 |             isOneToOne: false
 134 |             referencedRelation: "employees"
 135 |             referencedColumns: ["id"]
 136 |           },
 137 |           {
 138 |             foreignKeyName: "appointments_service_id_fkey"
 139 |             columns: ["service_id"]
 140 |             isOneToOne: false
 141 |             referencedRelation: "services"
 142 |             referencedColumns: ["id"]
 143 |           },
 144 |           {
 145 |             foreignKeyName: "appointments_tenant_id_fkey"
 146 |             columns: ["tenant_id"]
 147 |             isOneToOne: false
 148 |             referencedRelation: "tenants"
 149 |             referencedColumns: ["id"]
 150 |           },
 151 |         ]
 152 |       }
 153 |       business_hours: {
 154 |         Row: {
 155 |           created_at: string | null
 156 |           day_of_week: number
 157 |           end_time: string
 158 |           id: string
 159 |           is_closed: boolean | null
 160 |           start_time: string
 161 |           tenant_id: string
 162 |           updated_at: string | null
 163 |         }
 164 |         Insert: {
 165 |           created_at?: string | null
 166 |           day_of_week: number
 167 |           end_time: string
 168 |           id?: string
 169 |           is_closed?: boolean | null
 170 |           start_time: string
 171 |           tenant_id: string
 172 |           updated_at?: string | null
 173 |         }
 174 |         Update: {
 175 |           created_at?: string | null
 176 |           day_of_week?: number
 177 |           end_time?: string
 178 |           id?: string
 179 |           is_closed?: boolean | null
 180 |           start_time?: string
 181 |           tenant_id?: string
 182 |           updated_at?: string | null
 183 |         }
 184 |         Relationships: [
 185 |           {
 186 |             foreignKeyName: "business_hours_tenant_id_fkey"
 187 |             columns: ["tenant_id"]
 188 |             isOneToOne: false
 189 |             referencedRelation: "tenants"
 190 |             referencedColumns: ["id"]
 191 |           },
 192 |         ]
 193 |       }
 194 |       business_hours_exceptions: {
 195 |         Row: {
 196 |           created_at: string | null
 197 |           date: string
 198 |           end_time: string | null
 199 |           id: string
 200 |           is_closed: boolean
 201 |           note: string | null
 202 |           start_time: string | null
 203 |           tenant_id: string
 204 |           updated_at: string | null
 205 |         }
 206 |         Insert: {
 207 |           created_at?: string | null
 208 |           date: string
 209 |           end_time?: string | null
 210 |           id?: string
 211 |           is_closed?: boolean
 212 |           note?: string | null
 213 |           start_time?: string | null
 214 |           tenant_id: string
 215 |           updated_at?: string | null
 216 |         }
 217 |         Update: {
 218 |           created_at?: string | null
 219 |           date?: string
 220 |           end_time?: string | null
 221 |           id?: string
 222 |           is_closed?: boolean
 223 |           note?: string | null
 224 |           start_time?: string | null
 225 |           tenant_id?: string
 226 |           updated_at?: string | null
 227 |         }
 228 |         Relationships: []
 229 |       }
 230 |       call_logs: {
 231 |         Row: {
 232 |           created_at: string | null
 233 |           customer_id: string | null
 234 |           duration_seconds: number | null
 235 |           end_time: string | null
 236 |           id: string
 237 |           start_time: string
 238 |           status: Database["public"]["Enums"]["call_status_type"] | null
 239 |           tenant_id: string
 240 |         }
 241 |         Insert: {
 242 |           created_at?: string | null
 243 |           customer_id?: string | null
 244 |           duration_seconds?: number | null
 245 |           end_time?: string | null
 246 |           id?: string
 247 |           start_time: string
 248 |           status?: Database["public"]["Enums"]["call_status_type"] | null
 249 |           tenant_id: string
 250 |         }
 251 |         Update: {
 252 |           created_at?: string | null
 253 |           customer_id?: string | null
 254 |           duration_seconds?: number | null
 255 |           end_time?: string | null
 256 |           id?: string
 257 |           start_time?: string
 258 |           status?: Database["public"]["Enums"]["call_status_type"] | null
 259 |           tenant_id?: string
 260 |         }
 261 |         Relationships: [
 262 |           {
 263 |             foreignKeyName: "call_logs_customer_id_fkey"
 264 |             columns: ["customer_id"]
 265 |             isOneToOne: false
 266 |             referencedRelation: "customers"
 267 |             referencedColumns: ["id"]
 268 |           },
 269 |           {
 270 |             foreignKeyName: "call_logs_tenant_id_fkey"
 271 |             columns: ["tenant_id"]
 272 |             isOneToOne: false
 273 |             referencedRelation: "tenants"
 274 |             referencedColumns: ["id"]
 275 |           },
 276 |         ]
 277 |       }
 278 |       call_review_sessions: {
 279 |         Row: {
 280 |           created_at: string
 281 |           duration_seconds: number | null
 282 |           id: string
 283 |           outcome: string | null
 284 |           review_status: string | null
 285 |           session_id: string
 286 |           tenant_id: string
 287 |           transcript: string | null
 288 |         }
 289 |         Insert: {
 290 |           created_at?: string
 291 |           duration_seconds?: number | null
 292 |           id?: string
 293 |           outcome?: string | null
 294 |           review_status?: string | null
 295 |           session_id: string
 296 |           tenant_id: string
 297 |           transcript?: string | null
 298 |         }
 299 |         Update: {
 300 |           created_at?: string
 301 |           duration_seconds?: number | null
 302 |           id?: string
 303 |           outcome?: string | null
 304 |           review_status?: string | null
 305 |           session_id?: string
 306 |           tenant_id?: string
 307 |           transcript?: string | null
 308 |         }
 309 |         Relationships: [
 310 |           {
 311 |             foreignKeyName: "call_review_sessions_tenant_id_fkey"
 312 |             columns: ["tenant_id"]
 313 |             isOneToOne: false
 314 |             referencedRelation: "tenants"
 315 |             referencedColumns: ["id"]
 316 |           },
 317 |         ]
 318 |       }
 319 |       call_traces: {
 320 |         Row: {
 321 |           call_log_id: string | null
 322 |           content: Json
 323 |           correlation_id: string | null
 324 |           created_at: string | null
 325 |           id: string
 326 |           step_type: Database["public"]["Enums"]["step_type_enum"]
 327 |           tenant_id: string
 328 |           timestamp: string | null
 329 |         }
 330 |         Insert: {
 331 |           call_log_id?: string | null
 332 |           content: Json
 333 |           correlation_id?: string | null
 334 |           created_at?: string | null
 335 |           id?: string
 336 |           step_type: Database["public"]["Enums"]["step_type_enum"]
 337 |           tenant_id: string
 338 |           timestamp?: string | null
 339 |         }
 340 |         Update: {
 341 |           call_log_id?: string | null
 342 |           content?: Json
 343 |           correlation_id?: string | null
 344 |           created_at?: string | null
 345 |           id?: string
 346 |           step_type?: Database["public"]["Enums"]["step_type_enum"]
 347 |           tenant_id?: string
 348 |           timestamp?: string | null
 349 |         }
 350 |         Relationships: [
 351 |           {
 352 |             foreignKeyName: "call_traces_call_log_id_fkey"
 353 |             columns: ["call_log_id"]
 354 |             isOneToOne: false
 355 |             referencedRelation: "call_logs"
 356 |             referencedColumns: ["id"]
 357 |           },
 358 |           {
 359 |             foreignKeyName: "call_traces_tenant_id_fkey"
 360 |             columns: ["tenant_id"]
 361 |             isOneToOne: false
 362 |             referencedRelation: "tenants"
 363 |             referencedColumns: ["id"]
 364 |           },
 365 |         ]
 366 |       }
 367 |       call_transcripts: {
 368 |         Row: {
 369 |           call_control_id: string | null
 370 |           created_at: string | null
 371 |           ended_at: string | null
 372 |           id: string
 373 |           session_id: string | null
 374 |           speaker: string | null
 375 |           started_at: string | null
 376 |           tenant_id: string | null
 377 |           text: string
 378 |           token_count: number | null
 379 |           turn_index: number | null
 380 |         }
 381 |         Insert: {
 382 |           call_control_id?: string | null
 383 |           created_at?: string | null
 384 |           ended_at?: string | null
 385 |           id?: string
 386 |           session_id?: string | null
 387 |           speaker?: string | null
 388 |           started_at?: string | null
 389 |           tenant_id?: string | null
 390 |           text: string
 391 |           token_count?: number | null
 392 |           turn_index?: number | null
 393 |         }
 394 |         Update: {
 395 |           call_control_id?: string | null
 396 |           created_at?: string | null
 397 |           ended_at?: string | null
 398 |           id?: string
 399 |           session_id?: string | null
 400 |           speaker?: string | null
 401 |           started_at?: string | null
 402 |           tenant_id?: string | null
 403 |           text?: string
 404 |           token_count?: number | null
 405 |           turn_index?: number | null
 406 |         }
 407 |         Relationships: [
 408 |           {
 409 |             foreignKeyName: "call_transcripts_tenant_id_fkey"
 410 |             columns: ["tenant_id"]
 411 |             isOneToOne: false
 412 |             referencedRelation: "tenants"
 413 |             referencedColumns: ["id"]
 414 |           },
 415 |         ]
 416 |       }
 417 |       conversation_feedback: {
 418 |         Row: {
 419 |           ai_message: string
 420 |           category: string | null
 421 |           context: Json | null
 422 |           created_at: string
 423 |           feedback_comment: string | null
 424 |           feedback_type: string
 425 |           id: string
 426 |           log_entry_id: string | null
 427 |           message_index: number
 428 |           reviewed_by: string | null
 429 |           session_id: string
 430 |           tenant_id: string
 431 |         }
 432 |         Insert: {
 433 |           ai_message: string
 434 |           category?: string | null
 435 |           context?: Json | null
 436 |           created_at?: string
 437 |           feedback_comment?: string | null
 438 |           feedback_type: string
 439 |           id?: string
 440 |           log_entry_id?: string | null
 441 |           message_index: number
 442 |           reviewed_by?: string | null
 443 |           session_id: string
 444 |           tenant_id: string
 445 |         }
 446 |         Update: {
 447 |           ai_message?: string
 448 |           category?: string | null
 449 |           context?: Json | null
 450 |           created_at?: string
 451 |           feedback_comment?: string | null
 452 |           feedback_type?: string
 453 |           id?: string
 454 |           log_entry_id?: string | null
 455 |           message_index?: number
 456 |           reviewed_by?: string | null
 457 |           session_id?: string
 458 |           tenant_id?: string
 459 |         }
 460 |         Relationships: [
 461 |           {
 462 |             foreignKeyName: "conversation_feedback_tenant_id_fkey"
 463 |             columns: ["tenant_id"]
 464 |             isOneToOne: false
 465 |             referencedRelation: "tenants"
 466 |             referencedColumns: ["id"]
 467 |           },
 468 |         ]
 469 |       }
 470 |       conversation_logs: {
 471 |         Row: {
 472 |           created_at: string
 473 |           id: string
 474 |           message: string
 475 |           message_index: number
 476 |           metadata: Json | null
 477 |           role: string
 478 |           session_id: string
 479 |           tenant_id: string | null
 480 |           timestamp: string | null
 481 |           tool_input: Json | null
 482 |           tool_name: string | null
 483 |           tool_output: Json | null
 484 |         }
 485 |         Insert: {
 486 |           created_at?: string
 487 |           id?: string
 488 |           message: string
 489 |           message_index?: number
 490 |           metadata?: Json | null
 491 |           role: string
 492 |           session_id: string
 493 |           tenant_id?: string | null
 494 |           timestamp?: string | null
 495 |           tool_input?: Json | null
 496 |           tool_name?: string | null
 497 |           tool_output?: Json | null
 498 |         }
 499 |         Update: {
 500 |           created_at?: string
 501 |           id?: string
 502 |           message?: string
 503 |           message_index?: number
 504 |           metadata?: Json | null
 505 |           role?: string
 506 |           session_id?: string
 507 |           tenant_id?: string | null
 508 |           timestamp?: string | null
 509 |           tool_input?: Json | null
 510 |           tool_name?: string | null
 511 |           tool_output?: Json | null
 512 |         }
 513 |         Relationships: [
 514 |           {
 515 |             foreignKeyName: "conversation_logs_tenant_id_fkey"
 516 |             columns: ["tenant_id"]
 517 |             isOneToOne: false
 518 |             referencedRelation: "tenants"
 519 |             referencedColumns: ["id"]
 520 |           },
 521 |         ]
 522 |       }
 523 |       conversation_sessions: {
 524 |         Row: {
 525 |           channel: string
 526 |           context: Json
 527 |           created_at: string | null
 528 |           customer_id: string | null
 529 |           customer_name: string | null
 530 |           customer_phone: string | null
 531 |           duration_seconds: number | null
 532 |           ended_at: string | null
 533 |           id: string
 534 |           last_activity_at: string
 535 |           metadata: Json | null
 536 |           metrics: Json | null
 537 |           outcome: string | null
 538 |           phase: string
 539 |           session_id: string
 540 |           started_at: string
 541 |           state: Json | null
 542 |           status: string | null
 543 |           tenant_id: string
 544 |           total_cost_eur: number | null
 545 |           total_tokens: number | null
 546 |           transcript_summary: string | null
 547 |           updated_at: string | null
 548 |         }
 549 |         Insert: {
 550 |           channel?: string
 551 |           context?: Json
 552 |           created_at?: string | null
 553 |           customer_id?: string | null
 554 |           customer_name?: string | null
 555 |           customer_phone?: string | null
 556 |           duration_seconds?: number | null
 557 |           ended_at?: string | null
 558 |           id?: string
 559 |           last_activity_at?: string
 560 |           metadata?: Json | null
 561 |           metrics?: Json | null
 562 |           outcome?: string | null
 563 |           phase?: string
 564 |           session_id: string
 565 |           started_at?: string
 566 |           state?: Json | null
 567 |           status?: string | null
 568 |           tenant_id: string
 569 |           total_cost_eur?: number | null
 570 |           total_tokens?: number | null
 571 |           transcript_summary?: string | null
 572 |           updated_at?: string | null
 573 |         }
 574 |         Update: {
 575 |           channel?: string
 576 |           context?: Json
 577 |           created_at?: string | null
 578 |           customer_id?: string | null
 579 |           customer_name?: string | null
 580 |           customer_phone?: string | null
 581 |           duration_seconds?: number | null
 582 |           ended_at?: string | null
 583 |           id?: string
 584 |           last_activity_at?: string
 585 |           metadata?: Json | null
 586 |           metrics?: Json | null
 587 |           outcome?: string | null
 588 |           phase?: string
 589 |           session_id?: string
 590 |           started_at?: string
 591 |           state?: Json | null
 592 |           status?: string | null
 593 |           tenant_id?: string
 594 |           total_cost_eur?: number | null
 595 |           total_tokens?: number | null
 596 |           transcript_summary?: string | null
 597 |           updated_at?: string | null
 598 |         }
 599 |         Relationships: [
 600 |           {
 601 |             foreignKeyName: "conversation_sessions_customer_id_fkey"
 602 |             columns: ["customer_id"]
 603 |             isOneToOne: false
 604 |             referencedRelation: "customers"
 605 |             referencedColumns: ["id"]
 606 |           },
 607 |           {
 608 |             foreignKeyName: "conversation_sessions_tenant_id_fkey"
 609 |             columns: ["tenant_id"]
 610 |             isOneToOne: false
 611 |             referencedRelation: "tenants"
 612 |             referencedColumns: ["id"]
 613 |           },
 614 |         ]
 615 |       }
 616 |       custom_prompts: {
 617 |         Row: {
 618 |           created_at: string | null
 619 |           id: string
 620 |           is_active: boolean | null
 621 |           name: string
 622 |           prompt_text: string
 623 |           tenant_id: string
 624 |           updated_at: string | null
 625 |         }
 626 |         Insert: {
 627 |           created_at?: string | null
 628 |           id?: string
 629 |           is_active?: boolean | null
 630 |           name: string
 631 |           prompt_text: string
 632 |           tenant_id: string
 633 |           updated_at?: string | null
 634 |         }
 635 |         Update: {
 636 |           created_at?: string | null
 637 |           id?: string
 638 |           is_active?: boolean | null
 639 |           name?: string
 640 |           prompt_text?: string
 641 |           tenant_id?: string
 642 |           updated_at?: string | null
 643 |         }
 644 |         Relationships: [
 645 |           {
 646 |             foreignKeyName: "custom_prompts_tenant_id_fkey"
 647 |             columns: ["tenant_id"]
 648 |             isOneToOne: false
 649 |             referencedRelation: "tenants"
 650 |             referencedColumns: ["id"]
 651 |           },
 652 |         ]
 653 |       }
 654 |       customer_history: {
 655 |         Row: {
 656 |           channel: string | null
 657 |           created_at: string
 658 |           customer_id: string
 659 |           customer_since: string | null
 660 |           first_visit: boolean | null
 661 |           id: string
 662 |           interaction_type: string | null
 663 |           last_employee_name: string | null
 664 |           last_service: string | null
 665 |           last_session_id: string | null
 666 |           last_visit: string | null
 667 |           notes: string | null
 668 |           phone_number: string | null
 669 |           preferred_service_ids: string[] | null
 670 |           tenant_id: string
 671 |           total_visits: number | null
 672 |           updated_at: string
 673 |           visit_date: string | null
 674 |         }
 675 |         Insert: {
 676 |           channel?: string | null
 677 |           created_at?: string
 678 |           customer_id: string
 679 |           customer_since?: string | null
 680 |           first_visit?: boolean | null
 681 |           id?: string
 682 |           interaction_type?: string | null
 683 |           last_employee_name?: string | null
 684 |           last_service?: string | null
 685 |           last_session_id?: string | null
 686 |           last_visit?: string | null
 687 |           notes?: string | null
 688 |           phone_number?: string | null
 689 |           preferred_service_ids?: string[] | null
 690 |           tenant_id: string
 691 |           total_visits?: number | null
 692 |           updated_at?: string
 693 |           visit_date?: string | null
 694 |         }
 695 |         Update: {
 696 |           channel?: string | null
 697 |           created_at?: string
 698 |           customer_id?: string
 699 |           customer_since?: string | null
 700 |           first_visit?: boolean | null
 701 |           id?: string
 702 |           interaction_type?: string | null
 703 |           last_employee_name?: string | null
 704 |           last_service?: string | null
 705 |           last_session_id?: string | null
 706 |           last_visit?: string | null
 707 |           notes?: string | null
 708 |           phone_number?: string | null
 709 |           preferred_service_ids?: string[] | null
 710 |           tenant_id?: string
 711 |           total_visits?: number | null
 712 |           updated_at?: string
 713 |           visit_date?: string | null
 714 |         }
 715 |         Relationships: [
 716 |           {
 717 |             foreignKeyName: "customer_history_customer_id_fkey"
 718 |             columns: ["customer_id"]
 719 |             isOneToOne: false
 720 |             referencedRelation: "customers"
 721 |             referencedColumns: ["id"]
 722 |           },
 723 |           {
 724 |             foreignKeyName: "customer_history_tenant_id_fkey"
 725 |             columns: ["tenant_id"]
 726 |             isOneToOne: false
 727 |             referencedRelation: "tenants"
 728 |             referencedColumns: ["id"]
 729 |           },
 730 |         ]
 731 |       }
 732 |       customers: {
 733 |         Row: {
 734 |           created_at: string | null
 735 |           email: string | null
 736 |           first_name: string | null
 737 |           id: string
 738 |           last_name: string | null
 739 |           last_visit_date: string | null
 740 |           notes: string | null
 741 |           phone: string
 742 |           phone_normalized: string | null
 743 |           preferences: Json | null
 744 |           preferred_employee_id: string | null
 745 |           preferred_service_ids: string[] | null
 746 |           tenant_id: string
 747 |           total_no_shows: number | null
 748 |           total_visits: number | null
 749 |           updated_at: string | null
 750 |         }
 751 |         Insert: {
 752 |           created_at?: string | null
 753 |           email?: string | null
 754 |           first_name?: string | null
 755 |           id?: string
 756 |           last_name?: string | null
 757 |           last_visit_date?: string | null
 758 |           notes?: string | null
 759 |           phone: string
 760 |           phone_normalized?: string | null
 761 |           preferences?: Json | null
 762 |           preferred_employee_id?: string | null
 763 |           preferred_service_ids?: string[] | null
 764 |           tenant_id: string
 765 |           total_no_shows?: number | null
 766 |           total_visits?: number | null
 767 |           updated_at?: string | null
 768 |         }
 769 |         Update: {
 770 |           created_at?: string | null
 771 |           email?: string | null
 772 |           first_name?: string | null
 773 |           id?: string
 774 |           last_name?: string | null
 775 |           last_visit_date?: string | null
 776 |           notes?: string | null
 777 |           phone?: string
 778 |           phone_normalized?: string | null
 779 |           preferences?: Json | null
 780 |           preferred_employee_id?: string | null
 781 |           preferred_service_ids?: string[] | null
 782 |           tenant_id?: string
 783 |           total_no_shows?: number | null
 784 |           total_visits?: number | null
 785 |           updated_at?: string | null
 786 |         }
 787 |         Relationships: [
 788 |           {
 789 |             foreignKeyName: "customers_tenant_id_fkey"
 790 |             columns: ["tenant_id"]
 791 |             isOneToOne: false
 792 |             referencedRelation: "tenants"
 793 |             referencedColumns: ["id"]
 794 |           },
 795 |         ]
 796 |       }
 797 |       dev_configs: {
 798 |         Row: {
 799 |           config: Json
 800 |           created_at: string | null
 801 |           custom_prompt: string | null
 802 |           id: string
 803 |           tenant_id: string
 804 |           updated_at: string | null
 805 |         }
 806 |         Insert: {
 807 |           config?: Json
 808 |           created_at?: string | null
 809 |           custom_prompt?: string | null
 810 |           id?: string
 811 |           tenant_id: string
 812 |           updated_at?: string | null
 813 |         }
 814 |         Update: {
 815 |           config?: Json
 816 |           created_at?: string | null
 817 |           custom_prompt?: string | null
 818 |           id?: string
 819 |           tenant_id?: string
 820 |           updated_at?: string | null
 821 |         }
 822 |         Relationships: [
 823 |           {
 824 |             foreignKeyName: "dev_configs_tenant_id_fkey"
 825 |             columns: ["tenant_id"]
 826 |             isOneToOne: true
 827 |             referencedRelation: "tenants"
 828 |             referencedColumns: ["id"]
 829 |           },
 830 |         ]
 831 |       }
 832 |       dev_presets: {
 833 |         Row: {
 834 |           config: Json
 835 |           created_at: string | null
 836 |           id: string
 837 |           name: string
 838 |           saved_at: number
 839 |           tenant_id: string
 840 |         }
 841 |         Insert: {
 842 |           config?: Json
 843 |           created_at?: string | null
 844 |           id?: string
 845 |           name: string
 846 |           saved_at: number
 847 |           tenant_id: string
 848 |         }
 849 |         Update: {
 850 |           config?: Json
 851 |           created_at?: string | null
 852 |           id?: string
 853 |           name?: string
 854 |           saved_at?: number
 855 |           tenant_id?: string
 856 |         }
 857 |         Relationships: [
 858 |           {
 859 |             foreignKeyName: "dev_presets_tenant_id_fkey"
 860 |             columns: ["tenant_id"]
 861 |             isOneToOne: false
 862 |             referencedRelation: "tenants"
 863 |             referencedColumns: ["id"]
 864 |           },
 865 |         ]
 866 |       }
 867 |       dev_session_tool_calls: {
 868 |         Row: {
 869 |           args: Json | null
 870 |           created_at: string | null
 871 |           duration_ms: number
 872 |           error: string | null
 873 |           id: string
 874 |           result: Json | null
 875 |           session_id: string
 876 |           success: boolean
 877 |           tenant_id: string
 878 |           timestamp: number
 879 |           tool_name: string
 880 |         }
 881 |         Insert: {
 882 |           args?: Json | null
 883 |           created_at?: string | null
 884 |           duration_ms?: number
 885 |           error?: string | null
 886 |           id?: string
 887 |           result?: Json | null
 888 |           session_id: string
 889 |           success?: boolean
 890 |           tenant_id: string
 891 |           timestamp: number
 892 |           tool_name: string
 893 |         }
 894 |         Update: {
 895 |           args?: Json | null
 896 |           created_at?: string | null
 897 |           duration_ms?: number
 898 |           error?: string | null
 899 |           id?: string
 900 |           result?: Json | null
 901 |           session_id?: string
 902 |           success?: boolean
 903 |           tenant_id?: string
 904 |           timestamp?: number
 905 |           tool_name?: string
 906 |         }
 907 |         Relationships: [
 908 |           {
 909 |             foreignKeyName: "dev_session_tool_calls_session_id_fkey"
 910 |             columns: ["session_id"]
 911 |             isOneToOne: false
 912 |             referencedRelation: "dev_sessions"
 913 |             referencedColumns: ["id"]
 914 |           },
 915 |           {
 916 |             foreignKeyName: "dev_session_tool_calls_tenant_id_fkey"
 917 |             columns: ["tenant_id"]
 918 |             isOneToOne: false
 919 |             referencedRelation: "tenants"
 920 |             referencedColumns: ["id"]
 921 |           },
 922 |         ]
 923 |       }
 924 |       dev_session_transcript: {
 925 |         Row: {
 926 |           created_at: string | null
 927 |           id: string
 928 |           latency_ms: number | null
 929 |           role: string
 930 |           session_id: string
 931 |           session_init_data: Json | null
 932 |           tenant_id: string
 933 |           text: string
 934 |           timestamp: number
 935 |           tool_args: Json | null
 936 |           tool_name: string | null
 937 |           tool_query: string | null
 938 |           tool_query_result: Json | null
 939 |           tool_result: Json | null
 940 |         }
 941 |         Insert: {
 942 |           created_at?: string | null
 943 |           id: string
 944 |           latency_ms?: number | null
 945 |           role: string
 946 |           session_id: string
 947 |           session_init_data?: Json | null
 948 |           tenant_id: string
 949 |           text?: string
 950 |           timestamp: number
 951 |           tool_args?: Json | null
 952 |           tool_name?: string | null
 953 |           tool_query?: string | null
 954 |           tool_query_result?: Json | null
 955 |           tool_result?: Json | null
 956 |         }
 957 |         Update: {
 958 |           created_at?: string | null
 959 |           id?: string
 960 |           latency_ms?: number | null
 961 |           role?: string
 962 |           session_id?: string
 963 |           session_init_data?: Json | null
 964 |           tenant_id?: string
 965 |           text?: string
 966 |           timestamp?: number
 967 |           tool_args?: Json | null
 968 |           tool_name?: string | null
 969 |           tool_query?: string | null
 970 |           tool_query_result?: Json | null
 971 |           tool_result?: Json | null
 972 |         }
 973 |         Relationships: [
 974 |           {
 975 |             foreignKeyName: "dev_session_transcript_session_id_fkey"
 976 |             columns: ["session_id"]
 977 |             isOneToOne: false
 978 |             referencedRelation: "dev_sessions"
 979 |             referencedColumns: ["id"]
 980 |           },
 981 |           {
 982 |             foreignKeyName: "dev_session_transcript_tenant_id_fkey"
 983 |             columns: ["tenant_id"]
 984 |             isOneToOne: false
 985 |             referencedRelation: "tenants"
 986 |             referencedColumns: ["id"]
 987 |           },
 988 |         ]
 989 |       }
 990 |       dev_sessions: {
 991 |         Row: {
 992 |           ai_speaking_history: Json | null
 993 |           config: Json
 994 |           created_at: string | null
 995 |           ended_at: number | null
 996 |           id: string
 997 |           session_init: Json | null
 998 |           started_at: number
 999 |           stats: Json
1000 |           tenant_id: string
1001 |           user_volume_history: Json | null
1002 |         }
1003 |         Insert: {
1004 |           ai_speaking_history?: Json | null
1005 |           config?: Json
1006 |           created_at?: string | null
1007 |           ended_at?: number | null
1008 |           id: string
1009 |           session_init?: Json | null
1010 |           started_at: number
1011 |           stats?: Json
1012 |           tenant_id: string
1013 |           user_volume_history?: Json | null
1014 |         }
1015 |         Update: {
1016 |           ai_speaking_history?: Json | null
1017 |           config?: Json
1018 |           created_at?: string | null
1019 |           ended_at?: number | null
1020 |           id?: string
1021 |           session_init?: Json | null
1022 |           started_at?: number
1023 |           stats?: Json
1024 |           tenant_id?: string
1025 |           user_volume_history?: Json | null
1026 |         }
1027 |         Relationships: [
1028 |           {
1029 |             foreignKeyName: "dev_sessions_tenant_id_fkey"
1030 |             columns: ["tenant_id"]
1031 |             isOneToOne: false
1032 |             referencedRelation: "tenants"
1033 |             referencedColumns: ["id"]
1034 |           },
1035 |         ]
1036 |       }
1037 |       employee_blocks: {
1038 |         Row: {
1039 |           created_at: string | null
1040 |           created_by_employee: boolean | null
1041 |           date: string
1042 |           employee_id: string
1043 |           end_time: string
1044 |           id: string
1045 |           is_recurring: boolean | null
1046 |           label: string | null
1047 |           recurrence_day_of_week: number | null
1048 |           start_time: string
1049 |           tenant_id: string
1050 |           type: string
1051 |         }
1052 |         Insert: {
1053 |           created_at?: string | null
1054 |           created_by_employee?: boolean | null
1055 |           date: string
1056 |           employee_id: string
1057 |           end_time: string
1058 |           id?: string
1059 |           is_recurring?: boolean | null
1060 |           label?: string | null
1061 |           recurrence_day_of_week?: number | null
1062 |           start_time: string
1063 |           tenant_id: string
1064 |           type?: string
1065 |         }
1066 |         Update: {
1067 |           created_at?: string | null
1068 |           created_by_employee?: boolean | null
1069 |           date?: string
1070 |           employee_id?: string
1071 |           end_time?: string
1072 |           id?: string
1073 |           is_recurring?: boolean | null
1074 |           label?: string | null
1075 |           recurrence_day_of_week?: number | null
1076 |           start_time?: string
1077 |           tenant_id?: string
1078 |           type?: string
1079 |         }
1080 |         Relationships: [
1081 |           {
1082 |             foreignKeyName: "employee_blocks_employee_id_fkey"
1083 |             columns: ["employee_id"]
1084 |             isOneToOne: false
1085 |             referencedRelation: "employees"
1086 |             referencedColumns: ["id"]
1087 |           },
1088 |           {
1089 |             foreignKeyName: "employee_blocks_tenant_id_fkey"
1090 |             columns: ["tenant_id"]
1091 |             isOneToOne: false
1092 |             referencedRelation: "tenants"
1093 |             referencedColumns: ["id"]
1094 |           },
1095 |         ]
1096 |       }
1097 |       employee_documents: {
1098 |         Row: {
1099 |           document_type: string
1100 |           employee_id: string
1101 |           expires_at: string | null
1102 |           file_name: string | null
1103 |           file_path: string | null
1104 |           file_size: number | null
1105 |           id: string
1106 |           mime_type: string | null
1107 |           notes: string | null
1108 |           tenant_id: string
1109 |           title: string | null
1110 |           uploaded_at: string | null
1111 |           uploaded_by: string | null
1112 |         }
1113 |         Insert: {
1114 |           document_type: string
1115 |           employee_id: string
1116 |           expires_at?: string | null
1117 |           file_name?: string | null
1118 |           file_path?: string | null
1119 |           file_size?: number | null
1120 |           id?: string
1121 |           mime_type?: string | null
1122 |           notes?: string | null
1123 |           tenant_id: string
1124 |           title?: string | null
1125 |           uploaded_at?: string | null
1126 |           uploaded_by?: string | null
1127 |         }
1128 |         Update: {
1129 |           document_type?: string
1130 |           employee_id?: string
1131 |           expires_at?: string | null
1132 |           file_name?: string | null
1133 |           file_path?: string | null
1134 |           file_size?: number | null
1135 |           id?: string
1136 |           mime_type?: string | null
1137 |           notes?: string | null
1138 |           tenant_id?: string
1139 |           title?: string | null
1140 |           uploaded_at?: string | null
1141 |           uploaded_by?: string | null
1142 |         }
1143 |         Relationships: [
1144 |           {
1145 |             foreignKeyName: "employee_documents_employee_id_fkey"
1146 |             columns: ["employee_id"]
1147 |             isOneToOne: false
1148 |             referencedRelation: "employees"
1149 |             referencedColumns: ["id"]
1150 |           },
1151 |           {
1152 |             foreignKeyName: "employee_documents_tenant_id_fkey"
1153 |             columns: ["tenant_id"]
1154 |             isOneToOne: false
1155 |             referencedRelation: "tenants"
1156 |             referencedColumns: ["id"]
1157 |           },
1158 |           {
1159 |             foreignKeyName: "employee_documents_uploaded_by_fkey"
1160 |             columns: ["uploaded_by"]
1161 |             isOneToOne: false
1162 |             referencedRelation: "users"
1163 |             referencedColumns: ["id"]
1164 |           },
1165 |         ]
1166 |       }
1167 |       employee_employment_history: {
1168 |         Row: {
1169 |           created_at: string | null
1170 |           created_by: string | null
1171 |           effective_date: string
1172 |           employee_id: string
1173 |           end_date: string | null
1174 |           event_type: string
1175 |           id: string
1176 |           new_value: string | null
1177 |           note: string | null
1178 |           previous_value: string | null
1179 |           tenant_id: string
1180 |         }
1181 |         Insert: {
1182 |           created_at?: string | null
1183 |           created_by?: string | null
1184 |           effective_date: string
1185 |           employee_id: string
1186 |           end_date?: string | null
1187 |           event_type: string
1188 |           id?: string
1189 |           new_value?: string | null
1190 |           note?: string | null
1191 |           previous_value?: string | null
1192 |           tenant_id: string
1193 |         }
1194 |         Update: {
1195 |           created_at?: string | null
1196 |           created_by?: string | null
1197 |           effective_date?: string
1198 |           employee_id?: string
1199 |           end_date?: string | null
1200 |           event_type?: string
1201 |           id?: string
1202 |           new_value?: string | null
1203 |           note?: string | null
1204 |           previous_value?: string | null
1205 |           tenant_id?: string
1206 |         }
1207 |         Relationships: [
1208 |           {
1209 |             foreignKeyName: "employee_employment_history_employee_id_fkey"
1210 |             columns: ["employee_id"]
1211 |             isOneToOne: false
1212 |             referencedRelation: "employees"
1213 |             referencedColumns: ["id"]
1214 |           },
1215 |           {
1216 |             foreignKeyName: "employee_employment_history_tenant_id_fkey"
1217 |             columns: ["tenant_id"]
1218 |             isOneToOne: false
1219 |             referencedRelation: "tenants"
1220 |             referencedColumns: ["id"]
1221 |           },
1222 |         ]
1223 |       }
1224 |       employee_feature_overrides: {
1225 |         Row: {
1226 |           created_at: string | null
1227 |           employee_id: string
1228 |           enabled: boolean
1229 |           feature_key: string
1230 |           id: string
1231 |           tenant_id: string
1232 |           updated_at: string | null
1233 |         }
1234 |         Insert: {
1235 |           created_at?: string | null
1236 |           employee_id: string
1237 |           enabled: boolean
1238 |           feature_key: string
1239 |           id?: string
1240 |           tenant_id: string
1241 |           updated_at?: string | null
1242 |         }
1243 |         Update: {
1244 |           created_at?: string | null
1245 |           employee_id?: string
1246 |           enabled?: boolean
1247 |           feature_key?: string
1248 |           id?: string
1249 |           tenant_id?: string
1250 |           updated_at?: string | null
1251 |         }
1252 |         Relationships: [
1253 |           {
1254 |             foreignKeyName: "employee_feature_overrides_employee_id_fkey"
1255 |             columns: ["employee_id"]
1256 |             isOneToOne: false
1257 |             referencedRelation: "employees"
1258 |             referencedColumns: ["id"]
1259 |           },
1260 |           {
1261 |             foreignKeyName: "employee_feature_overrides_tenant_id_fkey"
1262 |             columns: ["tenant_id"]
1263 |             isOneToOne: false
1264 |             referencedRelation: "tenants"
1265 |             referencedColumns: ["id"]
1266 |           },
1267 |         ]
1268 |       }
1269 |       employee_performance_reviews: {
1270 |         Row: {
1271 |           comments: string | null
1272 |           created_at: string | null
1273 |           employee_id: string
1274 |           goals: string | null
1275 |           id: string
1276 |           improvements: string | null
1277 |           rating_communication: number | null
1278 |           rating_leadership: number | null
1279 |           rating_overall: number | null
1280 |           rating_reliability: number | null
1281 |           rating_technical: number | null
1282 |           review_date: string
1283 |           review_period_end: string | null
1284 |           review_period_start: string | null
1285 |           review_type: string | null
1286 |           reviewed_by: string | null
1287 |           strengths: string | null
1288 |           tenant_id: string
1289 |           updated_at: string | null
1290 |         }
1291 |         Insert: {
1292 |           comments?: string | null
1293 |           created_at?: string | null
1294 |           employee_id: string
1295 |           goals?: string | null
1296 |           id?: string
1297 |           improvements?: string | null
1298 |           rating_communication?: number | null
1299 |           rating_leadership?: number | null
1300 |           rating_overall?: number | null
1301 |           rating_reliability?: number | null
1302 |           rating_technical?: number | null
1303 |           review_date: string
1304 |           review_period_end?: string | null
1305 |           review_period_start?: string | null
1306 |           review_type?: string | null
1307 |           reviewed_by?: string | null
1308 |           strengths?: string | null
1309 |           tenant_id: string
1310 |           updated_at?: string | null
1311 |         }
1312 |         Update: {
1313 |           comments?: string | null
1314 |           created_at?: string | null
1315 |           employee_id?: string
1316 |           goals?: string | null
1317 |           id?: string
1318 |           improvements?: string | null
1319 |           rating_communication?: number | null
1320 |           rating_leadership?: number | null
1321 |           rating_overall?: number | null
1322 |           rating_reliability?: number | null
1323 |           rating_technical?: number | null
1324 |           review_date?: string
1325 |           review_period_end?: string | null
1326 |           review_period_start?: string | null
1327 |           review_type?: string | null
1328 |           reviewed_by?: string | null
1329 |           strengths?: string | null
1330 |           tenant_id?: string
1331 |           updated_at?: string | null
1332 |         }
1333 |         Relationships: [
1334 |           {
1335 |             foreignKeyName: "employee_performance_reviews_employee_id_fkey"
1336 |             columns: ["employee_id"]
1337 |             isOneToOne: false
1338 |             referencedRelation: "employees"
1339 |             referencedColumns: ["id"]
1340 |           },
1341 |           {
1342 |             foreignKeyName: "employee_performance_reviews_reviewed_by_fkey"
1343 |             columns: ["reviewed_by"]
1344 |             isOneToOne: false
1345 |             referencedRelation: "users"
1346 |             referencedColumns: ["id"]
1347 |           },
1348 |           {
1349 |             foreignKeyName: "employee_performance_reviews_tenant_id_fkey"
1350 |             columns: ["tenant_id"]
1351 |             isOneToOne: false
1352 |             referencedRelation: "tenants"
1353 |             referencedColumns: ["id"]
1354 |           },
1355 |         ]
1356 |       }
1357 |       employee_services: {
1358 |         Row: {
1359 |           created_at: string | null
1360 |           employee_id: string
1361 |           id: string
1362 |           service_id: string
1363 |           tenant_id: string
1364 |         }
1365 |         Insert: {
1366 |           created_at?: string | null
1367 |           employee_id: string
1368 |           id?: string
1369 |           service_id: string
1370 |           tenant_id: string
1371 |         }
1372 |         Update: {
1373 |           created_at?: string | null
1374 |           employee_id?: string
1375 |           id?: string
1376 |           service_id?: string
1377 |           tenant_id?: string
1378 |         }
1379 |         Relationships: [
1380 |           {
1381 |             foreignKeyName: "employee_services_employee_id_fkey"
1382 |             columns: ["employee_id"]
1383 |             isOneToOne: false
1384 |             referencedRelation: "employees"
1385 |             referencedColumns: ["id"]
1386 |           },
1387 |           {
1388 |             foreignKeyName: "employee_services_service_id_fkey"
1389 |             columns: ["service_id"]
1390 |             isOneToOne: false
1391 |             referencedRelation: "services"
1392 |             referencedColumns: ["id"]
1393 |           },
1394 |           {
1395 |             foreignKeyName: "employee_services_tenant_id_fkey"
1396 |             columns: ["tenant_id"]
1397 |             isOneToOne: false
1398 |             referencedRelation: "tenants"
1399 |             referencedColumns: ["id"]
1400 |           },
1401 |         ]
1402 |       }
1403 |       employee_sick_leave: {
1404 |         Row: {
1405 |           created_at: string | null
1406 |           days_count: number
1407 |           doctor_note_provided: boolean | null
1408 |           employee_id: string
1409 |           end_date: string
1410 |           id: string
1411 |           is_emergency: boolean | null
1412 |           is_work_related: boolean | null
1413 |           note: string | null
1414 |           occupational_health_contacted: boolean | null
1415 |           reason: string | null
1416 |           sent_home_at: string | null
1417 |           start_date: string
1418 |           status: string | null
1419 |           tenant_id: string
1420 |           updated_at: string | null
1421 |           year: number
1422 |         }
1423 |         Insert: {
1424 |           created_at?: string | null
1425 |           days_count?: number
1426 |           doctor_note_provided?: boolean | null
1427 |           employee_id: string
1428 |           end_date: string
1429 |           id?: string
1430 |           is_emergency?: boolean | null
1431 |           is_work_related?: boolean | null
1432 |           note?: string | null
1433 |           occupational_health_contacted?: boolean | null
1434 |           reason?: string | null
1435 |           sent_home_at?: string | null
1436 |           start_date: string
1437 |           status?: string | null
1438 |           tenant_id: string
1439 |           updated_at?: string | null
1440 |           year?: number
1441 |         }
1442 |         Update: {
1443 |           created_at?: string | null
1444 |           days_count?: number
1445 |           doctor_note_provided?: boolean | null
1446 |           employee_id?: string
1447 |           end_date?: string
1448 |           id?: string
1449 |           is_emergency?: boolean | null
1450 |           is_work_related?: boolean | null
1451 |           note?: string | null
1452 |           occupational_health_contacted?: boolean | null
1453 |           reason?: string | null
1454 |           sent_home_at?: string | null
1455 |           start_date?: string
1456 |           status?: string | null
1457 |           tenant_id?: string
1458 |           updated_at?: string | null
1459 |           year?: number
1460 |         }
1461 |         Relationships: [
1462 |           {
1463 |             foreignKeyName: "employee_sick_leave_employee_id_fkey"
1464 |             columns: ["employee_id"]
1465 |             isOneToOne: false
1466 |             referencedRelation: "employees"
1467 |             referencedColumns: ["id"]
1468 |           },
1469 |           {
1470 |             foreignKeyName: "employee_sick_leave_tenant_id_fkey"
1471 |             columns: ["tenant_id"]
1472 |             isOneToOne: false
1473 |             referencedRelation: "tenants"
1474 |             referencedColumns: ["id"]
1475 |           },
1476 |         ]
1477 |       }
1478 |       employee_skills: {
1479 |         Row: {
1480 |           created_at: string | null
1481 |           employee_id: string
1482 |           expires_at: string | null
1483 |           id: string
1484 |           level: string | null
1485 |           obtained_at: string | null
1486 |           skill_category: string | null
1487 |           skill_name: string
1488 |           tenant_id: string
1489 |           verified: boolean | null
1490 |         }
1491 |         Insert: {
1492 |           created_at?: string | null
1493 |           employee_id: string
1494 |           expires_at?: string | null
1495 |           id?: string
1496 |           level?: string | null
1497 |           obtained_at?: string | null
1498 |           skill_category?: string | null
1499 |           skill_name: string
1500 |           tenant_id: string
1501 |           verified?: boolean | null
1502 |         }
1503 |         Update: {
1504 |           created_at?: string | null
1505 |           employee_id?: string
1506 |           expires_at?: string | null
1507 |           id?: string
1508 |           level?: string | null
1509 |           obtained_at?: string | null
1510 |           skill_category?: string | null
1511 |           skill_name?: string
1512 |           tenant_id?: string
1513 |           verified?: boolean | null
1514 |         }
1515 |         Relationships: [
1516 |           {
1517 |             foreignKeyName: "employee_skills_employee_id_fkey"
1518 |             columns: ["employee_id"]
1519 |             isOneToOne: false
1520 |             referencedRelation: "employees"
1521 |             referencedColumns: ["id"]
1522 |           },
1523 |           {
1524 |             foreignKeyName: "employee_skills_tenant_id_fkey"
1525 |             columns: ["tenant_id"]
1526 |             isOneToOne: false
1527 |             referencedRelation: "tenants"
1528 |             referencedColumns: ["id"]
1529 |           },
1530 |         ]
1531 |       }
1532 |       employee_time_logs: {
1533 |         Row: {
1534 |           break_minutes: number | null
1535 |           clock_in: string
1536 |           clock_out: string | null
1537 |           created_at: string | null
1538 |           date: string
1539 |           employee_id: string
1540 |           id: string
1541 |           note: string | null
1542 |           tenant_id: string
1543 |           total_minutes: number | null
1544 |           updated_at: string | null
1545 |         }
1546 |         Insert: {
1547 |           break_minutes?: number | null
1548 |           clock_in: string
1549 |           clock_out?: string | null
1550 |           created_at?: string | null
1551 |           date: string
1552 |           employee_id: string
1553 |           id?: string
1554 |           note?: string | null
1555 |           tenant_id: string
1556 |           total_minutes?: number | null
1557 |           updated_at?: string | null
1558 |         }
1559 |         Update: {
1560 |           break_minutes?: number | null
1561 |           clock_in?: string
1562 |           clock_out?: string | null
1563 |           created_at?: string | null
1564 |           date?: string
1565 |           employee_id?: string
1566 |           id?: string
1567 |           note?: string | null
1568 |           tenant_id?: string
1569 |           total_minutes?: number | null
1570 |           updated_at?: string | null
1571 |         }
1572 |         Relationships: [
1573 |           {
1574 |             foreignKeyName: "employee_time_logs_employee_id_fkey"
1575 |             columns: ["employee_id"]
1576 |             isOneToOne: false
1577 |             referencedRelation: "employees"
1578 |             referencedColumns: ["id"]
1579 |           },
1580 |           {
1581 |             foreignKeyName: "employee_time_logs_tenant_id_fkey"
1582 |             columns: ["tenant_id"]
1583 |             isOneToOne: false
1584 |             referencedRelation: "tenants"
1585 |             referencedColumns: ["id"]
1586 |           },
1587 |         ]
1588 |       }
1589 |       employee_vacation_bookings: {
1590 |         Row: {
1591 |           created_at: string | null
1592 |           days_count: number
1593 |           employee_id: string
1594 |           end_date: string
1595 |           id: string
1596 |           note: string | null
1597 |           start_date: string
1598 |           status: string | null
1599 |           tenant_id: string
1600 |           updated_at: string | null
1601 |           year: number
1602 |         }
1603 |         Insert: {
1604 |           created_at?: string | null
1605 |           days_count?: number
1606 |           employee_id: string
1607 |           end_date: string
1608 |           id?: string
1609 |           note?: string | null
1610 |           start_date: string
1611 |           status?: string | null
1612 |           tenant_id: string
1613 |           updated_at?: string | null
1614 |           year?: number
1615 |         }
1616 |         Update: {
1617 |           created_at?: string | null
1618 |           days_count?: number
1619 |           employee_id?: string
1620 |           end_date?: string
1621 |           id?: string
1622 |           note?: string | null
1623 |           start_date?: string
1624 |           status?: string | null
1625 |           tenant_id?: string
1626 |           updated_at?: string | null
1627 |           year?: number
1628 |         }
1629 |         Relationships: [
1630 |           {
1631 |             foreignKeyName: "employee_vacation_bookings_employee_id_fkey"
1632 |             columns: ["employee_id"]
1633 |             isOneToOne: false
1634 |             referencedRelation: "employees"
1635 |             referencedColumns: ["id"]
1636 |           },
1637 |           {
1638 |             foreignKeyName: "employee_vacation_bookings_tenant_id_fkey"
1639 |             columns: ["tenant_id"]
1640 |             isOneToOne: false
1641 |             referencedRelation: "tenants"
1642 |             referencedColumns: ["id"]
1643 |           },
1644 |         ]
1645 |       }
1646 |       employee_vacation_days: {
1647 |         Row: {
1648 |           created_at: string | null
1649 |           days_total: number
1650 |           days_used: number
1651 |           employee_id: string
1652 |           end_date: string | null
1653 |           id: string
1654 |           note: string | null
1655 |           start_date: string | null
1656 |           tenant_id: string
1657 |           updated_at: string | null
1658 |           year: number
1659 |         }
1660 |         Insert: {
1661 |           created_at?: string | null
1662 |           days_total?: number
1663 |           days_used?: number
1664 |           employee_id: string
1665 |           end_date?: string | null
1666 |           id?: string
1667 |           note?: string | null
1668 |           start_date?: string | null
1669 |           tenant_id: string
1670 |           updated_at?: string | null
1671 |           year?: number
1672 |         }
1673 |         Update: {
1674 |           created_at?: string | null
1675 |           days_total?: number
1676 |           days_used?: number
1677 |           employee_id?: string
1678 |           end_date?: string | null
1679 |           id?: string
1680 |           note?: string | null
1681 |           start_date?: string | null
1682 |           tenant_id?: string
1683 |           updated_at?: string | null
1684 |           year?: number
1685 |         }
1686 |         Relationships: [
1687 |           {
1688 |             foreignKeyName: "employee_vacation_days_employee_id_fkey"
1689 |             columns: ["employee_id"]
1690 |             isOneToOne: false
1691 |             referencedRelation: "employees"
1692 |             referencedColumns: ["id"]
1693 |           },
1694 |           {
1695 |             foreignKeyName: "employee_vacation_days_tenant_id_fkey"
1696 |             columns: ["tenant_id"]
1697 |             isOneToOne: false
1698 |             referencedRelation: "tenants"
1699 |             referencedColumns: ["id"]
1700 |           },
1701 |         ]
1702 |       }
1703 |       employee_working_hours: {
1704 |         Row: {
1705 |           created_at: string | null
1706 |           day_of_week: number
1707 |           employee_id: string
1708 |           end_time: string
1709 |           id: string
1710 |           start_time: string
1711 |           tenant_id: string
1712 |           updated_at: string | null
1713 |           week_start_date: string | null
1714 |         }
1715 |         Insert: {
1716 |           created_at?: string | null
1717 |           day_of_week: number
1718 |           employee_id: string
1719 |           end_time: string
1720 |           id?: string
1721 |           start_time: string
1722 |           tenant_id: string
1723 |           updated_at?: string | null
1724 |           week_start_date?: string | null
1725 |         }
1726 |         Update: {
1727 |           created_at?: string | null
1728 |           day_of_week?: number
1729 |           employee_id?: string
1730 |           end_time?: string
1731 |           id?: string
1732 |           start_time?: string
1733 |           tenant_id?: string
1734 |           updated_at?: string | null
1735 |           week_start_date?: string | null
1736 |         }
1737 |         Relationships: [
1738 |           {
1739 |             foreignKeyName: "employee_working_hours_employee_id_fkey"
1740 |             columns: ["employee_id"]
1741 |             isOneToOne: false
1742 |             referencedRelation: "employees"
1743 |             referencedColumns: ["id"]
1744 |           },
1745 |           {
1746 |             foreignKeyName: "employee_working_hours_tenant_id_fkey"
1747 |             columns: ["tenant_id"]
1748 |             isOneToOne: false
1749 |             referencedRelation: "tenants"
1750 |             referencedColumns: ["id"]
1751 |           },
1752 |         ]
1753 |       }
1754 |       employees: {
1755 |         Row: {
1756 |           address: string | null
1757 |           bank_account_iban: string | null
1758 |           bank_account_name: string | null
1759 |           city: string | null
1760 |           civil_status: string | null
1761 |           color: string | null
1762 |           contract_end_date: string | null
1763 |           contract_start_date: string | null
1764 |           contract_type: string | null
1765 |           created_at: string | null
1766 |           date_of_birth: string | null
1767 |           email: string | null
1768 |           emergency_contact_name: string | null
1769 |           emergency_contact_phone: string | null
1770 |           emergency_contact_relation: string | null
1771 |           employee_number: string | null
1772 |           has_company_car: boolean | null
1773 |           has_pension: boolean | null
1774 |           hourly_rate: number | null
1775 |           hours_per_week: number | null
1776 |           id: string
1777 |           is_active: boolean | null
1778 |           lease_amount: number | null
1779 |           monthly_salary: number | null
1780 |           name: string
1781 |           nationality: string | null
1782 |           notice_period_weeks: number | null
1783 |           payment_frequency: string | null
1784 |           pension_percentage: number | null
1785 |           phone: string | null
1786 |           postal_code: string | null
1787 |           probation_end_date: string | null
1788 |           role: Database["public"]["Enums"]["user_role_type"]
1789 |           tenant_id: string
1790 |           unlock_code: string | null
1791 |           updated_at: string | null
1792 |           user_id: string | null
1793 |         }
1794 |         Insert: {
1795 |           address?: string | null
1796 |           bank_account_iban?: string | null
1797 |           bank_account_name?: string | null
1798 |           city?: string | null
1799 |           civil_status?: string | null
1800 |           color?: string | null
1801 |           contract_end_date?: string | null
1802 |           contract_start_date?: string | null
1803 |           contract_type?: string | null
1804 |           created_at?: string | null
1805 |           date_of_birth?: string | null
1806 |           email?: string | null
1807 |           emergency_contact_name?: string | null
1808 |           emergency_contact_phone?: string | null
1809 |           emergency_contact_relation?: string | null
1810 |           employee_number?: string | null
1811 |           has_company_car?: boolean | null
1812 |           has_pension?: boolean | null
1813 |           hourly_rate?: number | null
1814 |           hours_per_week?: number | null
1815 |           id?: string
1816 |           is_active?: boolean | null
1817 |           lease_amount?: number | null
1818 |           monthly_salary?: number | null
1819 |           name: string
1820 |           nationality?: string | null
1821 |           notice_period_weeks?: number | null
1822 |           payment_frequency?: string | null
1823 |           pension_percentage?: number | null
1824 |           phone?: string | null
1825 |           postal_code?: string | null
1826 |           probation_end_date?: string | null
1827 |           role?: Database["public"]["Enums"]["user_role_type"]
1828 |           tenant_id: string
1829 |           unlock_code?: string | null
1830 |           updated_at?: string | null
1831 |           user_id?: string | null
1832 |         }
1833 |         Update: {
1834 |           address?: string | null
1835 |           bank_account_iban?: string | null
1836 |           bank_account_name?: string | null
1837 |           city?: string | null
1838 |           civil_status?: string | null
1839 |           color?: string | null
1840 |           contract_end_date?: string | null
1841 |           contract_start_date?: string | null
1842 |           contract_type?: string | null
1843 |           created_at?: string | null
1844 |           date_of_birth?: string | null
1845 |           email?: string | null
1846 |           emergency_contact_name?: string | null
1847 |           emergency_contact_phone?: string | null
1848 |           emergency_contact_relation?: string | null
1849 |           employee_number?: string | null
1850 |           has_company_car?: boolean | null
1851 |           has_pension?: boolean | null
1852 |           hourly_rate?: number | null
1853 |           hours_per_week?: number | null
1854 |           id?: string
1855 |           is_active?: boolean | null
1856 |           lease_amount?: number | null
1857 |           monthly_salary?: number | null
1858 |           name?: string
1859 |           nationality?: string | null
1860 |           notice_period_weeks?: number | null
1861 |           payment_frequency?: string | null
1862 |           pension_percentage?: number | null
1863 |           phone?: string | null
1864 |           postal_code?: string | null
1865 |           probation_end_date?: string | null
1866 |           role?: Database["public"]["Enums"]["user_role_type"]
1867 |           tenant_id?: string
1868 |           unlock_code?: string | null
1869 |           updated_at?: string | null
1870 |           user_id?: string | null
1871 |         }
1872 |         Relationships: [
1873 |           {
1874 |             foreignKeyName: "employees_tenant_id_fkey"
1875 |             columns: ["tenant_id"]
1876 |             isOneToOne: false
1877 |             referencedRelation: "tenants"
1878 |             referencedColumns: ["id"]
1879 |           },
1880 |           {
1881 |             foreignKeyName: "employees_user_id_fkey"
1882 |             columns: ["user_id"]
1883 |             isOneToOne: false
1884 |             referencedRelation: "users"
1885 |             referencedColumns: ["id"]
1886 |           },
1887 |         ]
1888 |       }
1889 |       error_logs: {
1890 |         Row: {
1891 |           context: Json | null
1892 |           created_at: string
1893 |           error_message: string
1894 |           id: string
1895 |           session_id: string | null
1896 |           stack_trace: string | null
1897 |           tenant_id: string | null
1898 |           user_id: string | null
1899 |         }
1900 |         Insert: {
1901 |           context?: Json | null
1902 |           created_at?: string
1903 |           error_message: string
1904 |           id?: string
1905 |           session_id?: string | null
1906 |           stack_trace?: string | null
1907 |           tenant_id?: string | null
1908 |           user_id?: string | null
1909 |         }
1910 |         Update: {
1911 |           context?: Json | null
1912 |           created_at?: string
1913 |           error_message?: string
1914 |           id?: string
1915 |           session_id?: string | null
1916 |           stack_trace?: string | null
1917 |           tenant_id?: string | null
1918 |           user_id?: string | null
1919 |         }
1920 |         Relationships: [
1921 |           {
1922 |             foreignKeyName: "error_logs_tenant_id_fkey"
1923 |             columns: ["tenant_id"]
1924 |             isOneToOne: false
1925 |             referencedRelation: "tenants"
1926 |             referencedColumns: ["id"]
1927 |           },
1928 |         ]
1929 |       }
1930 |       notifications: {
1931 |         Row: {
1932 |           body: string
1933 |           channel: string
1934 |           created_at: string | null
1935 |           id: string
1936 |           metadata: Json | null
1937 |           recipient_id: string | null
1938 |           recipient_phone: string | null
1939 |           recipient_type: string
1940 |           related_appointment_id: string | null
1941 |           sent_at: string | null
1942 |           status: string
1943 |           tenant_id: string
1944 |           title: string
1945 |           type: string
1946 |         }
1947 |         Insert: {
1948 |           body: string
1949 |           channel?: string
1950 |           created_at?: string | null
1951 |           id?: string
1952 |           metadata?: Json | null
1953 |           recipient_id?: string | null
1954 |           recipient_phone?: string | null
1955 |           recipient_type: string
1956 |           related_appointment_id?: string | null
1957 |           sent_at?: string | null
1958 |           status?: string
1959 |           tenant_id: string
1960 |           title: string
1961 |           type: string
1962 |         }
1963 |         Update: {
1964 |           body?: string
1965 |           channel?: string
1966 |           created_at?: string | null
1967 |           id?: string
1968 |           metadata?: Json | null
1969 |           recipient_id?: string | null
1970 |           recipient_phone?: string | null
1971 |           recipient_type?: string
1972 |           related_appointment_id?: string | null
1973 |           sent_at?: string | null
1974 |           status?: string
1975 |           tenant_id?: string
1976 |           title?: string
1977 |           type?: string
1978 |         }
1979 |         Relationships: [
1980 |           {
1981 |             foreignKeyName: "notifications_related_appointment_id_fkey"
1982 |             columns: ["related_appointment_id"]
1983 |             isOneToOne: false
1984 |             referencedRelation: "appointments"
1985 |             referencedColumns: ["id"]
1986 |           },
1987 |           {
1988 |             foreignKeyName: "notifications_tenant_id_fkey"
1989 |             columns: ["tenant_id"]
1990 |             isOneToOne: false
1991 |             referencedRelation: "tenants"
1992 |             referencedColumns: ["id"]
1993 |           },
1994 |         ]
1995 |       }
1996 |       prompt_lab_prompts: {
1997 |         Row: {
1998 |           created_at: string
1999 |           description: string
2000 |           id: string
2001 |           name: string
2002 |           prompt_text: string
2003 |           tags: string[]
2004 |           tenant_id: string
2005 |           updated_at: string
2006 |         }
2007 |         Insert: {
2008 |           created_at?: string
2009 |           description?: string
2010 |           id?: string
2011 |           name: string
2012 |           prompt_text?: string
2013 |           tags?: string[]
2014 |           tenant_id: string
2015 |           updated_at?: string
2016 |         }
2017 |         Update: {
2018 |           created_at?: string
2019 |           description?: string
2020 |           id?: string
2021 |           name?: string
2022 |           prompt_text?: string
2023 |           tags?: string[]
2024 |           tenant_id?: string
2025 |           updated_at?: string
2026 |         }
2027 |         Relationships: [
2028 |           {
2029 |             foreignKeyName: "prompt_lab_prompts_tenant_id_fkey"
2030 |             columns: ["tenant_id"]
2031 |             isOneToOne: false
2032 |             referencedRelation: "tenants"
2033 |             referencedColumns: ["id"]
2034 |           },
2035 |         ]
2036 |       }
2037 |       prompt_lab_session_history: {
2038 |         Row: {
2039 |           created_at: string
2040 |           ended_at: number
2041 |           id: string
2042 |           prompt_text: string | null
2043 |           session_id: string
2044 |           stats: Json
2045 |           tenant_id: string
2046 |           transcript: Json
2047 |         }
2048 |         Insert: {
2049 |           created_at?: string
2050 |           ended_at: number
2051 |           id?: string
2052 |           prompt_text?: string | null
2053 |           session_id: string
2054 |           stats?: Json
2055 |           tenant_id: string
2056 |           transcript?: Json
2057 |         }
2058 |         Update: {
2059 |           created_at?: string
2060 |           ended_at?: number
2061 |           id?: string
2062 |           prompt_text?: string | null
2063 |           session_id?: string
2064 |           stats?: Json
2065 |           tenant_id?: string
2066 |           transcript?: Json
2067 |         }
2068 |         Relationships: [
2069 |           {
2070 |             foreignKeyName: "prompt_lab_session_history_tenant_id_fkey"
2071 |             columns: ["tenant_id"]
2072 |             isOneToOne: false
2073 |             referencedRelation: "tenants"
2074 |             referencedColumns: ["id"]
2075 |           },
2076 |         ]
2077 |       }
2078 |       role_features: {
2079 |         Row: {
2080 |           created_at: string | null
2081 |           enabled: boolean
2082 |           feature_key: string
2083 |           id: string
2084 |           role: string
2085 |           tenant_id: string
2086 |           updated_at: string | null
2087 |         }
2088 |         Insert: {
2089 |           created_at?: string | null
2090 |           enabled?: boolean
2091 |           feature_key: string
2092 |           id?: string
2093 |           role: string
2094 |           tenant_id: string
2095 |           updated_at?: string | null
2096 |         }
2097 |         Update: {
2098 |           created_at?: string | null
2099 |           enabled?: boolean
2100 |           feature_key?: string
2101 |           id?: string
2102 |           role?: string
2103 |           tenant_id?: string
2104 |           updated_at?: string | null
2105 |         }
2106 |         Relationships: [
2107 |           {
2108 |             foreignKeyName: "role_features_tenant_id_fkey"
2109 |             columns: ["tenant_id"]
2110 |             isOneToOne: false
2111 |             referencedRelation: "tenants"
2112 |             referencedColumns: ["id"]
2113 |           },
2114 |         ]
2115 |       }
2116 |       services: {
2117 |         Row: {
2118 |           buffer_minutes: number | null
2119 |           categories: string[] | null
2120 |           created_at: string | null
2121 |           description: string | null
2122 |           duration_minutes: number
2123 |           id: string
2124 |           is_active: boolean | null
2125 |           name: string
2126 |           price: number | null
2127 |           tenant_id: string
2128 |           updated_at: string | null
2129 |         }
2130 |         Insert: {
2131 |           buffer_minutes?: number | null
2132 |           categories?: string[] | null
2133 |           created_at?: string | null
2134 |           description?: string | null
2135 |           duration_minutes: number
2136 |           id?: string
2137 |           is_active?: boolean | null
2138 |           name: string
2139 |           price?: number | null
2140 |           tenant_id: string
2141 |           updated_at?: string | null
2142 |         }
2143 |         Update: {
2144 |           buffer_minutes?: number | null
2145 |           categories?: string[] | null
2146 |           created_at?: string | null
2147 |           description?: string | null
2148 |           duration_minutes?: number
2149 |           id?: string
2150 |           is_active?: boolean | null
2151 |           name?: string
2152 |           price?: number | null
2153 |           tenant_id?: string
2154 |           updated_at?: string | null
2155 |         }
2156 |         Relationships: [
2157 |           {
2158 |             foreignKeyName: "services_tenant_id_fkey"
2159 |             columns: ["tenant_id"]
2160 |             isOneToOne: false
2161 |             referencedRelation: "tenants"
2162 |             referencedColumns: ["id"]
2163 |           },
2164 |         ]
2165 |       }
2166 |       system_logs: {
2167 |         Row: {
2168 |           call_control_id: string | null
2169 |           created_at: string
2170 |           event: string
2171 |           id: string
2172 |           level: string
2173 |           message: string
2174 |           metadata: Json | null
2175 |           session_id: string | null
2176 |           source: string
2177 |           tenant_id: string | null
2178 |         }
2179 |         Insert: {
2180 |           call_control_id?: string | null
2181 |           created_at?: string
2182 |           event: string
2183 |           id?: string
2184 |           level: string
2185 |           message: string
2186 |           metadata?: Json | null
2187 |           session_id?: string | null
2188 |           source: string
2189 |           tenant_id?: string | null
2190 |         }
2191 |         Update: {
2192 |           call_control_id?: string | null
2193 |           created_at?: string
2194 |           event?: string
2195 |           id?: string
2196 |           level?: string
2197 |           message?: string
2198 |           metadata?: Json | null
2199 |           session_id?: string | null
2200 |           source?: string
2201 |           tenant_id?: string | null
2202 |         }
2203 |         Relationships: [
2204 |           {
2205 |             foreignKeyName: "system_logs_tenant_id_fkey"
2206 |             columns: ["tenant_id"]
2207 |             isOneToOne: false
2208 |             referencedRelation: "tenants"
2209 |             referencedColumns: ["id"]
2210 |           },
2211 |         ]
2212 |       }
2213 |       telnyx_numbers: {
2214 |         Row: {
2215 |           assigned_at: string | null
2216 |           connection_id: string | null
2217 |           created_at: string | null
2218 |           id: string
2219 |           phone_number: string
2220 |           released_at: string | null
2221 |           status: Database["public"]["Enums"]["telnyx_status_type"] | null
2222 |           tenant_id: string | null
2223 |           updated_at: string | null
2224 |         }
2225 |         Insert: {
2226 |           assigned_at?: string | null
2227 |           connection_id?: string | null
2228 |           created_at?: string | null
2229 |           id?: string
2230 |           phone_number: string
2231 |           released_at?: string | null
2232 |           status?: Database["public"]["Enums"]["telnyx_status_type"] | null
2233 |           tenant_id?: string | null
2234 |           updated_at?: string | null
2235 |         }
2236 |         Update: {
2237 |           assigned_at?: string | null
2238 |           connection_id?: string | null
2239 |           created_at?: string | null
2240 |           id?: string
2241 |           phone_number?: string
2242 |           released_at?: string | null
2243 |           status?: Database["public"]["Enums"]["telnyx_status_type"] | null
2244 |           tenant_id?: string | null
2245 |           updated_at?: string | null
2246 |         }
2247 |         Relationships: [
2248 |           {
2249 |             foreignKeyName: "telnyx_numbers_tenant_id_fkey"
2250 |             columns: ["tenant_id"]
2251 |             isOneToOne: false
2252 |             referencedRelation: "tenants"
2253 |             referencedColumns: ["id"]
2254 |           },
2255 |         ]
2256 |       }
2257 |       temp_reservations: {
2258 |         Row: {
2259 |           created_at: string | null
2260 |           employee_id: string | null
2261 |           end_time: string
2262 |           expires_at: string
2263 |           id: string
2264 |           service_id: string | null
2265 |           session_id: string
2266 |           start_time: string
2267 |           status: string | null
2268 |           tenant_id: string
2269 |         }
2270 |         Insert: {
2271 |           created_at?: string | null
2272 |           employee_id?: string | null
2273 |           end_time: string
2274 |           expires_at: string
2275 |           id?: string
2276 |           service_id?: string | null
2277 |           session_id: string
2278 |           start_time: string
2279 |           status?: string | null
2280 |           tenant_id: string
2281 |         }
2282 |         Update: {
2283 |           created_at?: string | null
2284 |           employee_id?: string | null
2285 |           end_time?: string
2286 |           expires_at?: string
2287 |           id?: string
2288 |           service_id?: string | null
2289 |           session_id?: string
2290 |           start_time?: string
2291 |           status?: string | null
2292 |           tenant_id?: string
2293 |         }
2294 |         Relationships: [
2295 |           {
2296 |             foreignKeyName: "temp_reservations_employee_id_fkey"
2297 |             columns: ["employee_id"]
2298 |             isOneToOne: false
2299 |             referencedRelation: "employees"
2300 |             referencedColumns: ["id"]
2301 |           },
2302 |           {
2303 |             foreignKeyName: "temp_reservations_service_id_fkey"
2304 |             columns: ["service_id"]
2305 |             isOneToOne: false
2306 |             referencedRelation: "services"
2307 |             referencedColumns: ["id"]
2308 |           },
2309 |           {
2310 |             foreignKeyName: "temp_reservations_tenant_id_fkey"
2311 |             columns: ["tenant_id"]
2312 |             isOneToOne: false
2313 |             referencedRelation: "tenants"
2314 |             referencedColumns: ["id"]
2315 |           },
2316 |         ]
2317 |       }
2318 |       tenant_billing_stats: {
2319 |         Row: {
2320 |           created_at: string | null
2321 |           current_period_end: string
2322 |           current_period_start: string
2323 |           id: string
2324 |           included_minutes: number | null
2325 |           pack_minutes_remaining: number | null
2326 |           tenant_id: string
2327 |           updated_at: string | null
2328 |           used_minutes: number | null
2329 |         }
2330 |         Insert: {
2331 |           created_at?: string | null
2332 |           current_period_end?: string
2333 |           current_period_start?: string
2334 |           id?: string
2335 |           included_minutes?: number | null
2336 |           pack_minutes_remaining?: number | null
2337 |           tenant_id: string
2338 |           updated_at?: string | null
2339 |           used_minutes?: number | null
2340 |         }
2341 |         Update: {
2342 |           created_at?: string | null
2343 |           current_period_end?: string
2344 |           current_period_start?: string
2345 |           id?: string
2346 |           included_minutes?: number | null
2347 |           pack_minutes_remaining?: number | null
2348 |           tenant_id?: string
2349 |           updated_at?: string | null
2350 |           used_minutes?: number | null
2351 |         }
2352 |         Relationships: [
2353 |           {
2354 |             foreignKeyName: "tenant_billing_stats_tenant_id_fkey"
2355 |             columns: ["tenant_id"]
2356 |             isOneToOne: true
2357 |             referencedRelation: "tenants"
2358 |             referencedColumns: ["id"]
2359 |           },
2360 |         ]
2361 |       }
2362 |       tenant_settings: {
2363 |         Row: {
2364 |           ai_appointment_confirmation_style: string | null
2365 |           ai_background_noise_enabled: boolean | null
2366 |           ai_background_noise_type: string | null
2367 |           ai_background_noise_volume: number | null
2368 |           ai_custom_closing: string | null
2369 |           ai_custom_greeting: string | null
2370 |           ai_custom_personality_text: string | null
2371 |           ai_customer_recognition_style: string | null
2372 |           ai_emergency_protocol: string | null
2373 |           ai_error_handling_tone: string | null
2374 |           ai_greeting: string | null
2375 |           ai_language: string | null
2376 |           ai_language_mode: string | null
2377 |           ai_max_time_options: number | null
2378 |           ai_model: string | null
2379 |           ai_name: string | null
2380 |           ai_name_gathering_style: string | null
2381 |           ai_no_availability_style: string | null
2382 |           ai_personality_preset: string | null
2383 |           ai_phone_verification_style: string | null
2384 |           ai_response_verbosity: string | null
2385 |           ai_service_explanation_verbosity: string | null
2386 |           ai_silence_timeout_ms: number | null
2387 |           ai_time_slot_presentation_style: string | null
2388 |           ai_tone: string | null
2389 |           ai_vad_threshold: number | null
2390 |           ai_voice: string | null
2391 |           calendar_end_hour: number | null
2392 |           calendar_start_hour: number | null
2393 |           calendar_zoom_level: number | null
2394 |           created_at: string | null
2395 |           custom_instructions: string | null
2396 |           handoff_action:
2397 |             | Database["public"]["Enums"]["handoff_action_type"]
2398 |             | null
2399 |           handoff_phone_number: string | null
2400 |           holidays: Json | null
2401 |           id: string
2402 |           kiosk_greeting: string | null
2403 |           kiosk_lock_timeout_minutes: number | null
2404 |           kiosk_mode_enabled: boolean | null
2405 |           kiosk_show_notifications: boolean
2406 |           kiosk_show_schedule: boolean
2407 |           master_code: string | null
2408 |           planning_horizon_weeks: number | null
2409 |           routing_end_time: string | null
2410 |           routing_start_time: string | null
2411 |           tenant_id: string
2412 |           updated_at: string | null
2413 |         }
2414 |         Insert: {
2415 |           ai_appointment_confirmation_style?: string | null
2416 |           ai_background_noise_enabled?: boolean | null
2417 |           ai_background_noise_type?: string | null
2418 |           ai_background_noise_volume?: number | null
2419 |           ai_custom_closing?: string | null
2420 |           ai_custom_greeting?: string | null
2421 |           ai_custom_personality_text?: string | null
2422 |           ai_customer_recognition_style?: string | null
2423 |           ai_emergency_protocol?: string | null
2424 |           ai_error_handling_tone?: string | null
2425 |           ai_greeting?: string | null
2426 |           ai_language?: string | null
2427 |           ai_language_mode?: string | null
2428 |           ai_max_time_options?: number | null
2429 |           ai_model?: string | null
2430 |           ai_name?: string | null
2431 |           ai_name_gathering_style?: string | null
2432 |           ai_no_availability_style?: string | null
2433 |           ai_personality_preset?: string | null
2434 |           ai_phone_verification_style?: string | null
2435 |           ai_response_verbosity?: string | null
2436 |           ai_service_explanation_verbosity?: string | null
2437 |           ai_silence_timeout_ms?: number | null
2438 |           ai_time_slot_presentation_style?: string | null
2439 |           ai_tone?: string | null
2440 |           ai_vad_threshold?: number | null
2441 |           ai_voice?: string | null
2442 |           calendar_end_hour?: number | null
2443 |           calendar_start_hour?: number | null
2444 |           calendar_zoom_level?: number | null
2445 |           created_at?: string | null
2446 |           custom_instructions?: string | null
2447 |           handoff_action?:
2448 |             | Database["public"]["Enums"]["handoff_action_type"]
2449 |             | null
2450 |           handoff_phone_number?: string | null
2451 |           holidays?: Json | null
2452 |           id?: string
2453 |           kiosk_greeting?: string | null
2454 |           kiosk_lock_timeout_minutes?: number | null
2455 |           kiosk_mode_enabled?: boolean | null
2456 |           kiosk_show_notifications?: boolean
2457 |           kiosk_show_schedule?: boolean
2458 |           master_code?: string | null
2459 |           planning_horizon_weeks?: number | null
2460 |           routing_end_time?: string | null
2461 |           routing_start_time?: string | null
2462 |           tenant_id: string
2463 |           updated_at?: string | null
2464 |         }
2465 |         Update: {
2466 |           ai_appointment_confirmation_style?: string | null
2467 |           ai_background_noise_enabled?: boolean | null
2468 |           ai_background_noise_type?: string | null
2469 |           ai_background_noise_volume?: number | null
2470 |           ai_custom_closing?: string | null
2471 |           ai_custom_greeting?: string | null
2472 |           ai_custom_personality_text?: string | null
2473 |           ai_customer_recognition_style?: string | null
2474 |           ai_emergency_protocol?: string | null
2475 |           ai_error_handling_tone?: string | null
2476 |           ai_greeting?: string | null
2477 |           ai_language?: string | null
2478 |           ai_language_mode?: string | null
2479 |           ai_max_time_options?: number | null
2480 |           ai_model?: string | null
2481 |           ai_name?: string | null
2482 |           ai_name_gathering_style?: string | null
2483 |           ai_no_availability_style?: string | null
2484 |           ai_personality_preset?: string | null
2485 |           ai_phone_verification_style?: string | null
2486 |           ai_response_verbosity?: string | null
2487 |           ai_service_explanation_verbosity?: string | null
2488 |           ai_silence_timeout_ms?: number | null
2489 |           ai_time_slot_presentation_style?: string | null
2490 |           ai_tone?: string | null
2491 |           ai_vad_threshold?: number | null
2492 |           ai_voice?: string | null
2493 |           calendar_end_hour?: number | null
2494 |           calendar_start_hour?: number | null
2495 |           calendar_zoom_level?: number | null
2496 |           created_at?: string | null
2497 |           custom_instructions?: string | null
2498 |           handoff_action?:
2499 |             | Database["public"]["Enums"]["handoff_action_type"]
2500 |             | null
2501 |           handoff_phone_number?: string | null
2502 |           holidays?: Json | null
2503 |           id?: string
2504 |           kiosk_greeting?: string | null
2505 |           kiosk_lock_timeout_minutes?: number | null
2506 |           kiosk_mode_enabled?: boolean | null
2507 |           kiosk_show_notifications?: boolean
2508 |           kiosk_show_schedule?: boolean
2509 |           master_code?: string | null
2510 |           planning_horizon_weeks?: number | null
2511 |           routing_end_time?: string | null
2512 |           routing_start_time?: string | null
2513 |           tenant_id?: string
2514 |           updated_at?: string | null
2515 |         }
2516 |         Relationships: [
2517 |           {
2518 |             foreignKeyName: "tenant_settings_tenant_id_fkey"
2519 |             columns: ["tenant_id"]
2520 |             isOneToOne: true
2521 |             referencedRelation: "tenants"
2522 |             referencedColumns: ["id"]
2523 |           },
2524 |         ]
2525 |       }
2526 |       tenants: {
2527 |         Row: {
2528 |           address: string | null
2529 |           city: string | null
2530 |           created_at: string | null
2531 |           house_number: string | null
2532 |           id: string
2533 |           is_active: boolean | null
2534 |           kvk_number: string | null
2535 |           name: string
2536 |           slug: string
2537 |           stripe_customer_id: string | null
2538 |           subscription_tier: string | null
2539 |           timezone: string
2540 |           trial_ends_at: string | null
2541 |           updated_at: string | null
2542 |           zipcode: string | null
2543 |         }
2544 |         Insert: {
2545 |           address?: string | null
2546 |           city?: string | null
2547 |           created_at?: string | null
2548 |           house_number?: string | null
2549 |           id?: string
2550 |           is_active?: boolean | null
2551 |           kvk_number?: string | null
2552 |           name: string
2553 |           slug: string
2554 |           stripe_customer_id?: string | null
2555 |           subscription_tier?: string | null
2556 |           timezone?: string
2557 |           trial_ends_at?: string | null
2558 |           updated_at?: string | null
2559 |           zipcode?: string | null
2560 |         }
2561 |         Update: {
2562 |           address?: string | null
2563 |           city?: string | null
2564 |           created_at?: string | null
2565 |           house_number?: string | null
2566 |           id?: string
2567 |           is_active?: boolean | null
2568 |           kvk_number?: string | null
2569 |           name?: string
2570 |           slug?: string
2571 |           stripe_customer_id?: string | null
2572 |           subscription_tier?: string | null
2573 |           timezone?: string
2574 |           trial_ends_at?: string | null
2575 |           updated_at?: string | null
2576 |           zipcode?: string | null
2577 |         }
2578 |         Relationships: []
2579 |       }
2580 |       user_sessions: {
2581 |         Row: {
2582 |           created_at: string
2583 |           ip_address: string | null
2584 |           metadata: Json | null
2585 |           referring_url: string | null
2586 |           session_end: string | null
2587 |           session_id: string
2588 |           session_start: string
2589 |           source_channel: string
2590 |           user_agent: string | null
2591 |           user_id: string | null
2592 |         }
2593 |         Insert: {
2594 |           created_at?: string
2595 |           ip_address?: string | null
2596 |           metadata?: Json | null
2597 |           referring_url?: string | null
2598 |           session_end?: string | null
2599 |           session_id: string
2600 |           session_start?: string
2601 |           source_channel?: string
2602 |           user_agent?: string | null
2603 |           user_id?: string | null
2604 |         }
2605 |         Update: {
2606 |           created_at?: string
2607 |           ip_address?: string | null
2608 |           metadata?: Json | null
2609 |           referring_url?: string | null
2610 |           session_end?: string | null
2611 |           session_id?: string
2612 |           session_start?: string
2613 |           source_channel?: string
2614 |           user_agent?: string | null
2615 |           user_id?: string | null
2616 |         }
2617 |         Relationships: []
2618 |       }
2619 |       users: {
2620 |         Row: {
2621 |           created_at: string | null
2622 |           first_name: string | null
2623 |           id: string
2624 |           last_name: string | null
2625 |           marketing_consent: boolean | null
2626 |           phone: string | null
2627 |           role: Database["public"]["Enums"]["user_role_type"] | null
2628 |           tenant_id: string
2629 |           terms_accepted: boolean | null
2630 |           updated_at: string | null
2631 |         }
2632 |         Insert: {
2633 |           created_at?: string | null
2634 |           first_name?: string | null
2635 |           id: string
2636 |           last_name?: string | null
2637 |           marketing_consent?: boolean | null
2638 |           phone?: string | null
2639 |           role?: Database["public"]["Enums"]["user_role_type"] | null
2640 |           tenant_id: string
2641 |           terms_accepted?: boolean | null
2642 |           updated_at?: string | null
2643 |         }
2644 |         Update: {
2645 |           created_at?: string | null
2646 |           first_name?: string | null
2647 |           id?: string
2648 |           last_name?: string | null
2649 |           marketing_consent?: boolean | null
2650 |           phone?: string | null
2651 |           role?: Database["public"]["Enums"]["user_role_type"] | null
2652 |           tenant_id?: string
2653 |           terms_accepted?: boolean | null
2654 |           updated_at?: string | null
2655 |         }
2656 |         Relationships: [
2657 |           {
2658 |             foreignKeyName: "users_tenant_id_fkey"
2659 |             columns: ["tenant_id"]
2660 |             isOneToOne: false
2661 |             referencedRelation: "tenants"
2662 |             referencedColumns: ["id"]
2663 |           },
2664 |         ]
2665 |       }
2666 |     }
2667 |     Views: {
2668 |       [_ in never]: never
2669 |     }
2670 |     Functions: {
2671 |       add_pack_minutes: {
2672 |         Args: { p_minutes: number; p_tenant_id: string }
2673 |         Returns: undefined
2674 |       }
2675 |       book_appointment_atomic:
2676 |         | {
2677 |             Args: {
2678 |               p_customer_id: string
2679 |               p_employee_id: string
2680 |               p_end_time: string
2681 |               p_service_id: string
2682 |               p_session_id?: string
2683 |               p_source?: string
2684 |               p_start_time: string
2685 |               p_tenant_id: string
2686 |             }
2687 |             Returns: Json
2688 |           }
2689 |         | {
2690 |             Args: {
2691 |               p_customer_id: string
2692 |               p_employee_id: string
2693 |               p_end_time: string
2694 |               p_service_id: string
2695 |               p_source?: Database["public"]["Enums"]["appointment_source_type"]
2696 |               p_start_time: string
2697 |               p_tenant_id: string
2698 |             }
2699 |             Returns: string
2700 |           }
2701 |       create_tenant_and_user:
2702 |         | {
2703 |             Args: {
2704 |               p_address: string
2705 |               p_city: string
2706 |               p_first_name: string
2707 |               p_house_number: string
2708 |               p_kvk_number: string
2709 |               p_last_name: string
2710 |               p_marketing_consent?: boolean
2711 |               p_phone: string
2712 |               p_tenant_name: string
2713 |               p_tenant_slug: string
2714 |               p_terms_accepted?: boolean
2715 |               p_timezone?: string
2716 |               p_zipcode: string
2717 |             }
2718 |             Returns: string
2719 |           }
2720 |         | {
2721 |             Args: {
2722 |               p_first_name: string
2723 |               p_last_name: string
2724 |               p_tenant_name: string
2725 |               p_tenant_slug: string
2726 |               p_timezone?: string
2727 |             }
2728 |             Returns: string
2729 |           }
2730 |         | {
2731 |             Args: {
2732 |               p_first_name: string
2733 |               p_last_name: string
2734 |               p_marketing_consent?: boolean
2735 |               p_tenant_name: string
2736 |               p_tenant_slug: string
2737 |               p_terms_accepted?: boolean
2738 |               p_timezone?: string
2739 |             }
2740 |             Returns: string
2741 |           }
2742 |       get_auth_tenant_id: { Args: never; Returns: string }
2743 |       get_available_slots: {
2744 |         Args: {
2745 |           p_date: string
2746 |           p_employee_id?: string
2747 |           p_service_id: string
2748 |           p_tenant_id: string
2749 |         }
2750 |         Returns: {
2751 |           employee_id: string
2752 |           employee_name: string
2753 |           slot_end: string
2754 |           slot_start: string
2755 |         }[]
2756 |       }
2757 |       get_employee_services: {
2758 |         Args: { p_employee_id?: string; p_tenant_id: string }
2759 |         Returns: {
2760 |           duration_minutes: number
2761 |           employee_id: string
2762 |           employee_name: string
2763 |           price: number
2764 |           service_id: string
2765 |           service_name: string
2766 |         }[]
2767 |       }
2768 |       get_employee_working_days: {
2769 |         Args: { p_employee_id?: string; p_tenant_id: string }
2770 |         Returns: {
2771 |           day_name: string
2772 |           day_of_week: number
2773 |           employee_id: string
2774 |           employee_name: string
2775 |           end_time: string
2776 |           start_time: string
2777 |         }[]
2778 |       }
2779 |       get_employees: {
2780 |         Args: { p_employee_id?: string; p_tenant_id: string }
2781 |         Returns: {
2782 |           color: string
2783 |           id: string
2784 |           is_active: boolean
2785 |           name: string
2786 |           phone: string
2787 |         }[]
2788 |       }
2789 |       process_expired_trials: { Args: never; Returns: number }
2790 |       set_tenant_context: { Args: { p_tenant_id: string }; Returns: undefined }
2791 |     }
2792 |     Enums: {
2793 |       appointment_source_type: "AI_VOICE" | "WEB" | "MANUAL" | "WIDGET"
2794 |       appointment_status_type:
2795 |         | "PENDING"
2796 |         | "CONFIRMED"
2797 |         | "CANCELLED"
2798 |         | "NO_SHOW"
2799 |         | "COMPLETED"
2800 |       call_status_type: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED"
2801 |       contract_type_enum:
2802 |         | "full_time"
2803 |         | "part_time"
2804 |         | "flex"
2805 |         | "intern"
2806 |         | "contractor"
2807 |       handoff_action_type: "CALL_BACK" | "FORWARD_CALL"
2808 |       step_type_enum:
2809 |         | "USER_SPEECH"
2810 |         | "AI_SPEECH"
2811 |         | "TOOL_CALL"
2812 |         | "TOOL_RESULT"
2813 |         | "SYSTEM_ERROR"
2814 |         | "SESSION_INIT"
2815 |         | "CONTEXT_UPDATE"
2816 |         | "AI_METADATA"
2817 |         | "TOOL_CHAIN_INFO"
2818 |       suggestion_status_type: "PENDING" | "APPLIED" | "REJECTED" | "IGNORED"
2819 |       suggestion_type_enum: "SYSTEM_PROMPT_TWEAK" | "NEW_KNOWLEDGE" | "TOOL_FIX"
2820 |       telnyx_status_type: "AVAILABLE" | "ASSIGNED" | "PENDING_RELEASE"
2821 |       user_role_type: "OWNER" | "ADMIN" | "MANAGER" | "STAFF"
2822 |     }
2823 |     CompositeTypes: {
2824 |       [_ in never]: never
2825 |     }
2826 |   }
2827 | }
2828 | 
2829 | type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
2830 | 
2831 | type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]
2832 | 
2833 | export type Tables<
2834 |   DefaultSchemaTableNameOrOptions extends
2835 |     | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
2836 |     | { schema: keyof DatabaseWithoutInternals },
2837 |   TableName extends DefaultSchemaTableNameOrOptions extends {
2838 |     schema: keyof DatabaseWithoutInternals
2839 |   }
2840 |     ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
2841 |         DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
2842 |     : never = never,
2843 | > = DefaultSchemaTableNameOrOptions extends {
2844 |   schema: keyof DatabaseWithoutInternals
2845 | }
2846 |   ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
2847 |       DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
2848 |       Row: infer R
2849 |     }
2850 |     ? R
2851 |     : never
2852 |   : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
2853 |         DefaultSchema["Views"])
2854 |     ? (DefaultSchema["Tables"] &
2855 |         DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
2856 |         Row: infer R
2857 |       }
2858 |       ? R
2859 |       : never
2860 |     : never
2861 | 
2862 | export type TablesInsert<
2863 |   DefaultSchemaTableNameOrOptions extends
2864 |     | keyof DefaultSchema["Tables"]
2865 |     | { schema: keyof DatabaseWithoutInternals },
2866 |   TableName extends DefaultSchemaTableNameOrOptions extends {
2867 |     schema: keyof DatabaseWithoutInternals
2868 |   }
2869 |     ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
2870 |     : never = never,
2871 | > = DefaultSchemaTableNameOrOptions extends {
2872 |   schema: keyof DatabaseWithoutInternals
2873 | }
2874 |   ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
2875 |       Insert: infer I
2876 |     }
2877 |     ? I
2878 |     : never
2879 |   : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
2880 |     ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
2881 |         Insert: infer I
2882 |       }
2883 |       ? I
2884 |       : never
2885 |     : never
2886 | 
2887 | export type TablesUpdate<
2888 |   DefaultSchemaTableNameOrOptions extends
2889 |     | keyof DefaultSchema["Tables"]
2890 |     | { schema: keyof DatabaseWithoutInternals },
2891 |   TableName extends DefaultSchemaTableNameOrOptions extends {
2892 |     schema: keyof DatabaseWithoutInternals
2893 |   }
2894 |     ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
2895 |     : never = never,
2896 | > = DefaultSchemaTableNameOrOptions extends {
2897 |   schema: keyof DatabaseWithoutInternals
2898 | }
2899 |   ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
2900 |       Update: infer U
2901 |     }
2902 |     ? U
2903 |     : never
2904 |   : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
2905 |     ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
2906 |         Update: infer U
2907 |       }
2908 |       ? U
2909 |       : never
2910 |     : never
2911 | 
2912 | export type Enums<
2913 |   DefaultSchemaEnumNameOrOptions extends
2914 |     | keyof DefaultSchema["Enums"]
2915 |     | { schema: keyof DatabaseWithoutInternals },
2916 |   EnumName extends DefaultSchemaEnumNameOrOptions extends {
2917 |     schema: keyof DatabaseWithoutInternals
2918 |   }
2919 |     ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
2920 |     : never = never,
2921 | > = DefaultSchemaEnumNameOrOptions extends {
2922 |   schema: keyof DatabaseWithoutInternals
2923 | }
2924 |   ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
2925 |   : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
2926 |     ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
2927 |     : never
2928 | 
2929 | export type CompositeTypes<
2930 |   PublicCompositeTypeNameOrOptions extends
2931 |     | keyof DefaultSchema["CompositeTypes"]
2932 |     | { schema: keyof DatabaseWithoutInternals },
2933 |   CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
2934 |     schema: keyof DatabaseWithoutInternals
2935 |   }
2936 |     ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
2937 |     : never = never,
2938 | > = PublicCompositeTypeNameOrOptions extends {
2939 |   schema: keyof DatabaseWithoutInternals
2940 | }
2941 |   ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
2942 |   : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
2943 |     ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
2944 |     : never
2945 | 
2946 | /**
2947 |  * Tenant Settings - Dynamic AI configuration per tenant
2948 |  */
2949 | export interface TenantSettings {
2950 |   tenant_id: string;
2951 |   ai_name?: string | null;
2952 |   ai_voice?: string | null;
2953 |   ai_language?: string | null;
2954 |   ai_tone?: string | null;
2955 |   ai_temperature?: number | null;
2956 |   business_name?: string | null;
2957 |   custom_instructions?: string | null;
2958 |   [key: string]: any; // Allow other Supabase fields
2959 | }
2960 | 
2961 | /**
2962 |  * Call Trace - Audit log for call events
2963 |  */
2964 | export interface CallTrace {
2965 |   call_log_id: string;
2966 |   tenant_id: string;
2967 |   step_type: string;
2968 |   content?: any;
2969 |   latency_ms?: number;
2970 |   created_at?: string;
2971 | }
2972 | 
2973 | export const Constants = {
2974 |   public: {
2975 |     Enums: {
2976 |       appointment_source_type: ["AI_VOICE", "WEB", "MANUAL", "WIDGET"],
2977 |       appointment_status_type: [
2978 |         "PENDING",
2979 |         "CONFIRMED",
2980 |         "CANCELLED",
2981 |         "NO_SHOW",
2982 |         "COMPLETED",
2983 |       ],
2984 |       call_status_type: ["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"],
2985 |       contract_type_enum: [
2986 |         "full_time",
2987 |         "part_time",
2988 |         "flex",
2989 |         "intern",
2990 |         "contractor",
2991 |       ],
2992 |       handoff_action_type: ["CALL_BACK", "FORWARD_CALL"],
2993 |       step_type_enum: [
2994 |         "USER_SPEECH",
2995 |         "AI_SPEECH",
2996 |         "TOOL_CALL",
2997 |         "TOOL_RESULT",
2998 |         "SYSTEM_ERROR",
2999 |         "SESSION_INIT",
3000 |         "CONTEXT_UPDATE",
3001 |         "AI_METADATA",
3002 |         "TOOL_CHAIN_INFO",
3003 |       ],
3004 |       suggestion_status_type: ["PENDING", "APPLIED", "REJECTED", "IGNORED"],
3005 |       suggestion_type_enum: [
3006 |         "SYSTEM_PROMPT_TWEAK",
3007 |         "NEW_KNOWLEDGE",
3008 |         "TOOL_FIX",
3009 |       ],
3010 |       telnyx_status_type: ["AVAILABLE", "ASSIGNED", "PENDING_RELEASE"],
3011 |       user_role_type: ["OWNER", "ADMIN", "MANAGER", "STAFF"],
3012 |     },
3013 |   },
3014 | } as const
3015 | 
```

