import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, loadEnvironment } from '../src/config/environment.js';

describe('loadEnvironment', () => {
  it('applies safe defaults and freezes the result', () => {
    const environment = loadEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
      RESIDENT_BOT_TOKEN: '',
    });

    expect(environment).toEqual({
      AUTOMATION_ENABLED: false,
      AUTOMATION_POLL_SECONDS: 30,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
      PORT: 3000,
      RESIDENT_BOT_ENABLED: false,
      RESIDENT_BOT_RATE_LIMIT: 30,
      SERVICE_NAME: 'mahalla-service',
      STAFF_BOT_ENABLED: false,
      STAFF_BOT_RATE_LIMIT: 60,
      TELEGRAM_RATE_LIMIT_WINDOW_SECONDS: 60,
    });
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('coerces valid external configuration', () => {
    const environment = loadEnvironment({
      DATABASE_URL: 'postgres://user:password@database:5432/mck',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
      PORT: '8080',
      SERVICE_NAME: 'mck-api',
    });

    expect(environment.PORT).toBe(8080);
    expect(environment.NODE_ENV).toBe('production');
  });

  it('rejects a non-PostgreSQL URL without disclosing its value', () => {
    const secretValue = 'https://admin:super-secret@example.com/database';

    expect(() => loadEnvironment({ DATABASE_URL: secretValue })).toThrowError(
      EnvironmentValidationError,
    );

    try {
      loadEnvironment({ DATABASE_URL: secretValue });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as Error).message).not.toContain('super-secret');
      expect((error as Error).message).toContain('DATABASE_URL');
    }
  });

  it('rejects an invalid port', () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
        PORT: '70000',
      }),
    ).toThrowError(EnvironmentValidationError);
  });

  it('reports a missing required variable by name', () => {
    expect(() => loadEnvironment({})).toThrowError(/DATABASE_URL/);
  });

  it('requires a syntactically valid token only when the resident bot is enabled', () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
        RESIDENT_BOT_ENABLED: 'true',
      }),
    ).toThrowError(/RESIDENT_BOT_TOKEN/);

    expect(
      loadEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
        RESIDENT_BOT_ENABLED: 'true',
        RESIDENT_BOT_TOKEN: `123456:${'a'.repeat(30)}`,
      }).RESIDENT_BOT_ENABLED,
    ).toBe(true);
  });

  it('requires a separate valid token only when the staff bot is enabled', () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
        STAFF_BOT_ENABLED: 'true',
      }),
    ).toThrowError(/STAFF_BOT_TOKEN/);

    const environment = loadEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
      STAFF_BOT_ENABLED: 'true',
      STAFF_BOT_TOKEN: `654321:${'b'.repeat(30)}`,
    });
    expect(environment.STAFF_BOT_ENABLED).toBe(true);
    expect(environment.STAFF_BOT_TOKEN).toMatch(/^654321:/);
  });

  it('requires both delivery tokens when automation is enabled', () => {
    expect(() =>
      loadEnvironment({
        AUTOMATION_ENABLED: 'true',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/mck',
      }),
    ).toThrowError(/RESIDENT_BOT_TOKEN.*STAFF_BOT_TOKEN/);
  });
});
