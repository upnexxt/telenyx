import WebSocket from 'ws';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { SupabaseService } from './SupabaseService';
import { CallManager } from '../core/CallManager';
import { CallStatus } from '../types';
import type { TenantSettings } from '../types/schema';
import { AudioPipeline } from '../audio/AudioPipeline';
import { BatchLogger } from '../core/BatchLogger';

interface GeminiSession {
  ws: WebSocket;
  sessionId: string;
  tenantId: string;
  isSetup: boolean;
  lastActivity: number;
  audioQueue: Buffer[];
  toolCallInProgress: boolean;
  pingInterval: NodeJS.Timeout | null;
  retryCount: number;
  t0Map: Map<string, number>; // Latency tracking: chunkId -> timestamp
}

export class AIService {
  private static instance: AIService;
  private sessions: Map<string, GeminiSession> = new Map();
  private supabase = SupabaseService.getInstance();
  private callManager = CallManager.getInstance();

  // Retry configuration
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_DELAY_MS = 500;
  private readonly BACKOFF_MULTIPLIER = 1.5;

  private constructor() {
    // Singleton
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Start a Gemini session with exponential backoff retry logic
   */
  public async startSession(sessionId: string, tenantId: string): Promise<void> {
    try {
      await this.connectWithRetry(sessionId, tenantId, 0);
    } catch (error) {
      const err = error as Error;
      logger.error({ sessionId, error: err.message }, 'Failed to start Gemini session after retries');
      this.callManager.updateSessionStatus(sessionId, CallStatus.TERMINATING);
      throw error;
    }
  }

  /**
   * Connect with exponential backoff retry
   */
  private async connectWithRetry(
    sessionId: string,
    tenantId: string,
    attempt: number
  ): Promise<void> {
    if (attempt > this.MAX_RETRIES) {
      throw new Error(`Max retries (${this.MAX_RETRIES}) exceeded for Gemini connection`);
    }

    const delay = this.INITIAL_DELAY_MS * Math.pow(this.BACKOFF_MULTIPLIER, attempt);

    if (attempt > 0) {
      logger.info(
        { sessionId, tenantId, attempt, delayMs: delay },
        'Retrying Gemini connection with exponential backoff'
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      await this.openWebSocket(sessionId, tenantId, attempt);
    } catch (error) {
      const err = error as Error;
      logger.warn(
        { sessionId, tenantId, attempt, error: err.message },
        'Gemini connection attempt failed'
      );
      await this.connectWithRetry(sessionId, tenantId, attempt + 1);
    }
  }

  /**
   * Open WebSocket connection to Gemini
   */
  private async openWebSocket(sessionId: string, tenantId: string, attempt: number): Promise<void> {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${config.GEMINI_API_KEY}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000); // 10 second timeout

      ws.on('open', async () => {
        clearTimeout(timeoutHandle);
        logger.info(
          { sessionId, tenantId, attempt },
          'Gemini WebSocket connected'
        );

        const session: GeminiSession = {
          ws,
          sessionId,
          tenantId,
          isSetup: false,
          lastActivity: Date.now(),
          audioQueue: [],
          toolCallInProgress: false,
          pingInterval: null,
          retryCount: attempt,
          t0Map: new Map()
        };

        this.sessions.set(sessionId, session);

        // Setup message handlers
        ws.on('message', (data: Buffer) => {
          this.handleGeminiMessage(session, data).catch(err => {
            logger.error({ sessionId, error: err.message }, 'Error in handleGeminiMessage');
          });
        });

        ws.on('error', (error) => {
          logger.error({ sessionId, error: error.message }, 'Gemini WebSocket error');
        });

        ws.on('close', (code, reason) => {
          logger.info({ sessionId, code, reason: reason.toString() }, 'Gemini WebSocket closed');
          this.handleGeminiClose(sessionId, tenantId, code);
        });

        // Send setup message with tenant configuration
        try {
          const tenantSettings = await this.supabase.getTenantSettings(tenantId);
          await this.sendSetupMessage(session, tenantSettings);
          this.callManager.updateSessionStatus(sessionId, CallStatus.CONNECTED);
        } catch (error) {
          const err = error as Error;
          logger.error({ sessionId, error: err.message }, 'Error sending setup message');
          ws.close();
          reject(error);
          return;
        }

        // Start keep-alive ping
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);

        session.pingInterval = pingInterval;

        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Handle WebSocket close event with proper error classification
   */
  private async handleGeminiClose(sessionId: string, tenantId: string, code: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.pingInterval) {
      clearInterval(session.pingInterval);
    }
    this.sessions.delete(sessionId);

    // Classify close code and handle accordingly
    if (code === 429) {
      logger.warn({ sessionId, tenantId }, 'Rate limited (429) - attempt reconnect with backoff');
      // In production, consider secondary API key here
      await this.connectWithRetry(sessionId, tenantId, 0);
    } else if (code === 503) {
      logger.warn({ sessionId, tenantId }, 'Service unavailable (503) - send fallback message and retry');
      // Send fallback TTS message to Telnyx
      await this.sendFallbackMessage(sessionId, 'Sorry, ik heb even een kleine storing. Een momentje alstublieft.');
      // Retry after 2 seconds
      setTimeout(() => this.connectWithRetry(sessionId, tenantId, 0), 2000);
    }
  }

  /**
   * Send fallback message via local TTS (stub - would need TTS service)
   */
  private async sendFallbackMessage(sessionId: string, message: string): Promise<void> {
    logger.info({ sessionId, message }, 'Would send fallback TTS message');
    // TODO: Implement local TTS via Telnyx Synthesis API or similar
  }

  /**
   * Build system instruction from tenant settings
   */
  private buildSystemInstruction(settings: TenantSettings): string {
    const now = new Date().toLocaleString('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const businessName = settings.business_name ?? 'de salon';
    const aiName = settings.ai_name ?? 'Sophie';
    const aiLanguage = settings.ai_language ?? 'Nederlands';
    const customInstructions = settings.custom_instructions ?? '';
    const aiTone = settings.ai_tone ?? 'vriendelijk en professioneel';

    return `Je bent ${aiName}, de AI-receptioniste van ${businessName}.
Vandaag is ${now}.
Je spreekt ${aiTone} in het ${aiLanguage}.
Belangrijk: Spreek altijd kort, bondig en menselijk. Gebruik fillers zoals 'Uhm' of 'Even kijken hoor' wanneer je de agenda controleert.
${customInstructions ? `Extra instructies: ${customInstructions}` : ''}
Wanneer je een afspraak boekt, MOET je ALTIJD de book_appointment tool gebruiken.`;
  }

  /**
   * Send setup message to Gemini with dynamic tenant configuration
   */
  private async sendSetupMessage(
    session: GeminiSession,
    tenantSettings: TenantSettings
  ): Promise<void> {
    const setupMessage = {
      setup: {
        model: 'models/gemini-live-2.5-flash-native-audio',
        generationConfig: {
          responseModalities: ['audio'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: tenantSettings.ai_voice ?? 'Aoede'
              }
            }
          },
          temperature: tenantSettings.ai_temperature ?? 0.7,
          topP: 0.95,
          topK: 40
        },
        systemInstruction: {
          parts: [
            {
              text: this.buildSystemInstruction(tenantSettings)
            }
          ]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'check_availability',
                description: 'Controleert beschikbare tijdsloten voor een specifieke behandeling en medewerker.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    date: { type: 'STRING', description: 'ISO datum (YYYY-MM-DD)' },
                    service_id: { type: 'STRING', description: 'Service ID' },
                    employee_id: { type: 'STRING', description: 'Optioneel: Employee ID' }
                  },
                  required: ['date', 'service_id']
                }
              },
              {
                name: 'book_appointment',
                description: 'Maakt een definitieve boeking in de database.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    customer_phone: { type: 'STRING', description: 'Telefoonnummer klant' },
                    start_time: { type: 'STRING', description: 'ISO timestamp' },
                    service_id: { type: 'STRING', description: 'Service ID' },
                    employee_id: { type: 'STRING', description: 'Employee ID' }
                  },
                  required: ['customer_phone', 'start_time', 'service_id', 'employee_id']
                }
              }
            ]
          }
        ]
      }
    };

    session.ws.send(JSON.stringify(setupMessage));
    session.isSetup = true;

    logger.info(
      { sessionId: session.sessionId, tenantId: session.tenantId },
      'Setup message sent to Gemini'
    );

    // Log setup trace via batch logger (async, non-blocking)
    const batchLogger = BatchLogger.getInstance();
    batchLogger.log({
      call_log_id: session.sessionId,
      tenant_id: session.tenantId,
      step_type: 'AI_METADATA',
      content: { model: 'gemini-live-2.5-flash-native-audio', event: 'setup_complete' },
      created_at: new Date().toISOString()
    }).catch(err => {
      logger.error({ error: err.message }, 'Failed to log setup trace');
    });
  }

  /**
   * Send audio to Gemini with latency tracking
   */
  public sendAudio(sessionId: string, audioData: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isSetup) return;

    const chunkId = `${sessionId}_${session.lastActivity}`;
    const t0 = Date.now();
    session.t0Map.set(chunkId, t0);

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: audioData.toString('base64')
          }
        ]
      }
    };

    try {
      session.ws.send(JSON.stringify(message));
      session.lastActivity = Date.now();
    } catch (error) {
      const err = error as Error;
      logger.error({ sessionId, error: err.message }, 'Error sending audio to Gemini');
    }
  }

  /**
   * Handle messages from Gemini
   */
  private async handleGeminiMessage(session: GeminiSession, data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      session.lastActivity = Date.now();

      // Handle server content (audio output)
      if (message.serverContent) {
        // Handle interruption
        if (message.serverContent.interrupted) {
          session.audioQueue = [];
          this.callManager.updateSessionStatus(session.sessionId, CallStatus.USER_SPEAKING);

          logger.info({ sessionId: session.sessionId }, 'Gemini interrupted - audio queue cleared');

          const batchLogger = BatchLogger.getInstance();
          batchLogger.log({
            call_log_id: session.sessionId,
            tenant_id: session.tenantId,
            step_type: 'SYSTEM_ERROR',
            content: { event: 'interruption_triggered' },
            created_at: new Date().toISOString()
          }).catch(err => {
            logger.error({ error: err.message }, 'Failed to log interruption trace');
          });
          return;
        }

        // Handle safety blocks
        if (message.serverContent.safetyRatings?.some((r: any) => r.blocked)) {
          logger.warn(
            { sessionId: session.sessionId, tenantId: session.tenantId },
            'Gemini safety block triggered'
          );

          const batchLogger = BatchLogger.getInstance();
          batchLogger.log({
            call_log_id: session.sessionId,
            tenant_id: session.tenantId,
            step_type: 'SYSTEM_ERROR',
            content: { event: 'safety_block_triggered', safetyRatings: message.serverContent.safetyRatings },
            created_at: new Date().toISOString()
          }).catch(err => {
            logger.error({ error: err.message }, 'Failed to log safety block trace');
          });

          // Send neutral response
          const neutralMessage = {
            text: 'Ik begrijp je niet helemaal. Laten we teruggaan naar je afspraak.'
          };
          session.ws.send(JSON.stringify(neutralMessage));
          return;
        }

        // Handle audio output
        if (message.serverContent.modelTurn?.parts) {
          const pipeline = AudioPipeline.getInstance();
          for (const part of message.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
              // Process through DSP pipeline:
              // - Soft limiter (-3dB)
              // - Anti-aliasing FIR filter (8kHz)
              // - Polyphase downsample 24kHz → 16kHz
              // - Push to jitter buffer for paced output
              const firState = { history: new Array(6).fill(0) };
              pipeline.processOutbound(part.inlineData.data, session.sessionId, firState);

              // Calculate latency (T0/T1 tracking)
              const chunkId = `${session.sessionId}_${session.lastActivity}`;
              const t0 = session.t0Map.get(chunkId);
              const t1 = Date.now();
              const latencyMs = t0 ? t1 - t0 : -1;

              // Update session status
              this.callManager.updateSessionStatus(session.sessionId, CallStatus.AI_SPEAKING);

              // Log latency trace via batch logger (async, non-blocking)
              if (latencyMs >= 0) {
                const batchLogger = BatchLogger.getInstance();
                batchLogger.log({
                  call_log_id: session.sessionId,
                  tenant_id: session.tenantId,
                  step_type: 'AI_METADATA',
                  content: { latency_ms: latencyMs, chunkId },
                  created_at: new Date().toISOString()
                }).catch(err => {
                  logger.error({ error: err.message }, 'Failed to log latency trace');
                });

                if (latencyMs > 400) {
                  logger.warn(
                    { sessionId: session.sessionId, latencyMs },
                    'High latency detected (>400ms)'
                  );
                }
              }

              session.t0Map.delete(chunkId);
            }
          }
        }
      }

      // Handle tool calls
      if (message.toolCall) {
        await this.handleToolCall(session, message.toolCall);
      }
    } catch (error) {
      const err = error as Error;
      logger.error(
        { sessionId: session.sessionId, error: err.message },
        'Error handling Gemini message'
      );
    }
  }

  /**
   * Handle tool calls from Gemini
   */
  private async handleToolCall(session: GeminiSession, toolCall: any): Promise<void> {
    if (session.toolCallInProgress) return; // Avoid concurrent tool calls
    session.toolCallInProgress = true;

    try {
      for (const call of toolCall.functionCalls || []) {
        let result: any = {};

        logger.info(
          { sessionId: session.sessionId, toolName: call.name },
          'Processing tool call'
        );

        if (call.name === 'check_availability') {
          result = await this.handleCheckAvailability(session.tenantId, call.args);
        } else if (call.name === 'book_appointment') {
          result = await this.handleBookAppointment(session.tenantId, call.args);
        }

        // Log tool call trace via batch logger (async, non-blocking)
        const batchLogger = BatchLogger.getInstance();
        batchLogger.log({
          call_log_id: session.sessionId,
          tenant_id: session.tenantId,
          step_type: 'TOOL_CALL',
          content: { tool: call.name, args: call.args, result },
          created_at: new Date().toISOString()
        }).catch(err => {
          logger.error({ error: err.message }, 'Failed to log tool call trace');
        });

        // Send tool response back to Gemini
        const responseMessage = {
          toolResponse: {
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: result
              }
            ]
          }
        };

        session.ws.send(JSON.stringify(responseMessage));
      }
    } catch (error) {
      const err = error as Error;
      logger.error(
        { sessionId: session.sessionId, error: err.message },
        'Error handling tool call'
      );
    } finally {
      session.toolCallInProgress = false;
    }
  }

  /**
   * Handle check_availability tool call
   */
  private async handleCheckAvailability(tenantId: string, args: any): Promise<any> {
    try {
      const { date, service_id, employee_id } = args;

      const availableSlots = await this.supabase.checkAvailability(
        tenantId,
        service_id,
        date,
        employee_id
      );

      return {
        result: 'success',
        available_slots: availableSlots,
        date,
        service_id
      };
    } catch (error) {
      logger.error(
        { tenantId, error: (error as Error).message },
        'Error checking availability'
      );
      return {
        result: 'error',
        message: 'Kon beschikbaarheid niet controleren'
      };
    }
  }

  /**
   * Handle book_appointment tool call
   */
  private async handleBookAppointment(tenantId: string, args: any): Promise<any> {
    try {
      const { customer_phone, start_time, service_id, employee_id } = args;

      const result = await this.supabase.bookAppointment(tenantId, {
        customerPhone: customer_phone,
        startTime: start_time,
        serviceId: service_id,
        employeeId: employee_id
      });

      return {
        result: 'success',
        appointment_id: result.id,
        confirmation_message: `Je afspraak is geboekt op ${start_time}`,
        customer_phone
      };
    } catch (error) {
      logger.error(
        { tenantId, error: (error as Error).message },
        'Error booking appointment'
      );
      return {
        result: 'error',
        message: 'Kon afspraak niet boeken'
      };
    }
  }

  /**
   * End a Gemini session
   */
  public endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.pingInterval) {
        clearInterval(session.pingInterval);
      }
      session.ws.close();
      this.sessions.delete(sessionId);

      logger.info({ sessionId }, 'Gemini session ended');
    }
  }

  // Legacy methods for compatibility
  public async processAudio(audioData: Buffer, sessionId: string): Promise<string> {
    this.sendAudio(sessionId, audioData);
    return 'Audio sent to AI';
  }

  public async generateResponse(_text: string, _context?: any): Promise<string> {
    return 'Response generated';
  }
}
