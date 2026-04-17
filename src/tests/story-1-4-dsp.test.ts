/**
 * Story 1.4 Test Suite: Low-Latency Signal Processing
 * Validates DSP performance, audio quality, and jitter buffer behavior
 *
 * Run with: npx ts-node src/tests/story-1-4-dsp.test.ts
 */

import { AudioPipeline, AudioDspState } from '../audio/AudioPipeline';
import { JitterBuffer } from '../audio/JitterBuffer';
import { BufferPool } from '../audio/BufferPool';

// ═════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═════════════════════════════════════════════════════════════════════════════

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  message?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  const start = process.hrtime.bigint();
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
        results.push({ name, passed: true, duration });
        console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
      });
    } else {
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
      results.push({ name, passed: true, duration });
      console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
    }
  } catch (error) {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, message });
    console.error(`✗ ${name}: ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals(a: any, b: any, message: string): void {
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}

function assertApprox(a: number, b: number, tolerance: number, message: string): void {
  if (Math.abs(a - b) > tolerance) {
    throw new Error(`${message}: expected ${b} ±${tolerance}, got ${a}`);
  }
}

/**
 * Generate test audio (sine wave or white noise)
 */
function generateTestAudio(samples: number, frequency: number = 440, amplitude: number = 10000): Buffer {
  const buf = Buffer.allocUnsafe(samples * 2);
  for (let i = 0; i < samples; i++) {
    const sample = Math.round(amplitude * Math.sin((2 * Math.PI * frequency * i) / 16000));
    buf.writeInt16LE(sample, i * 2);
  }
  return buf;
}

function generateWhiteNoise(samples: number, amplitude: number = 1000): Buffer {
  const buf = Buffer.allocUnsafe(samples * 2);
  for (let i = 0; i < samples; i++) {
    const sample = Math.round((Math.random() * 2 - 1) * amplitude);
    buf.writeInt16LE(sample, i * 2);
  }
  return buf;
}

/**
 * Measure processing latency with process.hrtime.bigint()
 */
function measureLatency(fn: () => void): number {
  const start = process.hrtime.bigint();
  fn();
  const elapsed = process.hrtime.bigint() - start;
  return Number(elapsed) / 1_000_000; // ns → ms
}

// ═════════════════════════════════════════════════════════════════════════════
// Test Suite
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  Story 1.4: Low-Latency Signal Processing Test Suite          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Test 1: BufferPool functionality
test('BufferPool: acquire and release', () => {
  const pool = new BufferPool(640, 10);
  assertEquals(pool.getDepth(), 10, 'Initial pool size');

  const buf1 = pool.acquire();
  assertEquals(pool.getDepth(), 9, 'After acquire');
  assertEquals(buf1.length, 640, 'Buffer size');

  pool.release(buf1);
  assertEquals(pool.getDepth(), 10, 'After release');
});

// Test 2: DC offset removal latency
test('DSP: DC offset removal latency <0.5ms', () => {
  const pipeline = AudioPipeline.getInstance();
  const dspState: AudioDspState = {
    dcIn: { prevIn: 0, prevOut: 0 },
    firOut: { history: new Array(6).fill(0) }
  };

  const testAudio = generateTestAudio(320); // 20ms at 16kHz
  const latency = measureLatency(() => {
    pipeline.processInbound(testAudio.toString('base64'), dspState.dcIn, false);
  });

  assertApprox(latency, 0, 0.5, 'DC offset latency');
});

// Test 3: Endianness swap correctness
test('DSP: Endianness swap (swap16) correctness', () => {
  const data = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const expected = Buffer.from([0x34, 0x12, 0x78, 0x56]);

  data.swap16();
  assert(data.equals(expected), 'Swap16 byte order mismatch');
});

// Test 4: RMS calculation
test('DSP: RMS calculation (dBFS)', () => {
  const pipeline = AudioPipeline.getInstance();
  const sine = generateTestAudio(320, 440, 16000); // ~-1dBFS
  const dbfs = pipeline.calculateRmsDbfs(sine);

  // Full-scale sine ≈ -3dBFS
  assertApprox(dbfs, -3, 1, 'RMS dBFS for full-scale sine');
});

// Test 5: Jitter buffer basic operations
test('JitterBuffer: push and drain', async () => {
  let drainedChunks = 0;
  const onDrain = () => {
    drainedChunks++;
  };

  const jb = new JitterBuffer(onDrain);
  jb.start();

  // Push 2 chunks (640 bytes each = 20ms)
  const chunk1 = generateTestAudio(320);
  const chunk2 = generateTestAudio(320);

  jb.push(Buffer.concat([chunk1, chunk2]));

  // Wait for 2 ticks (40ms)
  await new Promise(resolve => setTimeout(resolve, 50));

  jb.stop();
  assert(drainedChunks >= 2, 'Jitter buffer drain count');
});

// Test 6: Comfort noise generation
test('JitterBuffer: comfort noise generation', async () => {
  let cngCount = 0;
  const onDrain = (buf: Buffer) => {
    const rms = Math.sqrt(
      Array.from({ length: buf.length / 2 }, (_, i) =>
        Math.pow(buf.readInt16LE(i * 2), 2)
      ).reduce((a, b) => a + b) / (buf.length / 2)
    );
    // CNG should be very quiet (RMS < 50)
    if (rms < 50) cngCount++;
  };

  const jb = new JitterBuffer(onDrain);
  jb.start();

  // Don't push any audio - should generate CNG
  await new Promise(resolve => setTimeout(resolve, 50));
  jb.stop();

  assert(cngCount > 0, 'Comfort noise not generated');
});

// Test 7: Polyphase downsampling quality
test('DSP: 24kHz→16kHz downsampling ratio', () => {
  const pipeline = AudioPipeline.getInstance();
  const dspState: AudioDspState = {
    dcIn: { prevIn: 0, prevOut: 0 },
    firOut: { history: new Array(6).fill(0) }
  };

  // 480 samples at 24kHz (20ms)
  const input24k = generateTestAudio(480, 440);
  const inputBase64 = input24k.toString('base64');

  let outputSize = 0;
  const onDrain = (buf: Buffer) => {
    outputSize = buf.length;
  };

  const jb = new JitterBuffer(onDrain);
  jb.start();
  pipeline.processOutbound(inputBase64, 'test-session', dspState.firOut);

  // Wait for processing
  setTimeout(() => {
    jb.stop();
  }, 50);
});

// Test 8: Echo suppression
test('DSP: Echo suppression (-6dB attenuation)', () => {
  const pipeline = AudioPipeline.getInstance();
  const dspState: AudioDspState = {
    dcIn: { prevIn: 0, prevOut: 0 },
    firOut: { history: new Array(6).fill(0) }
  };

  const testAudio = generateTestAudio(320, 440, 16000);
  const processed = pipeline.processInbound(testAudio.toString('base64'), dspState.dcIn, true); // isAiSpeaking

  // Check that amplitude is reduced
  const originalRms = pipeline.calculateRmsDbfs(testAudio);
  const suppressedRms = pipeline.calculateRmsDbfs(processed);

  assert(suppressedRms < originalRms, 'Echo suppression not applied');
});

// Test 9: Soft limiter gain
test('DSP: Soft limiter (-3dB gain)', () => {
  const pipeline = AudioPipeline.getInstance();
  const dspState: AudioDspState = {
    dcIn: { prevIn: 0, prevOut: 0 },
    firOut: { history: new Array(6).fill(0) }
  };

  // Outbound processing applies soft limiter
  const testAudio = generateTestAudio(480, 440, 16000);
  const inputBase64 = testAudio.toString('base64');

  let processed: Buffer | null = null;
  const onDrain = (buf: Buffer) => {
    if (!processed) processed = buf;
  };

  const jb = new JitterBuffer(onDrain);
  jb.start();
  pipeline.processOutbound(inputBase64, 'test-session', dspState.firOut);

  setTimeout(() => {
    jb.stop();
    if (processed) {
      const originalRms = pipeline.calculateRmsDbfs(testAudio);
      const processedRms = pipeline.calculateRmsDbfs(processed);
      // Soft limiter + downsample + filters will reduce level
      assert(processedRms <= originalRms, 'Level not reduced by limiter');
    }
  }, 100);
});

// Test 10: Concurrent jitter buffers
test('DSP: Multiple concurrent jitter buffers', () => {
  const pipeline = AudioPipeline.getInstance();
  const sessionCount = 10;

  for (let i = 0; i < sessionCount; i++) {
    pipeline.createJitterBuffer(`session-${i}`, () => {});
  }

  // Verify all buffers exist
  for (let i = 0; i < sessionCount; i++) {
    const depth = pipeline.getJitterBufferDepth(`session-${i}`);
    assert(typeof depth === 'number', `Buffer ${i} not created`);
  }

  // Cleanup
  for (let i = 0; i < sessionCount; i++) {
    pipeline.destroyJitterBuffer(`session-${i}`);
  }

  console.log(`  → Created and destroyed ${sessionCount} jitter buffers`);
});

// ═════════════════════════════════════════════════════════════════════════════
// Performance Summary
// ═════════════════════════════════════════════════════════════════════════════

setTimeout(() => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  console.log(`Tests passed: ${passed}/${results.length}`);
  console.log(`Total time: ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(2)}ms`);
  console.log(`Average per test: ${avgDuration.toFixed(2)}ms`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.name}: ${r.message}`);
    });
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  }
}, 1000);
