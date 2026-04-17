import { GoogleGenAI } from '@google/genai';
import { WaveFile } from 'wavefile';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { SupabaseService } from './SupabaseService';
import { CallManager } from '../core/CallManager';
import { CallStatus } from '../types';
import type { TenantSettings } from '../types/schema';

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
      wav.fromScratch(1, 24000, '16', buffer);
      wav.toSampleRate(16000);
      const samples = (wav as any).data.samples;
      return Buffer.from(samples).toString('base64');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error downsampling audio');
      return base64Pcm24k;
    }
  }

  /**
   * Start a Gemini Live session using the new @google/genai SDK (v1.50+ requires callbacks)
   */
  public async startSession(sessionId: string, tenantId: string): Promise<void> {
    try {
      const tenantSettings = await this.supabase.getTenantSettings(tenantId);
      const systemInstruction = this.buildSystemInstruction(tenantSettings);

      logger.info({ sessionId, tenantId }, 'Connecting to Gemini Multimodal Live API');

      // Initialize session object early for reference in callbacks
      let session: GeminiSession | null = null;

      // Connect to Gemini Live API with required callbacks
      const liveSession = await this.genAI.live.connect({
        model: 'models/gemini-live-2.5-flash-native-audio',
        config: {
          generationConfig: {
            responseModalities: ['audio'] as any,
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
          tools: this.getToolDeclarations() as any
        },
        callbacks: {
          onMessage: async (data: any) => {
            if (session) session.lastActivity = Date.now();

            // Handle Audio Content
            if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const geminiAudio24k = data.serverContent.modelTurn.parts[0].inlineData.data;
              const telnyxAudio16k = this.downsampleGemini(geminiAudio24k);
              this.callManager.sendAudioToTelnyx(sessionId, telnyxAudio16k);
              this.callManager.updateSessionStatus(sessionId, CallStatus.AI_SPEAKING);
            }

            // Handle Interruption
            if (data.serverContent?.interrupted) {
              this.callManager.updateSessionStatus(sessionId, CallStatus.USER_SPEAKING);
            }

            // Handle Tool Calls
            if (data.toolCall) {
              if (session) await this.handleToolCall(session, data.toolCall);
            }
          },
          onError: (error: Error) => {
            logger.error({ sessionId, error: error.message }, 'Gemini Live Session Error');
          },
          onClose: () => {
            logger.info({ sessionId }, 'Gemini Live Session Closed');
            this.sessions.delete(sessionId);
          }
        }
      } as any); // Cast as any to ensure all required SDK fields are bypassed during build

      session = {
        liveSession,
        sessionId,
        tenantId,
        isSetup: true,
        lastActivity: Date.now()
      };

      this.sessions.set(sessionId, session);
      this.callManager.updateSessionStatus(sessionId, CallStatus.CONNECTED);

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

        if (call.name === 'check_availability') {
          result = await this.handleCheckAvailability(session.tenantId, call.args);
        } else if (call.name === 'book_appointment') {
          result = await this.handleBookAppointment(session.tenantId, call.args);
        }

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
    return this.supabase.checkAvailability(tenantId, args.service_id, args.date, args.employee_id)
      .then(slots => ({ result: 'success', available_slots: slots }));
  }

  private async handleBookAppointment(tenantId: string, args: any): Promise<any> {
    return this.supabase.bookAppointment(tenantId, {
      customerPhone: args.customer_phone,
      startTime: args.start_time,
      serviceId: args.service_id,
      employeeId: args.employee_id
    }).then(res => ({ result: 'success', appointment_id: res.id }));
  }

  private getToolDeclarations(): any[] {
    return [{
      functionDeclarations: [
        {
          name: 'check_availability',
          description: 'Controleert beschikbare tijdsloten.',
          parameters: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING' },
              service_id: { type: 'STRING' },
              employee_id: { type: 'STRING' }
            },
            required: ['date', 'service_id']
          }
        },
        {
          name: 'book_appointment',
          description: 'Maakt een definitieve boeking.',
          parameters: {
            type: 'OBJECT',
            properties: {
              customer_phone: { type: 'STRING' },
              start_time: { type: 'STRING' },
              service_id: { type: 'STRING' },
              employee_id: { type: 'STRING' }
            },
            required: ['customer_phone', 'start_time', 'service_id']
          }
        }
      ]
    }];
  }

  private buildSystemInstruction(settings: TenantSettings): string {
    return `Je bent ${settings.ai_name ?? 'Sophie'}. Spreek kort en bondig in het Nederlands.`;
  }

  public endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.liveSession.close();
      this.sessions.delete(sessionId);
    }
  }
}
