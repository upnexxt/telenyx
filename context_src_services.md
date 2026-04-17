# Context: context_src_services.md

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

