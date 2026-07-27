import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyError } from 'fastify';

import { HealthService } from '../src/application/health/health-service.js';
import type { ReadinessProbe } from '../src/application/health/readiness-probe.js';
import { buildApp } from '../src/interfaces/http/build-app.js';

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

function createApp(probe?: ReadinessProbe): ReturnType<typeof buildApp> {
  const app = buildApp({
    healthService: new HealthService(probe ? [probe] : []),
    logger: false,
    serviceName: 'mahalla-service-test',
  });
  apps.push(app);
  return app;
}

describe('HTTP health boundary', () => {
  it('returns liveness without checking dependencies', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const probe: ReadinessProbe = { check, name: 'postgres' };
    const response = await createApp(probe).inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: 'mahalla-service-test', status: 'ok' });
    expect(check).not.toHaveBeenCalled();
  }, 10_000);

  it('returns 200 when dependencies are ready', async () => {
    const probe: ReadinessProbe = {
      check: vi.fn().mockResolvedValue(undefined),
      name: 'postgres',
    };
    const response = await createApp(probe).inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready' });
  });

  it('returns 503 and no internal error when a dependency is unavailable', async () => {
    const probe: ReadinessProbe = {
      check: vi.fn().mockRejectedValue(new Error('postgresql://secret-value')),
      name: 'postgres',
    };
    const response = await createApp(probe).inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      checks: [{ name: 'postgres', status: 'not_ready' }],
      status: 'not_ready',
    });
    expect(response.body).not.toContain('secret-value');
  });

  it('uses a safe incoming request ID', async () => {
    const response = await createApp().inject({
      headers: { 'x-request-id': 'demo-request_123' },
      method: 'GET',
      url: '/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ requestId: 'demo-request_123' });
  });

  it('replaces an unsafe incoming request ID', async () => {
    const unsafeId = 'unsafe request id with spaces and private content';
    const response = await createApp().inject({
      headers: { 'x-request-id': unsafeId },
      method: 'GET',
      url: '/missing',
    });

    expect(response.statusCode).toBe(404);
    const payload = response.json<{ requestId: string }>();
    expect(payload.requestId).not.toBe(unsafeId);
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('supports active structured logging without changing route behavior', async () => {
    const app = buildApp({
      healthService: new HealthService([]),
      logLevel: 'silent',
      serviceName: 'logged-service',
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: 'logged-service', status: 'ok' });
  });

  it('returns a safe internal error without leaking its message', async () => {
    const app = createApp();
    app.get('/internal-error', () => {
      throw new Error('database password should not escape');
    });

    const response = await app.inject({ method: 'GET', url: '/internal-error' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(response.body).not.toContain('database password');
  });

  it('preserves a deliberate client error status', async () => {
    const app = createApp();
    app.get('/client-error', () => {
      const error = new Error('Invalid request') as FastifyError;
      error.statusCode = 400;
      throw error;
    });

    const response = await app.inject({ method: 'GET', url: '/client-error' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'REQUEST_ERROR', message: 'Invalid request' },
    });
  });
});
