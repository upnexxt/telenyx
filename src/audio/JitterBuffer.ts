/**
 * Adaptive Jitter Buffer with 20ms output clock
 * Decouples irregular Gemini output from strict Telnyx timing requirements
 * Generates comfort noise (CNG) during silence periods
 */

export class JitterBuffer {
  private queue: Buffer[] = [];
  private remainder: Buffer = Buffer.alloc(0);
  private clockHandle: NodeJS.Timeout | null = null;
  private onDrain: (chunk: Buffer) => void;

  // Constants
  private readonly DRAIN_INTERVAL_MS = 20; // 20ms clock tick
  private readonly SAMPLES_PER_TICK = 320; // 320 samples @ 16kHz
  private readonly BYTES_PER_TICK = 640; // 320 × 2 bytes (16-bit PCM)
  private readonly CNG_AMPLITUDE = 33; // 10^(-60/20) × 32767 ≈ 33

  constructor(onDrain: (chunk: Buffer) => void) {
    this.onDrain = onDrain;
  }

  /**
   * Push audio chunk into the jitter buffer
   * Chunks are split into 20ms segments and queued for drain
   */
  public push(chunk: Buffer): void {
    // Combine remainder from previous push + new chunk
    const combined = Buffer.concat([this.remainder, chunk]);
    let offset = 0;

    // Split into 20ms chunks (640 bytes each)
    while (offset + this.BYTES_PER_TICK <= combined.length) {
      const segment = Buffer.alloc(this.BYTES_PER_TICK);
      combined.copy(segment, 0, offset, offset + this.BYTES_PER_TICK);
      this.queue.push(segment);
      offset += this.BYTES_PER_TICK;
    }

    // Store remainder for next push
    this.remainder = combined.length > offset ? combined.subarray(offset) : Buffer.alloc(0);
  }

  /**
   * Start the 20ms clock that drains audio to Telnyx
   */
  public start(): void {
    this.clockHandle = setInterval(() => this.tick(), this.DRAIN_INTERVAL_MS);
  }

  /**
   * Stop the clock and clear the buffer
   */
  public stop(): void {
    if (this.clockHandle) {
      clearInterval(this.clockHandle);
      this.clockHandle = null;
    }
    this.queue = [];
    this.remainder = Buffer.alloc(0);
  }

  /**
   * Get current buffer depth in milliseconds
   */
  public getDepthMs(): number {
    return this.queue.length * this.DRAIN_INTERVAL_MS;
  }

  /**
   * Internal: 20ms tick handler
   * Either drain queued audio or generate comfort noise
   */
  private tick(): void {
    const chunk = this.queue.shift();
    if (chunk) {
      this.onDrain(chunk);
    } else {
      // Generate comfort noise (silence would be unnatural)
      this.onDrain(this.generateCng());
    }
  }

  /**
   * Generate comfort noise at -60dBFS
   * Prevents the perception of "dead air" during silence
   */
  private generateCng(): Buffer {
    const buf = Buffer.allocUnsafe(this.BYTES_PER_TICK);
    for (let i = 0; i < this.BYTES_PER_TICK; i += 2) {
      // White noise: random int16
      const noise = Math.round((Math.random() * 2 - 1) * this.CNG_AMPLITUDE);
      buf.writeInt16LE(noise, i);
    }
    return buf;
  }
}
