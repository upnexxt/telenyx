import WebSocket from 'ws';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { SupabaseService } from './SupabaseService';

interface GeminiSession {
  ws: WebSocket;
  sessionId: string;
  tenantId: string;
  isSetup: boolean;
  lastActivity: number;
  audioQueue: Buffer[];
  toolCallInProgress: boolean;
}

export class AIService {
  private static instance: AIService;
  private sessions: Map<string, GeminiSession> = new Map();
  private supabase = SupabaseService.getInstance();

  private constructor() {
    // Singleton
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public async startSession(sessionId: string, tenantId: string): Promise<void> {
    try {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${config.GEMINI_API_KEY}`;

      const ws = new WebSocket(wsUrl, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const session: GeminiSession = {
        ws,
        sessionId,
        tenantId,
        isSetup: false,
        lastActivity: Date.now(),
        audioQueue: [],
        toolCallInProgress: false
      };

      this.sessions.set(sessionId, session);

      // Set up WebSocket event handlers
      ws.on('open', () => {
        logger.info({ sessionId }, 'Gemini WebSocket connected');
        this.sendSetupMessage(session);
      });

      ws.on('message', (data: Buffer) => {
        this.handleGeminiMessage(session, data);
      });

      ws.on('error', (error) => {
        logger.error({ sessionId, error: error.message }, 'Gemini WebSocket error');
      });

      ws.on('close', () => {
        logger.info({ sessionId }, 'Gemini WebSocket closed');
        this.sessions.delete(sessionId);
      });

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

    } catch (error) {
      const err = error as Error;
      logger.error({ sessionId, error: err.message }, 'Error starting Gemini session');
      throw error;
    }
  }

  private async sendSetupMessage(session: GeminiSession): Promise<void> {
    // Get tenant settings for system instruction
    const tenantData = await this.supabase.findTenantByPhoneNumber(''); // We need to get tenant settings
    // For now, use placeholder - in real implementation, get from session metadata

    const setupMessage = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede"
              }
            }
          },
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        },
        systemInstruction: {
          parts: [
            {
              text: `Je bent Sophie, de AI-receptioniste van een kapsalon. Vandaag is ${new Date().toLocaleDateString('nl-NL')}. Belangrijk: Je spreekt kort, bondig en menselijk in het Nederlands. Gebruik fillers zoals 'Uhm' of 'Even kijken hoor' tijdens het checken van de agenda. Als je een afspraak boekt, gebruik je ALTIJD de tools.`
            }
          ]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "check_availability",
                description: "Controleert beschikbare tijdsloten voor een specifieke behandeling en medewerker.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    date: { type: "STRING", description: "ISO datum (YYYY-MM-DD)" },
                    service_id: { type: "STRING" },
                    employee_id: { type: "STRING", description: "Optioneel" }
                  },
                  required: ["date", "service_id"]
                }
              },
              {
                name: "book_appointment",
                description: "Maakt een definitieve boeking in de database.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    customer_phone: { type: "STRING" },
                    start_time: { type: "STRING", description: "ISO timestamp" },
                    service_id: { type: "STRING" },
                    employee_id: { type: "STRING" }
                  },
                  required: ["customer_phone", "start_time", "service_id", "employee_id"]
                }
              }
            ]
          }
        ]
      }
    };

    session.ws.send(JSON.stringify(setupMessage));
    session.isSetup = true;
    logger.info({ sessionId: session.sessionId }, 'Sent setup message to Gemini');
  }

  public sendAudio(sessionId: string, audioData: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isSetup) return;

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: audioData.toString('base64')
          }
        ]
      }
    };

    session.ws.send(JSON.stringify(message));
    session.lastActivity = Date.now();
  }

  private async handleGeminiMessage(session: GeminiSession, data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      session.lastActivity = Date.now();

      if (message.serverContent) {
        // Handle audio output
        if (message.serverContent.modelTurn?.parts) {
          for (const part of message.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
              const audioData = Buffer.from(part.inlineData.data, 'base64');
              // TODO: Resample from 24kHz to 16kHz if needed
              // Send to Telnyx via CallManager
              const { CallManager } = await import('../core/CallManager');
              const callManager = CallManager.getInstance();
              callManager.sendAudioToTelnyx(session.sessionId, audioData.toString('base64'));
            }
          }
        }
      } else if (message.toolCall) {
        // Handle tool calls
        await this.handleToolCall(session, message.toolCall);
      } else if (message.interrupted) {
        // Handle interruption - clear audio queue
        logger.info({ sessionId: session.sessionId }, 'Gemini interrupted - clearing audio queue');
        // TODO: Clear Telnyx audio queue
      }
    } catch (error) {
      const err = error as Error;
      logger.error({ sessionId: session.sessionId, error: err.message }, 'Error handling Gemini message');
    }
  }

  private async handleToolCall(session: GeminiSession, toolCall: any): Promise<void> {
    if (session.toolCallInProgress) return; // Avoid concurrent tool calls
    session.toolCallInProgress = true;

    try {
      for (const call of toolCall.functionCalls || []) {
        let result: any = {};

        if (call.name === 'check_availability') {
          result = await this.checkAvailability(session.tenantId, call.args);
        } else if (call.name === 'book_appointment') {
          result = await this.bookAppointment(session.tenantId, call.args);
        }

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
      logger.error({ sessionId: session.sessionId, error: err.message }, 'Error handling tool call');
    } finally {
      session.toolCallInProgress = false;
    }
  }

  private async checkAvailability(tenantId: string, args: any): Promise<any> {
    try {
      const { date, service_id, employee_id } = args;

      const availableSlots = await this.supabase.checkAvailability(tenantId, date, service_id, employee_id);

      return {
        result: "success",
        available_slots: availableSlots,
        date: date,
        service_id: service_id
      };
    } catch (error) {
      logger.error({ tenantId, error: (error as Error).message }, 'Error checking availability');
      return { result: "error", message: "Could not check availability" };
    }
  }

  private async bookAppointment(tenantId: string, args: any): Promise<any> {
    try {
      const { customer_phone, start_time, service_id, employee_id } = args;

      const result = await this.supabase.bookAppointment(tenantId, customer_phone, start_time, service_id, employee_id);

      return {
        result: "success",
        appointment_id: result.appointment_id,
        confirmation_message: result.message,
        customer_phone: customer_phone
      };
    } catch (error) {
      logger.error({ tenantId, error: (error as Error).message }, 'Error booking appointment');
      return { result: "error", message: "Could not book appointment" };
    }
  }

  public endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ws.close();
      this.sessions.delete(sessionId);
    }
  }

  // Legacy method for compatibility
  public async processAudio(audioData: Buffer, sessionId: string): Promise<string> {
    // Forward to Gemini session
    this.sendAudio(sessionId, audioData);
    return 'Audio sent to AI'; // This is now async
  }

  public async generateResponse(text: string, _context?: any): Promise<string> {
    // For non-realtime responses, use regular Gemini API
    // TODO: Implement if needed
    return 'Response generated';
  }
}