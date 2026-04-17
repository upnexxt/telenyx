export interface CallSession {
  id: string;
  tenantId: string;
  callControlId: string;
  correlationId: string;
  status: CallStatus;
  createdAt: Date;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export enum CallStatus {
  INITIALIZING = 'initializing',
  CONNECTED = 'connected',
  AI_SPEAKING = 'ai_speaking',
  USER_SPEAKING = 'user_speaking',
  TOOL_CALLING = 'tool_calling',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated'
}

export interface CallEventData {
  sessionId: string;
  tenantId: string;
  timestamp: Date;
  data?: any;
}