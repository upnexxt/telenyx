# Context: context_src_core.md

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

