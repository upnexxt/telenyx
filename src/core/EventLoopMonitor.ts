/**
 * Event Loop Lag Monitor
 * Tracks Node.js event loop health - critical for real-time audio applications
 * Audio processing can't tolerate >50ms event loop delays
 */

import { monitorEventLoopDelay } from 'perf_hooks';
import { logger } from './logger';

export class EventLoopMonitor {
  private static instance: EventLoopMonitor;
  private histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private monitorHandle: NodeJS.Timeout | null = null;

  private readonly CHECK_INTERVAL_MS = 60000; // Check every 60 seconds
  private readonly WARN_THRESHOLD_MS = 50; // Warn if lag > 50ms
  private readonly CRITICAL_THRESHOLD_MS = 100; // Critical if lag > 100ms

  private constructor() {
    this.start();
  }

  public static getInstance(): EventLoopMonitor {
    if (!EventLoopMonitor.instance) {
      EventLoopMonitor.instance = new EventLoopMonitor();
    }
    return EventLoopMonitor.instance;
  }

  /**
   * Start monitoring event loop delay
   */
  private start(): void {
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 10 });
      this.histogram.enable();

      // Periodic check
      this.monitorHandle = setInterval(() => this.check(), this.CHECK_INTERVAL_MS);

      logger.info('Event loop monitor started');
    } catch (error) {
      logger.warn('Event loop monitoring not available (Node.js version may not support it)');
    }
  }

  /**
   * Internal: Check event loop health
   */
  private check(): void {
    if (!this.histogram) return;

    const meanMs = this.histogram.mean / 1e6; // nanoseconds → milliseconds
    const maxMs = this.histogram.max / 1e6;
    const p99Ms = this.histogram.percentile(99) / 1e6;

    const context = {
      eventLoopLag: {
        mean_ms: meanMs.toFixed(2),
        p99_ms: p99Ms.toFixed(2),
        max_ms: maxMs.toFixed(2)
      }
    };

    if (maxMs > this.CRITICAL_THRESHOLD_MS) {
      logger.error(context, 'CRITICAL: Event loop lag exceeds 100ms - system may be overloaded');
    } else if (p99Ms > this.WARN_THRESHOLD_MS) {
      logger.warn(context, 'Event loop lag detected - may impact audio quality');
    } else {
      logger.debug(context, 'Event loop healthy');
    }

    // Reset histogram for next interval
    this.histogram.reset();
  }

  /**
   * Get current event loop statistics
   */
  public getStats(): { mean: number; p99: number; max: number } | null {
    if (!this.histogram) return null;

    return {
      mean: this.histogram.mean / 1e6,
      p99: this.histogram.percentile(99) / 1e6,
      max: this.histogram.max / 1e6
    };
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (this.histogram) {
      this.histogram.disable();
      this.histogram = null;
    }
    if (this.monitorHandle) {
      clearInterval(this.monitorHandle);
      this.monitorHandle = null;
    }
  }
}
