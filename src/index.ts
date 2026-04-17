import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import { config } from './core/config';
import { logger, logCallEvent } from './core/logger';
import { CallManager } from './core/CallManager';
import { CallStatus } from './types';
import { correlationIdMiddleware } from './api/middleware';
import { telnyxWebhookRouter } from './api/routes/telnyxWebhook';
import { AIService } from './services/AIService';
import { SupabaseService } from './services/SupabaseService';
import { AudioPipeline } from './audio/AudioPipeline';
import { EventLoopMonitor } from './core/EventLoopMonitor';
import { BatchLogger } from './core/BatchLogger';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const callManager = CallManager.getInstance();
const eventLoopMonitor = EventLoopMonitor.getInstance(); // Initialize system health monitoring
const batchLogger = BatchLogger.getInstance(); // Initialize async batch logging
let isShuttingDown = false;

// Middleware
app.use(express.json());
app.use(express.text({ type: 'text/xml' })); // For TeXML responses
app.use(correlationIdMiddleware);

// Routes
app.use('/api/v1/telnyx', telnyxWebhookRouter);

// Health check endpoints
app.get('/health/liveness', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/readiness', (_req, res) => {
  const activeCalls = callManager.getSessionCount();
  const isReady = !isShuttingDown && activeCalls < 100; // Arbitrary limit

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not ready',
    activeCalls,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', (_req, res) => {
  const metrics = {
    activeCalls: callManager.getSessionCount(),
    cpuUsage: process.cpuUsage(),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };

  res.json(metrics);
});

// WebSocket handling for media streams
wss.on('connection', (ws, req) => {
  logger.info({ 
    url: req.url, 
    headers: req.headers,
    remoteAddress: req.socket.remoteAddress 
  }, 'Incoming WebSocket connection attempt');

  if (isShuttingDown) {
    ws.close(1001, 'Server is shutting down');
    return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const tenantId = url.searchParams.get('tenantId');

  if (!sessionId || !tenantId) {
    logger.warn({ url: req.url }, 'WebSocket connection missing required parameters');
    ws.close(1008, 'Missing sessionId or tenantId');
    return;
  }

  const callManager = CallManager.getInstance();
  const session = callManager.getSession(sessionId);

  if (!session) {
    logger.warn({ sessionId, tenantId }, 'No session found for WebSocket connection');
    ws.close(1008, 'Invalid session');
    return;
  }

  // Update session with WebSocket connection
  session.metadata['websocket'] = ws;
  session.metadata['startTime'] = new Date();

  logCallEvent('info', 'WebSocket media stream connected', {
    sessionId,
    tenantId,
    callId: session.callControlId
  });

  // Handle incoming messages (Telnyx media frames)
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.event === 'media') {
        // Process incoming audio from Telnyx → Gemini via DSP pipeline
        const audioPayload = message.media.payload;

        logCallEvent('info', 'Received media frame from Telnyx', {
          sessionId,
          tenantId,
          payloadLength: audioPayload.length
        });

        // Apply DSP transformations and forward to Gemini
        try {
          const aiService = AIService.getInstance();
          const pipeline = AudioPipeline.getInstance();
          const dspState = session.dspState;

          if (!dspState) {
            throw new Error('DSP state not initialized for session');
          }

          // Process inbound audio through DSP pipeline:
          // - Swap16 (BE → LE endianness)
          // - DC offset removal (high-pass at 80Hz)
          // - Echo suppression (if AI is speaking)
          const isAiSpeaking = session.status === CallStatus.AI_SPEAKING;
          const processed = pipeline.processInbound(audioPayload, dspState.dcIn, isAiSpeaking);

          // Send to Gemini
          aiService.sendAudio(sessionId, processed);

          logCallEvent('info', 'Sent audio chunk to Gemini', {
            sessionId,
            tenantId,
            chunkSize: processed.length
          });

        } catch (error) {
          const err = error as Error;
          logger.error({
            sessionId,
            tenantId,
            error: err.message
          }, 'Error processing inbound audio');
        }

      } else if (message.event === 'connected') {
        logCallEvent('info', 'Media stream connected', {
          sessionId,
          tenantId
        });

        // Update session status
        callManager.updateSessionStatus(sessionId, CallStatus.CONNECTED);

        // Initialize DSP jitter buffer with drain callback
        const pipeline = AudioPipeline.getInstance();
        pipeline.createJitterBuffer(sessionId, (chunk: Buffer) => {
          // Drain callback: send 20ms chunk to Telnyx
          callManager.sendAudioToTelnyx(sessionId, chunk.toString('base64'));
        });

        // Initialize call log
        const supabase = SupabaseService.getInstance();
        await supabase.createCallLog(
          sessionId,
          tenantId,
          session.metadata['fromNumber'] as string,
          session.metadata['toNumber'] as string,
          session.callControlId
        );

        // Start Gemini AI session
        const aiService = AIService.getInstance();
        await aiService.startSession(sessionId, tenantId);

        // Log system event
        await supabase.logSystemEvent(
          tenantId,
          'media_stream_connected',
          { sessionId, callControlId: session.callControlId },
          sessionId
        );

      } else if (message.event === 'stopped') {
        logCallEvent('info', 'Media stream stopped', {
          sessionId,
          tenantId
        });

        // Update session status
        callManager.updateSessionStatus(sessionId, CallStatus.TERMINATING);

        // Destroy DSP jitter buffer
        const pipeline = AudioPipeline.getInstance();
        pipeline.destroyJitterBuffer(sessionId);

        // Finalize call log and billing
        const supabase = SupabaseService.getInstance();
        const startTime = session.metadata['startTime'] as Date;
        const durationSeconds = startTime ? Math.floor((Date.now() - startTime.getTime()) / 1000) : 0;
        const minutesUsed = Math.ceil(durationSeconds / 60);

        await supabase.finalizeCallLog(sessionId, durationSeconds);
        await supabase.updateTenantBilling(tenantId, minutesUsed);

        // Log system event
        await supabase.logSystemEvent(
          tenantId,
          'media_stream_stopped',
          { sessionId, durationSeconds, minutesUsed },
          sessionId
        );

        // End Gemini session
        const aiService = AIService.getInstance();
        aiService.endSession(sessionId);

        callManager.updateSessionStatus(sessionId, CallStatus.TERMINATED);
        callManager.destroySession(sessionId);
      }

    } catch (error) {
      const err = error as Error;
      logger.error({
        sessionId,
        tenantId,
        error: err.message
      }, 'Error processing WebSocket message');
    }
  });

  ws.on('close', () => {
    logCallEvent('info', 'WebSocket connection closed', {
      sessionId,
      tenantId
    });
  });

  ws.on('error', (error) => {
    const err = error as Error;
    logger.error({
      sessionId,
      tenantId,
      error: err.message
    }, 'WebSocket error');
  });
});

