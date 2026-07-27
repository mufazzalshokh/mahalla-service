import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

import type { HealthService } from '../../application/health/health-service.js';

const safeRequestId = /^[A-Za-z0-9._-]{1,64}$/;

export interface BuildAppOptions {
  readonly healthService: HealthService;
  readonly logLevel?: string;
  readonly logger?: boolean;
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
    genReqId: generateRequestId,
    logController: new LogController({
      disableRequestLogging: false,
      requestIdLogLabel: 'requestId',
    }),
    logger,
  };
  const app = Fastify(fastifyOptions);

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
    request.log.error({ err: error }, 'Unhandled request error');
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
