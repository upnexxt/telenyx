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
  // alpha = exp(-2π × fc / fs) where fc=80Hz, fs=8000Hz ≈ 0.9391 (Telnyx PCMA sends 8kHz)
  private readonly ALPHA_DC = 0.9391;

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
   * Telnyx PCMA sends 8kHz A-Law — decode, DC filter, upsample to 16kHz LE for Gemini
   */
  public processInbound(
    base64Audio: string,
    dcState: DcFilterState,
    isAiSpeaking: boolean
  ): Buffer {
    const aLawBuffer = Buffer.from(base64Audio, 'base64');
    const inputSamples = aLawBuffer.length;
    const output = Buffer.allocUnsafe(inputSamples * 4); // 8kHz 8-bit → 16kHz 16-bit = 4x

    for (let i = 0; i < inputSamples; i++) {
      // Step 1: A-Law decode 8-bit → 16-bit PCM
      let pcm = this.aLawDecode(aLawBuffer[i]!);

      // Step 2: DC offset removal @ 8kHz
      const yn = this.ALPHA_DC * (dcState.prevOut + pcm - dcState.prevIn);
      dcState.prevIn = pcm;
      dcState.prevOut = yn;
      pcm = Math.max(-32768, Math.min(32767, Math.round(yn)));

      // Step 3: Echo suppression (-6dB when AI is speaking)
      if (isAiSpeaking) pcm = Math.round(pcm * this.ECHO_SUPPRESS_GAIN);

      // Step 4: Upsample 8kHz → 16kHz (duplicate samples — Gemini requires 16kHz LE)
      output.writeInt16LE(pcm, i * 4);
      output.writeInt16LE(pcm, i * 4 + 2);
    }

    return output;
  }

  private aLawDecode(byte: number): number {
    byte ^= 0x55;
    const sign = (byte & 0x80) ? -1 : 1;
    const exponent = (byte >> 4) & 0x07;
    const mantissa = byte & 0x0f;
    const pcm = exponent === 0
      ? (mantissa << 4) + 8
      : ((mantissa | 0x10) << (exponent + 3)) - 128;
    return sign * pcm;
  }

  private pcmToALaw(sample: number): number {
    const sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > 32635) sample = 32635;
    let exponent = 7;
    for (let i = 0; i < 8; i++) {
      if (sample <= (0xff << i)) { exponent = 7 - i; break; }
    }
    const mantissa = (sample >> (exponent + 3)) & 0xf;
    return ((sign | (exponent << 4) | mantissa) ^ 0x55) & 0xff;
  }

  /**
   * Outbound audio processing: Gemini → Telnyx
   * Steps: soft limiter, downsample 24kHz→8kHz (take every 3rd sample), encode to A-Law
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

    // Step 2: Downsample 24kHz → 8kHz + encode to A-Law (1 byte per sample)
    const inputSamples = limited.length / 2;
    const outputSamples = Math.floor(inputSamples / 3);
    const output = Buffer.allocUnsafe(outputSamples);

    for (let i = 0; i < outputSamples; i++) {
      const s0 = limited.readInt16LE(i * 6);
      const s1 = limited.readInt16LE(i * 6 + 2);
      const s2 = limited.readInt16LE(i * 6 + 4);
      const avg = Math.round((s0 + s1 + s2) / 3);
      output[i] = this.pcmToALaw(avg);
    }

    // Step 3: Push to jitter buffer for timed output
    const jb = this.jitterBuffers.get(sessionId);
    if (jb) jb.push(output);
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


