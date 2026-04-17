#!/usr/bin/env node

/**
 * Test Call Simulator
 * Simulates an incoming Telnyx call to test the AI receptionist
 *
 * Usage: node test-call.js [tenantId] [phoneNumber]
 * Example: node test-call.js tenant-test-001 +1234567890
 */

const http = require('http');
const crypto = require('crypto');

// Configuration
const HOST = 'localhost';
const PORT = 3000;
const TENANT_ID = process.argv[2] || 'tenant-test-001';
const FROM_NUMBER = process.argv[3] || '+1234567890';
const TO_NUMBER = '+1-555-TEST-AI';

// Simulated webhook payload (as if from Telnyx)
const payload = {
  event_type: 'call.initiated',
  payload: {
    call_control_id: `test-call-${Date.now()}`,
    from: FROM_NUMBER,
    to: TO_NUMBER,
    direction: 'inbound',
    state: 'initiated',
    timestamp: new Date().toISOString()
  }
};

const payloadStr = JSON.stringify(payload);

// Note: Real Telnyx calls include valid Ed25519 signatures
// For testing, we'll use a placeholder that the webhook will reject
// but still log the attempt
const options = {
  hostname: HOST,
  port: PORT,
  path: '/api/v1/telnyx/inbound',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadStr),
    'telnyx-signature-ed25519': 'PLACEHOLDER_SIGNATURE_FOR_TESTING',
    'telnyx-timestamp': Math.floor(Date.now() / 1000).toString(),
    'User-Agent': 'Telenyx-Test-Client/1.0'
  }
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TELENYX AI RECEPTIONIST - TEST CALL SIMULATOR');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('📞 Simulating incoming call...\n');
console.log(`From:     ${FROM_NUMBER}`);
console.log(`To:       ${TO_NUMBER}`);
console.log(`Tenant:   ${TENANT_ID}`);
console.log(`Server:   http://${HOST}:${PORT}`);
console.log(`Call ID:  ${payload.payload.call_control_id}\n`);

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log(`Response Body: ${data}\n`);

    if (res.statusCode === 200 || res.statusCode === 401) {
      console.log('✅ Webhook received by server!\n');
      console.log('Expected behavior:');
      console.log('  - If signature was valid: Call session would be created');
      console.log('  - Server logs should show: "Call session created"');
      console.log('  - Supabase call_logs table should have new entry\n');

      console.log('To see the logs:');
      console.log('  1. Check your npm run dev terminal');
      console.log('  2. Look for "sessionId" in the logs');
      console.log('  3. Query Supabase: SELECT * FROM call_logs ORDER BY created_at DESC LIMIT 1;\n');
    } else {
      console.log('⚠️  Server returned unexpected status code\n');
    }

    if (res.statusCode !== 200) {
      console.log('Note: This is expected! Signature verification failed (placeholder).');
      console.log('Real calls from Telnyx include valid Ed25519 signatures.\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (error) => {
  console.error('\n❌ Connection failed!\n');
  console.error(`Error: ${error.message}\n`);
  console.error('Make sure the server is running:');
  console.error('  npm run dev\n');
  process.exit(1);
});

// Send the request
req.write(payloadStr);
req.end();

// Timeout after 5 seconds
setTimeout(() => {
  console.error('\n⏱️  Timeout - server did not respond');
  process.exit(1);
}, 5000);
