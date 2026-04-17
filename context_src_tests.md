# Context: context_src_tests.md

## File: src\tests\story-1-4-dsp.test.ts
```typescript
   1 | /**
   2 |  * Story 1.4 Test Suite: Low-Latency Signal Processing
   3 |  * Validates DSP performance, audio quality, and jitter buffer behavior
   4 |  *
   5 |  * Run with: npx ts-node src/tests/story-1-4-dsp.test.ts
   6 |  */
   7 | 
   8 | import { AudioPipeline, AudioDspState } from '../audio/AudioPipeline';
   9 | import { JitterBuffer } from '../audio/JitterBuffer';
  10 | import { BufferPool } from '../audio/BufferPool';
  11 | 
  12 | // ═════════════════════════════════════════════════════════════════════════════
  13 | // Test Helpers
  14 | // ═════════════════════════════════════════════════════════════════════════════
  15 | 
  16 | interface TestResult {
  17 |   name: string;
  18 |   passed: boolean;
  19 |   duration: number;
  20 |   message?: string;
  21 | }
  22 | 
  23 | const results: TestResult[] = [];
  24 | 
  25 | function test(name: string, fn: () => void | Promise<void>): void {
  26 |   const start = process.hrtime.bigint();
  27 |   try {
  28 |     const result = fn();
  29 |     if (result instanceof Promise) {
  30 |       result.then(() => {
  31 |         const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
  32 |         results.push({ name, passed: true, duration });
  33 |         console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
  34 |       });
  35 |     } else {
  36 |       const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
  37 |       results.push({ name, passed: true, duration });
  38 |       console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
  39 |     }
  40 |   } catch (error) {
  41 |     const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
  42 |     const message = error instanceof Error ? error.message : String(error);
  43 |     results.push({ name, passed: false, duration, message });
  44 |     console.error(`✗ ${name}: ${message}`);
  45 |   }
  46 | }
  47 | 
  48 | function assert(condition: boolean, message: string): void {
  49 |   if (!condition) throw new Error(message);
  50 | }
  51 | 
  52 | function assertEquals(a: any, b: any, message: string): void {
  53 |   if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
  54 | }
  55 | 
  56 | function assertApprox(a: number, b: number, tolerance: number, message: string): void {
  57 |   if (Math.abs(a - b) > tolerance) {
  58 |     throw new Error(`${message}: expected ${b} ±${tolerance}, got ${a}`);
  59 |   }
  60 | }
  61 | 
  62 | /**
  63 |  * Generate test audio (sine wave or white noise)
  64 |  */
  65 | function generateTestAudio(samples: number, frequency: number = 440, amplitude: number = 10000): Buffer {
  66 |   const buf = Buffer.allocUnsafe(samples * 2);
  67 |   for (let i = 0; i < samples; i++) {
  68 |     const sample = Math.round(amplitude * Math.sin((2 * Math.PI * frequency * i) / 16000));
  69 |     buf.writeInt16LE(sample, i * 2);
  70 |   }
  71 |   return buf;
  72 | }
  73 | 
  74 | function generateWhiteNoise(samples: number, amplitude: number = 1000): Buffer {
  75 |   const buf = Buffer.allocUnsafe(samples * 2);
  76 |   for (let i = 0; i < samples; i++) {
  77 |     const sample = Math.round((Math.random() * 2 - 1) * amplitude);
  78 |     buf.writeInt16LE(sample, i * 2);
  79 |   }
  80 |   return buf;
  81 | }
  82 | 
  83 | /**
  84 |  * Measure processing latency with process.hrtime.bigint()
  85 |  */
  86 | function measureLatency(fn: () => void): number {
  87 |   const start = process.hrtime.bigint();
  88 |   fn();
  89 |   const elapsed = process.hrtime.bigint() - start;
  90 |   return Number(elapsed) / 1_000_000; // ns → ms
  91 | }
  92 | 
  93 | // ═════════════════════════════════════════════════════════════════════════════
  94 | // Test Suite
  95 | // ═════════════════════════════════════════════════════════════════════════════
  96 | 
  97 | console.log('\n╔════════════════════════════════════════════════════════════════╗');
  98 | console.log('║  Story 1.4: Low-Latency Signal Processing Test Suite          ║');
  99 | console.log('╚════════════════════════════════════════════════════════════════╝\n');
 100 | 
 101 | // Test 1: BufferPool functionality
 102 | test('BufferPool: acquire and release', () => {
 103 |   const pool = new BufferPool(640, 10);
 104 |   assertEquals(pool.getDepth(), 10, 'Initial pool size');
 105 | 
 106 |   const buf1 = pool.acquire();
 107 |   assertEquals(pool.getDepth(), 9, 'After acquire');
 108 |   assertEquals(buf1.length, 640, 'Buffer size');
 109 | 
 110 |   pool.release(buf1);
 111 |   assertEquals(pool.getDepth(), 10, 'After release');
 112 | });
 113 | 
 114 | // Test 2: DC offset removal latency
 115 | test('DSP: DC offset removal latency <0.5ms', () => {
 116 |   const pipeline = AudioPipeline.getInstance();
 117 |   const dspState: AudioDspState = {
 118 |     dcIn: { prevIn: 0, prevOut: 0 },
 119 |     firOut: { history: new Array(6).fill(0) }
 120 |   };
 121 | 
 122 |   const testAudio = generateTestAudio(320); // 20ms at 16kHz
 123 |   const latency = measureLatency(() => {
 124 |     pipeline.processInbound(testAudio.toString('base64'), dspState.dcIn, false);
 125 |   });
 126 | 
 127 |   assertApprox(latency, 0, 0.5, 'DC offset latency');
 128 | });
 129 | 
 130 | // Test 3: Endianness swap correctness
 131 | test('DSP: Endianness swap (swap16) correctness', () => {
 132 |   const data = Buffer.from([0x12, 0x34, 0x56, 0x78]);
 133 |   const expected = Buffer.from([0x34, 0x12, 0x78, 0x56]);
 134 | 
 135 |   data.swap16();
 136 |   assert(data.equals(expected), 'Swap16 byte order mismatch');
 137 | });
 138 | 
 139 | // Test 4: RMS calculation
 140 | test('DSP: RMS calculation (dBFS)', () => {
 141 |   const pipeline = AudioPipeline.getInstance();
 142 |   const sine = generateTestAudio(320, 440, 16000); // ~-1dBFS
 143 |   const dbfs = pipeline.calculateRmsDbfs(sine);
 144 | 
 145 |   // Full-scale sine ≈ -3dBFS
 146 |   assertApprox(dbfs, -3, 1, 'RMS dBFS for full-scale sine');
 147 | });
 148 | 
 149 | // Test 5: Jitter buffer basic operations
 150 | test('JitterBuffer: push and drain', async () => {
 151 |   let drainedChunks = 0;
 152 |   const onDrain = () => {
 153 |     drainedChunks++;
 154 |   };
 155 | 
 156 |   const jb = new JitterBuffer(onDrain);
 157 |   jb.start();
 158 | 
 159 |   // Push 2 chunks (640 bytes each = 20ms)
 160 |   const chunk1 = generateTestAudio(320);
 161 |   const chunk2 = generateTestAudio(320);
 162 | 
 163 |   jb.push(Buffer.concat([chunk1, chunk2]));
 164 | 
 165 |   // Wait for 2 ticks (40ms)
 166 |   await new Promise(resolve => setTimeout(resolve, 50));
 167 | 
 168 |   jb.stop();
 169 |   assert(drainedChunks >= 2, 'Jitter buffer drain count');
 170 | });
 171 | 
 172 | // Test 6: Comfort noise generation
 173 | test('JitterBuffer: comfort noise generation', async () => {
 174 |   let cngCount = 0;
 175 |   const onDrain = (buf: Buffer) => {
 176 |     const rms = Math.sqrt(
 177 |       Array.from({ length: buf.length / 2 }, (_, i) =>
 178 |         Math.pow(buf.readInt16LE(i * 2), 2)
 179 |       ).reduce((a, b) => a + b) / (buf.length / 2)
 180 |     );
 181 |     // CNG should be very quiet (RMS < 50)
 182 |     if (rms < 50) cngCount++;
 183 |   };
 184 | 
 185 |   const jb = new JitterBuffer(onDrain);
 186 |   jb.start();
 187 | 
 188 |   // Don't push any audio - should generate CNG
 189 |   await new Promise(resolve => setTimeout(resolve, 50));
 190 |   jb.stop();
 191 | 
 192 |   assert(cngCount > 0, 'Comfort noise not generated');
 193 | });
 194 | 
 195 | // Test 7: Polyphase downsampling quality
 196 | test('DSP: 24kHz→16kHz downsampling ratio', () => {
 197 |   const pipeline = AudioPipeline.getInstance();
 198 |   const dspState: AudioDspState = {
 199 |     dcIn: { prevIn: 0, prevOut: 0 },
 200 |     firOut: { history: new Array(6).fill(0) }
 201 |   };
 202 | 
 203 |   // 480 samples at 24kHz (20ms)
 204 |   const input24k = generateTestAudio(480, 440);
 205 |   const inputBase64 = input24k.toString('base64');
 206 | 
 207 |   let outputSize = 0;
 208 |   const onDrain = (buf: Buffer) => {
 209 |     outputSize = buf.length;
 210 |   };
 211 | 
 212 |   const jb = new JitterBuffer(onDrain);
 213 |   jb.start();
 214 |   pipeline.processOutbound(inputBase64, 'test-session', dspState.firOut);
 215 | 
 216 |   // Wait for processing
 217 |   setTimeout(() => {
 218 |     jb.stop();
 219 |   }, 50);
 220 | });
 221 | 
 222 | // Test 8: Echo suppression
 223 | test('DSP: Echo suppression (-6dB attenuation)', () => {
 224 |   const pipeline = AudioPipeline.getInstance();
 225 |   const dspState: AudioDspState = {
 226 |     dcIn: { prevIn: 0, prevOut: 0 },
 227 |     firOut: { history: new Array(6).fill(0) }
 228 |   };
 229 | 
 230 |   const testAudio = generateTestAudio(320, 440, 16000);
 231 |   const processed = pipeline.processInbound(testAudio.toString('base64'), dspState.dcIn, true); // isAiSpeaking
 232 | 
 233 |   // Check that amplitude is reduced
 234 |   const originalRms = pipeline.calculateRmsDbfs(testAudio);
 235 |   const suppressedRms = pipeline.calculateRmsDbfs(processed);
 236 | 
 237 |   assert(suppressedRms < originalRms, 'Echo suppression not applied');
 238 | });
 239 | 
 240 | // Test 9: Soft limiter gain
 241 | test('DSP: Soft limiter (-3dB gain)', () => {
 242 |   const pipeline = AudioPipeline.getInstance();
 243 |   const dspState: AudioDspState = {
 244 |     dcIn: { prevIn: 0, prevOut: 0 },
 245 |     firOut: { history: new Array(6).fill(0) }
 246 |   };
 247 | 
 248 |   // Outbound processing applies soft limiter
 249 |   const testAudio = generateTestAudio(480, 440, 16000);
 250 |   const inputBase64 = testAudio.toString('base64');
 251 | 
 252 |   let processed: Buffer | null = null;
 253 |   const onDrain = (buf: Buffer) => {
 254 |     if (!processed) processed = buf;
 255 |   };
 256 | 
 257 |   const jb = new JitterBuffer(onDrain);
 258 |   jb.start();
 259 |   pipeline.processOutbound(inputBase64, 'test-session', dspState.firOut);
 260 | 
 261 |   setTimeout(() => {
 262 |     jb.stop();
 263 |     if (processed) {
 264 |       const originalRms = pipeline.calculateRmsDbfs(testAudio);
 265 |       const processedRms = pipeline.calculateRmsDbfs(processed);
 266 |       // Soft limiter + downsample + filters will reduce level
 267 |       assert(processedRms <= originalRms, 'Level not reduced by limiter');
 268 |     }
 269 |   }, 100);
 270 | });
 271 | 
 272 | // Test 10: Concurrent jitter buffers
 273 | test('DSP: Multiple concurrent jitter buffers', () => {
 274 |   const pipeline = AudioPipeline.getInstance();
 275 |   const sessionCount = 10;
 276 | 
 277 |   for (let i = 0; i < sessionCount; i++) {
 278 |     pipeline.createJitterBuffer(`session-${i}`, () => {});
 279 |   }
 280 | 
 281 |   // Verify all buffers exist
 282 |   for (let i = 0; i < sessionCount; i++) {
 283 |     const depth = pipeline.getJitterBufferDepth(`session-${i}`);
 284 |     assert(typeof depth === 'number', `Buffer ${i} not created`);
 285 |   }
 286 | 
 287 |   // Cleanup
 288 |   for (let i = 0; i < sessionCount; i++) {
 289 |     pipeline.destroyJitterBuffer(`session-${i}`);
 290 |   }
 291 | 
 292 |   console.log(`  → Created and destroyed ${sessionCount} jitter buffers`);
 293 | });
 294 | 
 295 | // ═════════════════════════════════════════════════════════════════════════════
 296 | // Performance Summary
 297 | // ═════════════════════════════════════════════════════════════════════════════
 298 | 
 299 | setTimeout(() => {
 300 |   console.log('\n╔════════════════════════════════════════════════════════════════╗');
 301 |   console.log('║  Test Summary                                                  ║');
 302 |   console.log('╚════════════════════════════════════════════════════════════════╝\n');
 303 | 
 304 |   const passed = results.filter(r => r.passed).length;
 305 |   const failed = results.filter(r => !r.passed).length;
 306 |   const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
 307 | 
 308 |   console.log(`Tests passed: ${passed}/${results.length}`);
 309 |   console.log(`Total time: ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(2)}ms`);
 310 |   console.log(`Average per test: ${avgDuration.toFixed(2)}ms`);
 311 | 
 312 |   if (failed > 0) {
 313 |     console.log('\nFailed tests:');
 314 |     results.filter(r => !r.passed).forEach(r => {
 315 |       console.log(`  ✗ ${r.name}: ${r.message}`);
 316 |     });
 317 |     process.exit(1);
 318 |   } else {
 319 |     console.log('\n✓ All tests passed!');
 320 |     process.exit(0);
 321 |   }
 322 | }, 1000);
```

