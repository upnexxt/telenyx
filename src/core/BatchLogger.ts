/**
 * Asynchronous Batch Logger for Call Traces
 * Batches database writes to reduce I/O overhead during real-time audio processing
 *
 * Strategy: Queue up to 20 trace events, flush every 5 seconds OR when batch is full
 */

import { SupabaseService } from '../services/SupabaseService';
import { logger } from './logger';

interface TraceEntry {
  call_log_id: string;
  tenant_id: string;
  step_type: string;
  content?: any;
  created_at?: string;
}

export class BatchLogger {
  private static instance: BatchLogger;
  private queue: TraceEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private supabase = SupabaseService.getInstance();

  private readonly BATCH_SIZE = 20; // Flush when queue reaches 20
  private readonly FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds

  private constructor() {
    // Start the periodic flush timer
    this.startPeriodicFlush();
  }

  public static getInstance(): BatchLogger {
    if (!BatchLogger.instance) {
      BatchLogger.instance = new BatchLogger();
    }
    return BatchLogger.instance;
  }

  /**
   * Log a trace entry asynchronously
   * Queues immediately, flushes when batch is full or timer fires
   */
  public async log(entry: TraceEntry): Promise<void> {
    this.queue.push({
      ...entry,
      created_at: entry.created_at || new Date().toISOString()
    });

    // Flush if batch is full
    if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  /**
   * Force an immediate flush (for critical moments like session end)
   */
  public async flushNow(): Promise<void> {
    await this.flush();
  }

  /**
   * Start the periodic flush timer
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(async () => {
      if (this.queue.length > 0) {
        await this.flush();
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Internal: Flush all queued entries to Supabase in one batch
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const items = [...this.queue];
    this.queue = []; // Clear queue immediately

    try {
      // Bulk insert via Supabase (single RPC/HTTP call)
      // Ensure all required fields are present with defaults
      const itemsForInsert = items.map(item => ({
        call_log_id: item.call_log_id,
        tenant_id: item.tenant_id,
        step_type: item.step_type as any,
        content: item.content || {},
        created_at: item.created_at || new Date().toISOString()
      }));

      const { error } = await this.supabase.getClient()
        .from('call_traces')
        .insert(itemsForInsert as any);

      if (error) {
        logger.error(
          { error: error.message, itemCount: items.length },
          'Error flushing batch logger'
        );
        // Optionally: re-queue failed items (implement exponential backoff)
      } else {
        logger.debug(
          { itemCount: items.length },
          'Batch logger flushed successfully'
        );
      }
    } catch (error) {
      const err = error as Error;
      logger.error(
        { error: err.message, itemCount: items.length },
        'Exception in batch logger flush'
      );
    }
  }

  /**
   * Shutdown: flush remaining items and stop timer
   */
  public async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Get current queue depth
   */
  public getQueueDepth(): number {
    return this.queue.length;
  }
}
