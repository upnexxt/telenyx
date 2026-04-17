import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logApiRequest } from '../core/logger';

// Extend Express Request to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const correlationId = req.headers['x-correlation-id'] as string || randomUUID();
  req.correlationId = correlationId;

  // Add correlationId to response headers
  res.setHeader('x-correlation-id', correlationId);

  // Log the request start
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    logApiRequest(req.method, req.url, res.statusCode, duration, correlationId);
  });

  next();
};