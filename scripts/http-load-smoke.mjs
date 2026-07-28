import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = new URL(argumentsMap.get('--base-url') ?? 'http://127.0.0.1:3000');
const totalRequests = Number(argumentsMap.get('--requests') ?? 500);
const concurrency = Number(argumentsMap.get('--concurrency') ?? 25);
const allowRemote = process.argv.includes('--allow-remote');
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);

if (!allowRemote && !loopbackHosts.has(baseUrl.hostname)) {
  throw new Error('Remote load checks require an explicit --allow-remote flag');
}
if (
  !Number.isInteger(totalRequests) ||
  totalRequests < 1 ||
  totalRequests > 5_000 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 100
) {
  throw new Error('Use 1..5000 requests and concurrency 1..100');
}

const durations = [];
let nextRequest = 0;
let failures = 0;

async function worker() {
  while (nextRequest < totalRequests) {
    nextRequest += 1;
    const startedAt = performance.now();
    try {
      const response = await globalThis.fetch(new URL('/health', baseUrl), {
        headers: { 'x-request-id': `load-${nextRequest}` },
        signal: globalThis.AbortSignal.timeout(5_000),
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
durations.sort((left, right) => left - right);
const percentile = (ratio) =>
  durations[Math.min(durations.length - 1, Math.floor(durations.length * ratio))];
const p95 = percentile(0.95);
const maximum = durations.at(-1);

console.log(
  `HTTP load smoke: requests=${totalRequests} concurrency=${concurrency} failures=${failures} p95_ms=${p95?.toFixed(1)} max_ms=${maximum?.toFixed(1)}`,
);
if (failures > 0) process.exitCode = 1;
