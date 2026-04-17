import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Helper functions for consistent logging
export const logCallEvent = (
  level: 'info' | 'warn' | 'error',
  message: string,
  data: {
    tenantId?: string;
    callId?: string;
    sessionId?: string;
    correlationId?: string;
    [key: string]: any;
  }
) => {
  logger[level]({ ...data }, message);
};

export const logApiRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  correlationId?: string
) => {
  logger.info({
    method,
    url,
    statusCode,
    duration,
    correlationId,
  }, 'API Request');
};