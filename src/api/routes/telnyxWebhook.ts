import express from 'express';
import { config } from '../../core/config';
import { logger, logCallEvent } from '../../core/logger';
import { SupabaseService } from '../../services/SupabaseService';
import { CallManager } from '../../core/CallManager';
import { randomUUID } from 'crypto';
import nacl from 'tweetnacl';

const router = express.Router();

// Function to verify Telnyx webhook signature
function verifyTelnyxSignature(payload: string, signature: string, timestamp: string): boolean {
  try {
    const telnyxPublicKey = (process.env as any)['TELNYX_PUBLIC_KEY'] || config.TELNYX_PUBLIC_KEY;
    
    if (!telnyxPublicKey || telnyxPublicKey.length < 10) {
      logger.warn('No valid TELNYX_PUBLIC_KEY configured, skipping signature verification');
      return true;
    }
    
    const publicKey = Buffer.from(telnyxPublicKey, 'base64');
    
    if (publicKey.length !== 32) {
      logger.warn({ keyLength: publicKey.length }, 'TELNYX_PUBLIC_KEY is not 32 bytes - may be invalid format');
      return false;
    }
    
    const message = `${timestamp}|${payload}`;
    const signatureBytes = Buffer.from(signature, 'base64');

    return nacl.sign.detached.verify(
      Buffer.from(message, 'utf8'),
      signatureBytes,
      publicKey
    );
  } catch (error) {
    logger.error({ error }, 'Error verifying Telnyx signature');
    return false;
  }
}

// Check if signature verification should be skipped
function shouldSkipSignatureVerification(): boolean {
  // Allow skipping via environment variable
  if (process.env['SKIP_SIGNATURE_VERIFICATION'] === 'true') {
    return true;
  }
  
  const pubKey = (process.env as any)['TELNYX_PUBLIC_KEY'] || config.TELNYX_PUBLIC_KEY || '';
  
  // Skip if no public key configured at all
  if (!pubKey || pubKey.length < 10) {
    return true;
  }
  
  // Auto-skip in development mode for placeholder keys
  if (config.NODE_ENV === 'development') {
    const placeholderPatterns = [
      /^test/i,
      /^placeholder/i,
      /^dev-/i,
      /^mock/i
    ];
    return placeholderPatterns.some(pattern => pattern.test(pubKey));
  }
  
  return false;
}

// POST /api/v1/telnyx/inbound
router.post('/inbound', async (req, res) => {
  try {
    const { correlationId } = req;
    const supabase = SupabaseService.getInstance();
    const callManager = CallManager.getInstance();

    // Log incoming webhook
    logger.info({
      correlationId,
      body: req.body,
      headers: req.headers
    }, 'Telnyx inbound webhook received');

    // Validate Telnyx signature
    const signature = req.headers['telnyx-signature-ed25519'] as string;
    const timestamp = req.headers['telnyx-timestamp'] as string;
    const payload = JSON.stringify(req.body);

    if (!signature || !timestamp) {
      logger.warn({ correlationId }, 'Missing Telnyx signature or timestamp headers');
      res.status(401).send('Unauthorized');
      return;
    }

    // Skip signature verification in development mode or when explicitly disabled
    if (!shouldSkipSignatureVerification()) {
      if (!verifyTelnyxSignature(payload, signature, timestamp)) {
        logger.warn({ correlationId }, 'Invalid Telnyx signature');
        res.status(401).send('Unauthorized');
        return;
      }
    } else {
      logger.info({ correlationId, signature }, 'Dev mode: signature verification skipped');
    }

    // Check timestamp for replay attacks (allow 5 minutes tolerance)
    const now = Math.floor(Date.now() / 1000);
    const sigTimestamp = parseInt(timestamp, 10);
    const tolerance = 300; // 5 minutes

    if (Math.abs(now - sigTimestamp) > tolerance) {
      logger.warn({ correlationId, timestamp: sigTimestamp, now }, 'Invalid or replayed timestamp');
      res.status(401).send('Unauthorized');
      return;
    }

    // Parse webhook body
    const event = req.body;
    // Telnyx webhook structure: { data: { event_type, payload, ... }, meta: {...}, headers: {...} }
    const eventData = event?.data;
    if (!eventData || eventData.event_type !== 'call.initiated') {
      logger.warn({ correlationId, eventType: eventData?.event_type }, 'Ignoring non-call.initiated event');
      res.status(200).send('OK');
      return;
    }

    const callControlId = eventData.payload.call_control_id;
    const toNumber = eventData.payload.to;
    const fromNumber = eventData.payload.from;

    logCallEvent('info', 'Processing inbound call', {
      correlationId,
      callControlId,
      toNumber,
      fromNumber
    });

    // Find tenant by phone number
    const tenantData = await supabase.findTenantByPhoneNumber(toNumber);
    if (!tenantData) {
      logger.warn({ correlationId, toNumber }, 'No tenant found for phone number');
      res.set('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, this number is not available.</Say>
  <Hangup/>
</Response>`);
      return;
    }

    const { tenantId, tenantSettings } = tenantData;

    // Create call session
    const sessionId = randomUUID();
    callManager.createSession(callControlId, tenantId, sessionId, {
      toNumber,
      fromNumber,
      aiGreeting: tenantSettings.ai_greeting
    });

    logCallEvent('info', 'Call session created', {
      correlationId,
      sessionId,
      tenantId,
      callControlId
    });

    // Generate TeXML response - always use wss for secure WebSocket (required for tunnels)
    const protocol = req.headers['x-forwarded-proto'] === 'https' || 
                     req.headers.host?.includes('.trycloudflare.com') ||
                     req.headers.host?.includes('.ngrok') ? 'wss' : 'ws';
    const websocketUrl = `${protocol}://${req.headers.host}/media?sessionId=${sessionId}&tenantId=${tenantId}`;

    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Answer/>
  <Connect>
    <Stream bidirectionalCodec="L16" samplingRate="16000" url="${websocketUrl}"/>
  </Connect>
</Response>`);

  } catch (error) {
    const err = error as Error;
    logger.error({
      correlationId: req.correlationId,
      error: err.message,
      stack: err.stack
    }, 'Error processing Telnyx webhook');

    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as telnyxWebhookRouter };