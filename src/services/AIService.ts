import { GoogleGenAI } from '@google/genai';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { SupabaseService } from './SupabaseService';
import { CallManager } from '../core/CallManager';
import { AudioPipeline } from '../audio/AudioPipeline';
import { CallStatus } from '../types';
import type { TenantSettings } from '../types/schema';

interface GeminiSession {
  liveSession: any;
  sessionId: string;
  tenantId: string;
  isSetup: boolean;
  lastActivity: number;
  isAiSpeaking: boolean;
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
   * Transcodes 8kHz A-Law (Telnyx/PCMA) to 16kHz PCM (Gemini)
   */
  private transcodeTelnyxToGemini(base64Payload: string): string {
    try {
      const aLawData = Buffer.from(base64Payload, 'base64');

      // Decode A-Law to 16-bit PCM
      const pcm16k = Buffer.allocUnsafe(aLawData.length * 4); // 8kHz to 16kHz = 2x samples, 8-bit to 16-bit = 2x bytes
      let outIdx = 0;

      for (let i = 0; i < aLawData.length; i++) {
        const aLawByte = aLawData.readUInt8(i);
        const pcmSample = this.aLawDecode(aLawByte);

        // Write original sample at output rate
        pcm16k.writeInt16LE(pcmSample, outIdx);
        outIdx += 2;

        // Write interpolated sample for 2x upsampling
        pcm16k.writeInt16LE(pcmSample, outIdx);
        outIdx += 2;
      }

      return pcm16k.toString('base64');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error transcoding Telnyx -> Gemini');
      return base64Payload;
    }
  }

  /**
   * A-Law decode: 8-bit compressed to 16-bit PCM (ITU-T G.711)
   */
  private aLawDecode(byte: number): number {
    // Apply bit inversion first (XOR 0x55)
    byte ^= 0x55;

    // Extract sign (bit 7) and components
    const sign = (byte & 0x80) ? -1 : 1;
    const exponent = (byte >> 4) & 0x07; // 3 bits
    const mantissa = byte & 0x0f; // 4 bits

    // Reconstruct PCM value according to ITU-T G.711 standard
    let pcm: number;
    if (exponent === 0) {
      // Linear segment
      pcm = (mantissa << 4) + 8;
    } else {
      // Compressed segments - add implicit leading 1 bit to mantissa
      pcm = ((mantissa | 0x10) << (exponent + 3)) - 128;
    }

    return sign * pcm;
  }

  /**
   * Transcodes 24kHz PCM (Gemini) to 8kHz A-Law (Telnyx/PCMA)
   */
  private transcodeGeminiToTelnyx(base64Payload: string): string {
    try {
      const pcm24k = Buffer.from(base64Payload, 'base64');
      const samplesCount = pcm24k.length / 2; // 16-bit = 2 bytes per sample

      // Downsample 24kHz to 8kHz (keep every 3rd sample) and encode to A-Law
      const aLawData = Buffer.allocUnsafe(Math.floor(samplesCount / 3));
      let outIdx = 0;

      for (let i = 0; i < samplesCount - 2; i += 3) {
        const pcmSample = pcm24k.readInt16LE(i * 2);
        const aLawByte = this.pcmToALaw(pcmSample);
        aLawData.writeUInt8(aLawByte, outIdx);
        outIdx++;
      }

      return aLawData.subarray(0, outIdx).toString('base64');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error transcoding Gemini -> Telnyx');
      return base64Payload;
    }
  }

  /**
   * PCM to A-Law encode: 16-bit PCM to 8-bit compressed (ITU-T G.711)
   */
  private pcmToALaw(sample: number): number {
    const QUANT_MASK = 0xf;
    const SEG_SHIFT = 4;
    const sign = (sample >> 8) & 0x80;

    if (sign !== 0) sample = -sample;
    if (sample > 32635) sample = 32635;

    let exponent = 7;
    let mantissa = 0;

    for (let i = 0; i < 8; i++) {
      if (sample <= (0xff << i)) {
        exponent = 7 - i;
        break;
      }
    }

    mantissa = (sample >> (exponent + 3)) & QUANT_MASK;
    return ((sign | (exponent << SEG_SHIFT) | mantissa) ^ 0x55) & 0xff;
  }

