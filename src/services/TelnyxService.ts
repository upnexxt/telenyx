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
      // Use .actions namespace for Telnyx v6 SDK
      await this.client.calls.actions.answer(callControlId);
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
      // ✅ FIX: Changed from streamingStart to startStreaming, added L16 codec
      await this.client.calls.actions.startStreaming(callControlId, {
        stream_url: websocketUrl,
        stream_track: 'both_tracks',
        stream_codec: 'PCMA',
        stream_bidirectional_mode: 'rtp',
        stream_bidirectional_codec: 'PCMA'
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
      // Use .actions namespace for Telnyx v6 SDK
      await this.client.calls.actions.hangup(callControlId);
      return true;
    } catch (error) {
      const err = error as any;
      const message = err.message || 'Unknown error';
      const detail = err.raw?.message || err.detail || '';
      logger.error(`Failed to hangup Telnyx call: ${message} ${detail}`);
      return false;
    }
  }
}
