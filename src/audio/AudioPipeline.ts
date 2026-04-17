/**
 * Enterprise-grade DSP Audio Pipeline
 * Handles real-time audio transformation between Telnyx and Gemini
 * Target latency: <10ms processing per chunk, <50ms with jitter buffer
 */

import { JitterBuffer } from './JitterBuffer';

export interface DcFilterState {
  prevIn: number;
  prevOut: number;
}

export interface FirFilterState {
  history: number[];
}

export interface AudioDspState {
  dcIn: DcFilterState; // Inbound high-pass filter state
  firOut: FirFilterState; // Outbound anti-aliasing FIR state
}

export class AudioPipeline {
  private static instance: AudioPipeline;
  private jitterBuffers: Map<string, JitterBuffer> = new Map();

  // DC Offset Filter: first-order high-pass at 80Hz
  // alpha = exp(-2π × fc / fs) where fc=80Hz, fs=16000Hz ≈ 0.9691 (Telnyx L16 sends 16kHz)
  private readonly ALPHA_DC = 0.9691;

  // Soft limiter gain: -3dB = 10^(-3/20) ≈ 0.7079
  private readonly SOFT_LIMIT_GAIN = 0.7079;

  // Echo suppression: -6dB ducking when AI is speaking
  private readonly ECHO_SUPPRESS_GAIN = 0.5;

  private constructor() {
    // Singleton constructor
  }

  public static getInstance(): AudioPipeline {
    if (!AudioPipeline.instance) {
      AudioPipeline.instance = new AudioPipeline();
    }
    return AudioPipeline.instance;
  }

  /**
   * Inbound audio processing: Telnyx → Gemini
   * Telnyx L16 bidirectional sends 16kHz BE — swap to LE, filter, pass directly to Gemini (no upsampling needed)
   */
  public processInbound(
    base64Audio: string,
    dcState: DcFilterState,
    isAiSpeaking: boolean
  ): Buffer {
    const buffer = Buffer.from(base64Audio, 'base64');

    // Step 1: Endianness swap (Big-Endian → Little-Endian)
    buffer.swap16();

    // Step 2: DC offset removal (high-pass filter at 80Hz @ 16kHz)
    this.removeDcOffset(buffer, dcState);

    // Step 3: Echo suppression (-6dB when AI is speaking)
    if (isAiSpeaking) {
      this.applyEchoSuppression(buffer);
    }

    return buffer; // Already 16kHz LE — exactly what Gemini expects
  }

  /**
   * Outbound audio processing: Gemini → Telnyx
   * Steps: soft limiter, downsample 24kHz→16kHz (3:2), swap LE→BE for Telnyx L16
   * Output goes to JitterBuffer for paced Telnyx delivery
   */
  public processOutbound(
    base64Audio: string,
    sessionId: string,
    _firState: FirFilterState
  ): void {
    const rawAudio = Buffer.from(base64Audio, 'base64');

    // Step 1: Soft limiter (-3dB gain) to prevent clipping
    const limited = this.applySoftLimiter(rawAudio);

    // Step 2: Downsample 24kHz → 16kHz (3:2 ratio — keep s0, interpolate s1+s2)
    const inputSamples = limited.length / 2;
    const outputSamples = Math.floor(inputSamples * 2 / 3);
    const output = Buffer.allocUnsafe(outputSamples * 2);

    let outIdx = 0;
    for (let i = 0; i < inputSamples - 2; i += 3) {
      const s0 = limited.readInt16LE(i * 2);
      const s1 = limited.readInt16LE((i + 1) * 2);
      const s2 = limited.readInt16LE((i + 2) * 2);
      // Write as BE (Telnyx L16 requires network byte order)
      output.writeInt16BE(s0, outIdx);
      output.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round((s1 + s2) / 2))), outIdx + 2);
      outIdx += 4;
    }

    // Step 3: Push to jitter buffer for timed output
    const jb = this.jitterBuffers.get(sessionId);
    if (jb) {
      jb.push(output.subarray(0, outIdx));
    }
  }

  /**
   * Create a jitter buffer for a session
   * Called when session starts
   */
  public createJitterBuffer(sessionId: string, onDrain: (chunk: Buffer) => void): void {
    const jb = new JitterBuffer(onDrain);
    jb.start();
    this.jitterBuffers.set(sessionId, jb);
  }

  /**
   * Destroy a jitter buffer
   * Called when session ends
   */
  public destroyJitterBuffer(sessionId: string): void {
    const jb = this.jitterBuffers.get(sessionId);
    if (jb) {
      jb.stop();
      this.jitterBuffers.delete(sessionId);
    }
  }

  /**
   * Get jitter buffer depth in milliseconds
   */
  public getJitterBufferDepth(sessionId: string): number {
    return this.jitterBuffers.get(sessionId)?.getDepthMs() ?? 0;
  }

  /**
   * Calculate RMS (Root Mean Square) for volume measurement
   * Returns dBFS: 20 × log10(RMS / 32768)
   */
  public calculateRmsDbfs(buffer: Buffer): number {
    const samples = buffer.length / 2;
    if (samples === 0) return -Infinity;

    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const s = buffer.readInt16LE(i * 2);
      sum += s * s;
    }

    const rms = Math.sqrt(sum / samples);
    const dbfs = 20 * Math.log10(rms / 32768);
    return Math.max(dbfs, -120); // Floor at -120dBFS
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private DSP Utility Functions
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * DC Offset Removal: First-order IIR high-pass filter
   * Removes low-frequency rumble and DC bias from audio signal
   *
   * y[n] = alpha × (y[n-1] + x[n] - x[n-1])
   * where alpha ≈ 0.9691 for fc=80Hz at fs=16kHz (Telnyx L16 input rate)
   */
  private removeDcOffset(buffer: Buffer, state: DcFilterState): void {
    const samples = buffer.length / 2;
    for (let i = 0; i < samples; i++) {
      const xn = buffer.readInt16LE(i * 2);
      const yn = this.ALPHA_DC * (state.prevOut + xn - state.prevIn);

      state.prevIn = xn;
      state.prevOut = yn;

      const clamped = Math.max(-32768, Math.min(32767, Math.round(yn)));
      buffer.writeInt16LE(clamped, i * 2);
    }
  }

  /**
   * Echo Suppression: Simple attenuation (-6dB)
   * When AI is speaking, reduce microphone input to prevent feedback loops
   */
  private applyEchoSuppression(buffer: Buffer): void {
    for (let i = 0; i < buffer.length; i += 2) {
      const s = buffer.readInt16LE(i);
      const suppressed = Math.round(s * this.ECHO_SUPPRESS_GAIN);
      buffer.writeInt16LE(suppressed, i);
    }
  }

  /**
   * Soft Limiter: Apply -3dB gain
   * Prevents audio clipping on phone lines
   */
  private applySoftLimiter(buffer: Buffer): Buffer {
    const output = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i += 2) {
      const s = buffer.readInt16LE(i);
      const limited = Math.round(s * this.SOFT_LIMIT_GAIN);
      const clamped = Math.max(-32768, Math.min(32767, limited));
      output.writeInt16LE(clamped, i);
    }
    return output;
  }

}


