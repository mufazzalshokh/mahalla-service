import { readFileSync } from 'node:fs';

import { z } from 'zod';

const postgresProtocols = new Set(['postgres:', 'postgresql:']);

const environmentSchema = z
  .object({
    AUTOMATION_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTOMATION_POLL_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
    BOT_CONSUMER_LOCK_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => postgresProtocols.has(new URL(value).protocol), {
        message: 'must use the postgres or postgresql protocol',
      }),
    HOST: z.string().min(1).default('127.0.0.1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    RELEASE_ID: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/)
      .default('development'),
    RESIDENT_BOT_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RESIDENT_BOT_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/)
        .optional(),
    ),
    SERVICE_NAME: z.string().min(1).max(100).default('mahalla-service'),
    STAFF_BOT_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    STAFF_BOT_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/)
        .optional(),
    ),
    RESIDENT_BOT_RATE_LIMIT: z.coerce.number().int().min(5).max(300).default(30),
    STAFF_BOT_RATE_LIMIT: z.coerce.number().int().min(5).max(600).default(60),
    TELEGRAM_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  })
  .superRefine((value, context) => {
    if (value.RESIDENT_BOT_ENABLED && !value.RESIDENT_BOT_TOKEN) {
      context.addIssue({
        code: 'custom',
        message: 'is required when RESIDENT_BOT_ENABLED=true',
        path: ['RESIDENT_BOT_TOKEN'],
      });
    }
    if (value.STAFF_BOT_ENABLED && !value.STAFF_BOT_TOKEN) {
      context.addIssue({
        code: 'custom',
        message: 'is required when STAFF_BOT_ENABLED=true',
        path: ['STAFF_BOT_TOKEN'],
      });
    }
    if (
      value.RESIDENT_BOT_ENABLED &&
      value.STAFF_BOT_ENABLED &&
      value.RESIDENT_BOT_TOKEN === value.STAFF_BOT_TOKEN
    ) {
      context.addIssue({
        code: 'custom',
        message: 'must be different from RESIDENT_BOT_TOKEN',
        path: ['STAFF_BOT_TOKEN'],
      });
    }
    if (value.AUTOMATION_ENABLED && !value.RESIDENT_BOT_TOKEN) {
      context.addIssue({
        code: 'custom',
        message: 'is required when AUTOMATION_ENABLED=true',
        path: ['RESIDENT_BOT_TOKEN'],
      });
    }
    if (value.AUTOMATION_ENABLED && !value.STAFF_BOT_TOKEN) {
      context.addIssue({
        code: 'custom',
        message: 'is required when AUTOMATION_ENABLED=true',
        path: ['STAFF_BOT_TOKEN'],
      });
    }
  });

export type Environment = Readonly<z.infer<typeof environmentSchema>>;

export interface EnvironmentIssue {
  readonly message: string;
  readonly path: string;
}

export class EnvironmentValidationError extends Error {
  readonly issues: readonly EnvironmentIssue[];

  constructor(issues: readonly EnvironmentIssue[]) {
    super(
      `Invalid environment configuration: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

type SecretFileReader = (path: string) => string;

const secretFileVariables = [
  ['DATABASE_URL', 'DATABASE_URL_FILE'],
  ['RESIDENT_BOT_TOKEN', 'RESIDENT_BOT_TOKEN_FILE'],
  ['STAFF_BOT_TOKEN', 'STAFF_BOT_TOKEN_FILE'],
] as const;

function resolveSecretFiles(
  source: NodeJS.ProcessEnv,
  readSecretFile: SecretFileReader,
): NodeJS.ProcessEnv {
  const resolved = { ...source };
  const issues: EnvironmentIssue[] = [];
  for (const [valueName, fileName] of secretFileVariables) {
    const directValue = source[valueName]?.trim();
    const filePath = source[fileName]?.trim();
    if (directValue && filePath) {
      issues.push({ message: `cannot be used together with ${valueName}`, path: fileName });
      continue;
    }
    if (!filePath) continue;
    try {
      const value = readSecretFile(filePath).trim();
      if (!value) {
        issues.push({ message: 'secret file is empty', path: fileName });
      } else {
        resolved[valueName] = value;
      }
    } catch {
      issues.push({ message: 'secret file could not be read', path: fileName });
    }
  }
  if (issues.length > 0) throw new EnvironmentValidationError(issues);
  return resolved;
}

export function loadEnvironment(
  source: NodeJS.ProcessEnv,
  readSecretFile: SecretFileReader = (path) => readFileSync(path, 'utf8'),
): Environment {
  const parsed = environmentSchema.safeParse(resolveSecretFiles(source, readSecretFile));
  if (!parsed.success) {
    throw new EnvironmentValidationError(
      parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.') || 'environment',
      })),
    );
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as Environment,
  );
}
