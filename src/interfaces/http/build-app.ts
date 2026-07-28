import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

import type { HealthService } from '../../application/health/health-service.js';
import type { OperationalMetrics } from '../../application/observability/operational-metrics.js';
import { safeErrorMetadata } from '../../domain/shared/safe-error.js';

const safeRequestId = /^[A-Za-z0-9._-]{1,64}$/;

export interface BuildAppOptions {
  readonly healthService: HealthService;
  readonly logLevel?: string;
  readonly logger?: boolean;
  readonly metrics?: OperationalMetrics;
  readonly serviceName: string;
}

function generateRequestId(request: IncomingMessage): string {
  const candidate = request.headers['x-request-id'];
  if (typeof candidate === 'string' && safeRequestId.test(candidate)) return candidate;
  return randomUUID();
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const logger =
    options.logger === false
      ? false
      : {
          level: options.logLevel ?? 'info',
          redact: {
            censor: '[REDACTED]',
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.address',
              'req.body.botToken',
              'req.body.phone',
              'req.body.token',
            ],
          },
        };

  const fastifyOptions: FastifyServerOptions = {
    bodyLimit: 65_536,
    genReqId: generateRequestId,
    logController: new LogController({
      disableRequestLogging: false,
      requestIdLogLabel: 'requestId',
    }),
    logger,
  };
  const app = Fastify(fastifyOptions);

  app.addHook('onSend', async (request, reply, payload) => {
    reply
      .header('cache-control', 'no-store')
      .header('content-security-policy', "default-src 'none'")
      .header('referrer-policy', 'no-referrer')
      .header('x-content-type-options', 'nosniff')
      .header('x-request-id', request.id);
    return payload;
  });

  if (options.metrics) {
    app.addHook('onResponse', (request, reply, done) => {
      options.metrics?.recordHttpRequest(request.routeOptions.url, reply.statusCode);
      done();
    });
    app.get('/metrics', (_request, reply) =>
      reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(options.metrics?.renderPrometheus()),
    );
  }

  app.get('/health', () => ({
    service: options.serviceName,
    status: 'ok',
  }));

  app.get('/ready', async (_request, reply) => {
    const result = await options.healthService.readiness();
    return reply.code(result.status === 'ready' ? 200 : 503).send(result);
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
      requestId: request.id,
    }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ error: safeErrorMetadata(error) }, 'Unhandled request error');
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      },
      requestId: request.id,
    });
  });

  return app;
}
