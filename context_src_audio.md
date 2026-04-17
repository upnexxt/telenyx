# Context: context_src_audio.md

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

