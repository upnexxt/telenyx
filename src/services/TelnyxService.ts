import telnyx from 'telnyx';
import { config } from '../core/config';
import { logger } from '../core/logger';

export class TelnyxService {
  private static instance: TelnyxService;
  private client: any;

  private constructor() {
    const apiKey = config.TELNYX_API_KEY;
    if (!apiKey) {
      logger.error('CRITICAL: TELNYX_API_KEY is missing from environment variables!');
    }
    this.client = new (telnyx as any)(apiKey);
  }

  public static getInstance(): TelnyxService {
    if (!TelnyxService.instance) {
      TelnyxService.instance = new TelnyxService();
    }
    return TelnyxService.instance;
  }

  /**
   * Answers an incoming call using its Call Control ID
   */
  public async answerCall(callControlId: string): Promise<boolean> {
    try {
      logger.info(`Answering Telnyx call (ID: ${callControlId})`);
      await this.client.calls.answer(callControlId);
      return true;
    } catch (error) {
      const err = error as any;
      const message = err.message || 'Unknown error';
      const detail = err.raw?.message || err.detail || '';
      logger.error(`Failed to answer Telnyx call: ${message} ${detail}`);
      return false;
    }
  }

  /**
   * Starts a bidirectional media stream for a call
   */
  public async startStream(callControlId: string, websocketUrl: string): Promise<boolean> {
    try {
      logger.info(`Starting bidirectional media stream (ID: ${callControlId}, URL: ${websocketUrl})`);
      await this.client.calls.streamStart(callControlId, {
        stream_url: websocketUrl,
        stream_track: 'both_tracks'
      });
      return true;
    } catch (error) {
      const err = error as any;
      const message = err.message || 'Unknown error';
      const detail = err.raw?.message || err.detail || '';
      logger.error(`Failed to start media stream: ${message} ${detail}`);
      return false;
    }
  }

  /**
   * Hangs up a call
   */
  public async hangupCall(callControlId: string): Promise<boolean> {
    try {
      logger.info({ callControlId }, 'Hanging up Telnyx call');
      await this.client.calls.hangup(callControlId);
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error({ callControlId, error: err.message }, 'Failed to hangup Telnyx call');
      return false;
    }
  }
}
