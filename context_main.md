# Context: context_main.md

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

