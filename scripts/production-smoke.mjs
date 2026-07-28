import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = new URL(argumentsMap.get('--base-url') ?? 'http://127.0.0.1:3000');
const expectedRelease = argumentsMap.get('--expected-release');
const allowRemote = process.argv.includes('--allow-remote');
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);
if (!allowRemote && !loopbackHosts.has(baseUrl.hostname)) {
  throw new Error('Remote smoke tests require an explicit --allow-remote flag');
}
if (!expectedRelease || !/^[A-Za-z0-9._-]{1,64}$/.test(expectedRelease)) {
  throw new Error('--expected-release is required and must be a bounded release identifier');
}

async function response(path) {
  return globalThis.fetch(new URL(path, baseUrl), {
    headers: { 'x-request-id': `production-smoke-${path.slice(1)}` },
    signal: globalThis.AbortSignal.timeout(5_000),
  });
}

let lastError;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const health = await response('/health');
    const ready = await response('/ready');
    const metrics = await response('/metrics');
    const healthPayload = await health.json();
    const readyPayload = await ready.json();
    const metricsBody = await metrics.text();
    if (!health.ok || healthPayload.release !== expectedRelease) {
      throw new Error('Liveness release mismatch');
    }
    if (!ready.ok || readyPayload.status !== 'ready') throw new Error('Readiness failed');
    if (!metrics.ok || !metricsBody.includes('mck_process_uptime_seconds')) {
      throw new Error('Metrics contract failed');
    }
    for (const candidate of [health, ready, metrics]) {
      if (
        candidate.headers.get('cache-control') !== 'no-store' ||
        candidate.headers.get('x-content-type-options') !== 'nosniff' ||
        !candidate.headers.get('x-request-id')
      ) {
        throw new Error('Security/correlation headers failed');
      }
    }
    console.log(`Production smoke: PASS release=${expectedRelease}`);
    lastError = undefined;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 30) await delay(2_000);
  }
}

if (lastError) throw new Error('Production smoke failed after 30 attempts');
