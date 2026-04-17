/**
 * Distributed Tracing: Correlation Engine
 * Generates UUIDv7 for time-sorted trace IDs and manages trace context propagation
 */

import { randomBytes } from 'crypto';

export interface TraceContext {
  correlationId: string; // UUIDv7
  tenantId: string;
  startTime: bigint; // process.hrtime.bigint() for nanosecond precision
  spanId?: string; // Optional: for nested spans
}

export class Tracer {
  /**
   * Generate a UUIDv7 (time-sortable UUID)
   * Layout: 48-bit timestamp (ms) + 4-bit version + 12-bit random + 2-bit variant + 62-bit random
   *
   * UUIDv7 format (RFC draft):
   * - Bytes 0-5: 48-bit Unix timestamp in milliseconds
   * - Bytes 6-7: 4-bit version (0111) + 12-bit random
   * - Bytes 8-9: 2-bit variant (10) + 14-bit random
   * - Bytes 10-15: 48-bit random
   */
  public static generateUUIDv7(): string {
    const now = Date.now();
    const rand = randomBytes(10);

    const buf = Buffer.allocUnsafe(16);

    // 48-bit timestamp (milliseconds)
    const msHi = Math.floor(now / 0x10000); // Upper 32 bits of 48-bit ts
    const msLo = now & 0xffff; // Lower 16 bits
    buf.writeUInt32BE(msHi, 0);
    buf.writeUInt16BE(msLo, 4);

    // Version 7 (0111 = 0x7) + 12 random bits
    const versionBits = 0x7000 | (rand[0]! << 4) | ((rand[1]! >> 4) & 0x0f);
    buf.writeUInt16BE(versionBits, 6);

    // Variant 10 (10 in top 2 bits) + 14 random bits
    const variantBits = 0x8000 | ((rand[1]! & 0x0f) << 10) | (rand[2]! << 2) | ((rand[3]! >> 6) & 0x03);
    buf.writeUInt16BE(variantBits, 8);

    // 48 random bits
    buf.writeUInt16BE((rand[3]! << 8) | rand[4]!, 10);
    buf.writeUInt32BE((rand[5]! << 24) | (rand[6]! << 16) | (rand[7]! << 8) | rand[8]!, 12);

    // Format as UUID string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /**
   * Create a new trace context for a call session
   */
  public static createTraceContext(tenantId: string): TraceContext {
    return {
      correlationId: this.generateUUIDv7(),
      tenantId,
      startTime: process.hrtime.bigint()
    };
  }

  /**
   * Calculate elapsed time in milliseconds from a trace context
   */
  public static getElapsedMs(startTime: bigint): number {
    const elapsed = process.hrtime.bigint() - startTime;
    return Number(elapsed / BigInt(1_000_000)); // ns → ms
  }

  /**
   * Calculate elapsed time in microseconds (for high-precision measurements)
   */
  public static getElapsedUs(startTime: bigint): number {
    const elapsed = process.hrtime.bigint() - startTime;
    return Number(elapsed / BigInt(1_000)); // ns → us
  }

  /**
   * Generate a span ID (shorter UUID, 8 random bytes)
   * Used for nested operations within a trace
   */
  public static generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }
}
