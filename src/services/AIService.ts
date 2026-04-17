import telnyx from 'telnyx';
import { GoogleGenAI } from '@google/genai';
import { WaveFile } from 'wavefile';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { SupabaseService } from './SupabaseService';
import { CallManager } from '../core/CallManager';
import { CallStatus } from '../types';
import type { TenantSettings } from '../types/schema';
import { BatchLogger } from '../core/BatchLogger';

interface GeminiSession {
  liveSession: any;
  sessionId: string;
  tenantId: string;
  isSetup: boolean;
  lastActivity: number;
}

export class AIService {
  private static instance: AIService;
  private sessions: Map<string, GeminiSession> = new Map();
  private supabase = SupabaseService.getInstance();
  private callManager = CallManager.getInstance();
  private genAI: GoogleGenAI;

  private constructor() {
    this.genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Downsamples 24kHz PCM audio from Gemini to 16kHz for Telnyx L16
   */
  private downsampleGemini(base64Pcm24k: string): string {
    try {
      const buffer = Buffer.from(base64Pcm24k, 'base64');
      const wav = new WaveFile();
      // Setup as 24kHz Mono 16-bit PCM
      wav.fromScratch(1, 24000, '16', buffer);
      // Downsample to 16kHz
      wav.toSampleRate(16000);
      // Return new base64 payload
      return Buffer.from(wav.data.samples as Buffer).toString('base64');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error downsampling audio');
      return base64Pcm24k; // Fallback
    }
  }

  /**
   * Start a Gemini Live session using the new @google/genai SDK
   */
  public async startSession(sessionId: string, tenantId: string): Promise<void> {
    try {
      const tenantSettings = await this.supabase.getTenantSettings(tenantId);
      const systemInstruction = this.buildSystemInstruction(tenantSettings);

      logger.info({ sessionId, tenantId }, 'Connecting to Gemini Multimodal Live API');

      // Connect to Gemini Live API
      const liveSession = await this.genAI.live.connect({
        model: 'models/gemini-live-2.5-flash-native-audio',
        config: {
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
          },
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          tools: this.getToolDeclarations()
        }
      });

      const session: GeminiSession = {
        liveSession,
        sessionId,
        tenantId,
        isSetup: true,
        lastActivity: Date.now()
      };

      this.sessions.set(sessionId, session);
      this.callManager.updateSessionStatus(sessionId, CallStatus.CONNECTED);

      // Handle messages FROM Gemini -> TO Telnyx
      liveSession.on('message', (data: any) => {
        session.lastActivity = Date.now();

        // Handle Audio Content
        if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
          const geminiAudio24k = data.serverContent.modelTurn.parts[0].inlineData.data;
          
          // Downsample 24kHz to 16kHz
          const telnyxAudio16k = this.downsampleGemini(geminiAudio24k);
          
          // Send to Telnyx via CallManager
          this.callManager.sendAudioToTelnyx(sessionId, telnyxAudio16k);
          this.callManager.updateSessionStatus(sessionId, CallStatus.AI_SPEAKING);
        }

        // Handle Interruption
        if (data.serverContent?.interrupted) {
          logger.info({ sessionId }, 'AI Interrupted by user');
          this.callManager.updateSessionStatus(sessionId, CallStatus.USER_SPEAKING);
        }

        // Handle Tool Calls
        if (data.toolCall) {
          this.handleToolCall(session, data.toolCall).catch(err => {
            logger.error({ sessionId, error: err.message }, 'Error in tool call handler');
          });
        }
      });

      liveSession.on('error', (error: Error) => {
        logger.error({ sessionId, error: error.message }, 'Gemini Live SDK error');
      });

      liveSession.on('close', () => {
        logger.info({ sessionId }, 'Gemini Live session closed');
        this.sessions.delete(sessionId);
      });

      logger.info({ sessionId }, 'Gemini Live session established');

    } catch (error) {
      const err = error as Error;
      logger.error({ sessionId, error: err.message }, 'Failed to start Gemini Live session');
      this.callManager.updateSessionStatus(sessionId, CallStatus.TERMINATING);
      throw error;
    }
  }

  /**
   * Send audio FROM Telnyx -> TO Gemini
   */
  public sendAudio(sessionId: string, audioData: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isSetup) return;

    try {
      session.liveSession.send({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: audioData.toString('base64')
          }]
        }
      });
      session.lastActivity = Date.now();
    } catch (error) {
      logger.error({ sessionId, error: (error as Error).message }, 'Error sending audio to Gemini');
    }
  }

  /**
   * Handle tool calls from Gemini
   */
  private async handleToolCall(session: GeminiSession, toolCall: any): Promise<void> {
    try {
      for (const call of toolCall.functionCalls || []) {
        let result: any = {};

        logger.info({ sessionId: session.sessionId, toolName: call.name }, 'Processing tool call');

        if (call.name === 'check_availability') {
          result = await this.handleCheckAvailability(session.tenantId, call.args);
        } else if (call.name === 'book_appointment') {
          result = await this.handleBookAppointment(session.tenantId, call.args);
        }

        // Send tool response back via SDK
        session.liveSession.send({
          toolResponse: {
            functionResponses: [{
              id: call.id,
              name: call.name,
              response: result
            }]
          }
        });
      }
    } catch (error) {
      logger.error({ sessionId: session.sessionId, error: (error as Error).message }, 'Tool call handler failed');
    }
  }

  private async handleCheckAvailability(tenantId: string, args: any): Promise<any> {
    const { date, service_id, employee_id } = args;
    const availableSlots = await this.supabase.checkAvailability(tenantId, service_id, date, employee_id);
    return { result: 'success', available_slots: availableSlots, date, service_id };
  }

  private async handleBookAppointment(tenantId: string, args: any): Promise<any> {
    const { customer_phone, start_time, service_id, employee_id } = args;
    const result = await this.supabase.bookAppointment(tenantId, {
      customerPhone: customer_phone,
      startTime: start_time,
      serviceId: service_id,
      employeeId: employee_id
    });
    return { result: 'success', appointment_id: result.id, confirmation_message: `Je afspraak is geboekt op ${start_time}` };
  }

  private getToolDeclarations(): any[] {
    return [{
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
    }];
  }

  private buildSystemInstruction(settings: TenantSettings): string {
    const now = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
    return `Je bent ${settings.ai_name ?? 'Sophie'}, de AI-receptioniste van ${settings.business_name ?? 'de salon'}. Vandaag is ${now}. Je spreekt ${settings.ai_tone ?? 'vriendelijk'} in het ${settings.ai_language ?? 'Nederlands'}. Spreek altijd kort en bondig. ${settings.custom_instructions ?? ''}`;
  }

  public endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.liveSession.close();
      this.sessions.delete(sessionId);
    }
  }
}
