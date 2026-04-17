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
  // alpha = exp(-2π × fc / fs) where fc=80Hz, fs=8000Hz ≈ 0.9391 (input is 8kHz from Telnyx)
  private readonly ALPHA_DC = 0.9391;

  // FIR Coefficients: 7-tap low-pass filter at 8kHz (for 24kHz input)
  // Parks-McClellan design with Hann window
  private readonly FIR_COEFFS = [
    -0.0078125, 0.046875, 0.289063, 0.4375, 0.289063, 0.046875, -0.0078125
  ];

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
   * Steps: swap16 (BE→LE), DC offset removal, echo suppression, upsample 8kHz→16kHz
   */
  public processInbound(
    base64Audio: string,
    dcState: DcFilterState,
    isAiSpeaking: boolean
  ): Buffer {
    const buffer = Buffer.from(base64Audio, 'base64');

    // Step 1: Endianness swap (Big-Endian → Little-Endian)
    // Telnyx sends L16 in network byte order (BE), Gemini expects LE
    buffer.swap16();

    // Step 2: DC offset removal (high-pass filter at 80Hz @ 8kHz input)
    this.removeDcOffset(buffer, dcState);

    // Step 3: Echo suppression
    if (isAiSpeaking) {
      this.applyEchoSuppression(buffer);
    }

    // Step 4: Upsample 8kHz → 16kHz via linear interpolation (Gemini requires 16kHz)
    const inputSamples = buffer.length / 2;
    const output = Buffer.allocUnsafe(inputSamples * 4);
    for (let i = 0; i < inputSamples; i++) {
      const s0 = buffer.readInt16LE(i * 2);
      const s1 = i + 1 < inputSamples ? buffer.readInt16LE((i + 1) * 2) : s0;
      output.writeInt16LE(s0, i * 4);
      output.writeInt16LE(Math.round((s0 + s1) / 2), i * 4 + 2);
    }

    return output;
  }

  /**
   * Outbound audio processing: Gemini → Telnyx
   * Steps: soft limiter, anti-aliasing FIR, downsample 24kHz→8kHz, swap LE→BE
   * Output goes to JitterBuffer for paced Telnyx delivery
   */
  public processOutbound(
    base64Audio: string,
    sessionId: string,
    firState: FirFilterState
  ): void {
    const rawAudio = Buffer.from(base64Audio, 'base64');

    // Step 1: Soft limiter (-3dB gain) to prevent clipping on phone lines
    const limited = this.applySoftLimiter(rawAudio);

    // Step 2: Anti-aliasing FIR filter (low-pass for 24kHz input)
    const filtered = this.applyFirFilter(limited, firState);

    // Step 3: Downsample 24kHz → 8kHz (average every 3 samples)
    const inputSamples = filtered.length / 2;
    const outputSamples = Math.floor(inputSamples / 3);
    const downsampled = Buffer.allocUnsafe(outputSamples * 2);
    let outIdx = 0;
    for (let i = 0; i < inputSamples - 2; i += 3) {
      const s0 = filtered.readInt16LE(i * 2);
      const s1 = filtered.readInt16LE((i + 1) * 2);
      const s2 = filtered.readInt16LE((i + 2) * 2);
      const avg = Math.max(-32768, Math.min(32767, Math.round((s0 + s1 + s2) / 3)));
      downsampled.writeInt16LE(avg, outIdx);
      outIdx += 2;
    }
    const output = downsampled.subarray(0, outIdx);

    // Step 4: Swap LE → BE (Telnyx L16 requires Big-Endian / network byte order)
    output.swap16();

    // Step 5: Push to jitter buffer for timed output
    const jb = this.jitterBuffers.get(sessionId);
    if (jb) {
      jb.push(output);
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
   * where alpha ≈ 0.9691 for fc=80Hz at fs=16kHz
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

  /**
   * Anti-Aliasing FIR Filter: 7-tap low-pass at 8kHz
   * Parks-McClellan design with Hann window, normalized
   * Prevents aliasing artifacts when downsampling from 24kHz to 16kHz
   *
   * Filter has zero-phase (symmetric), group delay = 3 samples ≈ 0.125ms @ 24kHz
   */
  private applyFirFilter(input: Buffer, state: FirFilterState): Buffer {
    const inputSamples = input.length / 2;
    const output = Buffer.allocUnsafe(input.length);

    for (let i = 0; i < inputSamples; i++) {
      let acc = 0;

      for (let k = 0; k < this.FIR_COEFFS.length; k++) {
        const sampleIndex = i - k + 3; // FIR_DELAY = 3

        let sample = 0;
        if (sampleIndex >= 0 && sampleIndex < inputSamples) {
          sample = input.readInt16LE(sampleIndex * 2);
        } else if (sampleIndex < 0 && state.history[6 + sampleIndex]) {
          sample = state.history[6 + sampleIndex]!;
        }

        acc += this.FIR_COEFFS[k]! * sample;
      }

      const clamped = Math.max(-32768, Math.min(32767, Math.round(acc)));
      output.writeInt16LE(clamped, i * 2);
    }

    // Update history for next chunk (last 6 samples)
    state.history = [];
    for (let k = Math.max(0, inputSamples - 6); k < inputSamples; k++) {
      state.history.push(input.readInt16LE(k * 2));
    }

    return output;
  }

}