  /**
   * Start a Gemini Live session using the new @google/genai SDK
   */
  public async startSession(sessionId: string, tenantId: string): Promise<void> {
    // Deduplication check: Don't start if session already exists
    if (this.sessions.has(sessionId)) {
      logger.debug({ sessionId }, 'Gemini session already exists, skipping initialization');
      return;
    }

    try {
      const tenantSettings = await this.supabase.getTenantSettings(tenantId);
      const systemInstruction = this.buildSystemInstruction(tenantSettings);

      logger.info({ sessionId, tenantId }, 'Connecting to Gemini Multimodal Live API');

      let session: GeminiSession | null = null;

      // Connect to Gemini Live API
      const liveSession = await this.genAI.live.connect({
        model: 'models/gemini-live-2.5-flash-native-audio',
        config: {
          responseModalities: ['audio'] as any,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: tenantSettings.ai_voice ?? 'Aoede'
              }
            }
          },
          temperature: tenantSettings.ai_temperature ?? 0.7,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          tools: this.getToolDeclarations() as any
        },
        callbacks: {
          onMessage: async (data: any) => {
            if (session) session.lastActivity = Date.now();

            // Handle Audio Content (Gemini -> Phone)
            if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const geminiAudio24k = data.serverContent.modelTurn.parts[0].inlineData.data;

              // Transcode 24kHz PCM -> 8kHz PCMA
              const inputSize = Buffer.byteLength(geminiAudio24k, 'base64');
              const telnyxAudioAuto = this.transcodeGeminiToTelnyx(geminiAudio24k);
              const outputSize = Buffer.byteLength(telnyxAudioAuto, 'base64');

              logger.debug({ sessionId, inputSize, outputSize, ratio: (outputSize / inputSize).toFixed(2) },
                'Audio transcoded Gemini->Telnyx');

              // Route through jitter buffer for paced delivery
              const pipeline = AudioPipeline.getInstance();
              const jitterBuffer = (pipeline as any).jitterBuffers?.get(sessionId);
              if (jitterBuffer) {
                // Decode base64 and push to jitter buffer
                const audioBuffer = Buffer.from(telnyxAudioAuto, 'base64');
                jitterBuffer.push(audioBuffer);
              } else {
                // Fallback: send directly if jitter buffer not available
                this.callManager.sendAudioToTelnyx(sessionId, telnyxAudioAuto);
              }

              if (session) {
                session.isAiSpeaking = true;
              }
              this.callManager.updateSessionStatus(sessionId, CallStatus.AI_SPEAKING);
            }

            // Handle Interruption
            if (data.serverContent?.interrupted) {
              if (session) {
                session.isAiSpeaking = false;
              }
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
      } as any);

      session = {
        liveSession,
        sessionId,
        tenantId,
        isSetup: true,
        isAiSpeaking: false,
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
  public sendAudio(sessionId: string, base64Audio: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isSetup) return;

    try {
      // Transcode 8kHz PCMA -> 16kHz PCM
      const inputSize = Buffer.byteLength(base64Audio, 'base64');
      const geminiAudio = this.transcodeTelnyxToGemini(base64Audio);
      const outputSize = Buffer.byteLength(geminiAudio, 'base64');

      logger.debug({ sessionId, inputSize, outputSize, ratio: (outputSize / inputSize).toFixed(2) },
        'Audio transcoded Telnyx->Gemini');

      session.liveSession.sendRealtimeInput({
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: geminiAudio
        }
      });
      session.lastActivity = Date.now();
    } catch (error) {
      if (Date.now() - session.lastActivity > 1000) {
        logger.error({ sessionId, error: (error as Error).message }, 'Error sending audio to Gemini');
      }
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
