/**
 * Zero-Copy Buffer Pool for audio processing
 * Pre-allocates buffers to avoid GC pressure during real-time audio processing
 */

export class BufferPool {
  private pool: Buffer[] = [];
  private readonly CHUNK_SIZE: number;
  private readonly POOL_SIZE: number;

  /**
   * @param chunkSize - Size of each buffer (default: 640 bytes = 20ms at 16kHz 16-bit)
   * @param poolSize - Number of pre-allocated buffers (default: 50)
   */
  constructor(chunkSize: number = 640, poolSize: number = 50) {
    this.CHUNK_SIZE = chunkSize;
    this.POOL_SIZE = poolSize;

    // Pre-allocate all buffers at startup
    for (let i = 0; i < poolSize; i++) {
      this.pool.push(Buffer.allocUnsafe(chunkSize));
    }
  }

  /**
   * Acquire a buffer from the pool
   * If pool is empty, allocate a new one (graceful degradation)
   */
  public acquire(): Buffer {
    return this.pool.pop() ?? Buffer.allocUnsafe(this.CHUNK_SIZE);
  }

  /**
   * Release a buffer back to the pool
   * Only returns to pool if we haven't exceeded pool size
   */
  public release(buf: Buffer): void {
    if (this.pool.length < this.POOL_SIZE && buf.length === this.CHUNK_SIZE) {
      this.pool.push(buf);
    }
  }

  /**
   * Get current pool depth
   */
  public getDepth(): number {
    return this.pool.length;
  }
}
