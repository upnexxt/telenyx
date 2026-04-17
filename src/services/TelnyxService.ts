import telnyx from 'telnyx';
import { config } from '../core/config';
import { logger } from '../core/logger';

export class TelnyxService {
  private static instance: TelnyxService;
  private client: any;

  private constructor() {
    this.client = new (telnyx as any)(config.TELNYX_API_KEY);
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
      logger.info({ callControlId }, 'Answering Telnyx call');
      await this.client.calls.answer(callControlId);
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error({ callControlId, error: err.message }, 'Failed to answer Telnyx call');
      return false;
    }
  }

  /**
   * Starts a bidirectional media stream for a call
   */
  public async startStream(callControlId: string, websocketUrl: string): Promise<boolean> {
    try {
      logger.info({ callControlId, websocketUrl }, 'Starting bidirectional media stream');
      await this.client.calls.streamStart(callControlId, {
        stream_url: websocketUrl,
        stream_track: 'both_tracks'
      });
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error({ callControlId, error: err.message }, 'Failed to start media stream');
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
