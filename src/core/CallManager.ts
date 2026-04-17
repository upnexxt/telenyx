import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { CallSession, CallStatus, CallEventData } from '../types';

export class CallManager extends EventEmitter {
  private static instance: CallManager;
  private sessions: Map<string, CallSession> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow more listeners for high concurrency
  }

  public static getInstance(): CallManager {
    if (!CallManager.instance) {
      CallManager.instance = new CallManager();
    }
    return CallManager.instance;
  }

  public createSession(
    callControlId: string,
    tenantId: string,
    correlationId: string,
    metadata: Record<string, any> = {}
  ): CallSession {
    const session: CallSession = {
      id: correlationId, // Use correlationId as session ID
      tenantId,
      callControlId,
      correlationId,
      status: CallStatus.INITIALIZING,
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata,
      // Initialize DSP state for audio processing
      dspState: {
        dcIn: { prevIn: 0, prevOut: 0 },
        firOut: { history: new Array(6).fill(0) }
      }
    };

    this.sessions.set(session.id, session);

    this.emit('sessionCreated', {
      sessionId: session.id,
      tenantId,
      timestamp: new Date(),
      data: session
    } as CallEventData);

    return session;
  }

  public getSession(sessionId: string): CallSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  public updateSessionStatus(sessionId: string, status: CallStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = status;
    session.lastActivity = new Date();

    this.emit('statusChanged', {
      sessionId,
      tenantId: session.tenantId,
      timestamp: new Date(),
      data: { oldStatus: session.status, newStatus: status }
    } as CallEventData);

    return true;
  }

  public destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Cleanup logic here - close connections, clear buffers, etc.
    this.emit('sessionDestroyed', {
      sessionId,
      tenantId: session.tenantId,
      timestamp: new Date(),
      data: session
    } as CallEventData);

    this.sessions.delete(sessionId);
    return true;
  }

  public getActiveSessions(): CallSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status !== CallStatus.TERMINATED
    );
  }

  public getSessionCount(): number {
    return this.sessions.size;
  }

  public sendAudioToTelnyx(sessionId: string, audioPayload: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.metadata['websocket']) {
      return false;
    }

    const ws = session.metadata['websocket'] as WebSocket;
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = {
      event: 'media',
      media: {
        payload: audioPayload
      }
    };

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error({ sessionId, error: err.message }, 'Error sending audio to Telnyx');
      return false;
    }
  }
}