// Connection timeout guard
const TIMEOUT_CHECK_INTERVAL = 30000; // 30 seconds
const SESSION_TIMEOUT = 300000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  const sessions = callManager.getActiveSessions();

  for (const session of sessions) {
    if (now - session.lastActivity.getTime() > SESSION_TIMEOUT) {
      logger.warn({
        sessionId: session.id,
        tenantId: session.tenantId,
        lastActivity: session.lastActivity
      }, 'Session timeout - destroying zombie session');

      callManager.destroySession(session.id);
    }
  }
}, TIMEOUT_CHECK_INTERVAL);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  isShuttingDown = true;
  eventLoopMonitor.stop();

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing server');
      process.exit(1);
    }

    logger.info('Server closed, waiting for active calls to complete');

    // Flush pending traces
    logger.info('Flushing pending traces...');
    await batchLogger.flushNow();

    // Wait for active calls to complete
    const checkInterval = setInterval(() => {
      const activeCalls = callManager.getSessionCount();
      logger.info({ activeCalls }, 'Checking for active calls during shutdown');

      if (activeCalls === 0) {
        clearInterval(checkInterval);
        logger.info('All calls completed, shutting down');
        process.exit(0);
      }
    }, 5000); // Check every 5 seconds

    // Force shutdown after 2 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      logger.warn('Force shutdown after timeout');
      process.exit(0);
    }, 120000);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
server.listen(config.PORT, () => {
  logger.info({
    port: config.PORT,
    nodeEnv: config.NODE_ENV
  }, 'Server started');
});