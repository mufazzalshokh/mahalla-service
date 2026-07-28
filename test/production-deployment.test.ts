import { describe, expect, it } from 'vitest';

import {
  ProductionDeploymentValidationError,
  validateProductionDeployment,
  type ProductionDeploymentInput,
} from '../src/config/production-deployment.js';

function validInput(): ProductionDeploymentInput {
  return {
    secrets: {
      backup_passphrase: 'correct horse battery staple backup',
      database_url: 'postgresql://mck:private-password-with-entropy@postgres:5432/mck',
      ops_alert_chat_id: '-1001234567890',
      postgres_password: 'private-password-with-entropy',
      resident_bot_token: `123456:${'a'.repeat(30)}`,
      staff_bot_token: `654321:${'b'.repeat(30)}`,
    },
    settings: {
      MCK_BACKUP_DESTINATION: 'buyer-controlled-encrypted-drive',
      MCK_BACKUP_DIR: '/var/backups/mahalla-service',
      MCK_DB_NAME: 'mck',
      MCK_DB_USER: 'mck',
      MCK_HEALTH_PORT: '3000',
      MCK_OPS_OWNER: 'mck-owner',
      MCK_RELEASE: 'a'.repeat(40),
      MCK_SECRET_DIR: '/opt/mahalla-service/secrets',
      NODE_IMAGE: `node@sha256:${'b'.repeat(64)}`,
      POSTGRES_IMAGE: `postgres@sha256:${'c'.repeat(64)}`,
    },
  };
}

describe('production deployment policy', () => {
  it('accepts digest-pinned images, an immutable release, private paths, and distinct secrets', () => {
    expect(() => validateProductionDeployment(validInput())).not.toThrow();
  });

  it('rejects mutable images, unsafe paths, invalid secrets, and an ambiguous release safely', () => {
    const input = validInput();
    const invalid: ProductionDeploymentInput = {
      secrets: {
        ...input.secrets,
        backup_passphrase: 'short',
        database_url: 'postgresql://private-password@public.example/mck',
        staff_bot_token: input.secrets.resident_bot_token,
      },
      settings: {
        ...input.settings,
        MCK_BACKUP_DIR: 'relative',
        MCK_RELEASE: 'main',
        NODE_IMAGE: 'node:24-alpine',
        POSTGRES_PASSWORD: 'must-not-be-here',
      },
    };

    try {
      validateProductionDeployment(invalid);
      throw new Error('Expected validation to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProductionDeploymentValidationError);
      expect((error as Error).message).not.toContain('private-password');
      expect((error as ProductionDeploymentValidationError).issues.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          'MCK_BACKUP_DIR',
          'MCK_RELEASE',
          'NODE_IMAGE',
          'POSTGRES_PASSWORD',
          'backup_passphrase',
          'database_url',
          'staff_bot_token',
        ]),
      );
    }
  });

  it('rejects unsupported variables and shell syntax before scripts source the file', () => {
    const input = validInput();
    const invalid: ProductionDeploymentInput = {
      ...input,
      settings: {
        ...input.settings,
        EVIL: 'ignored',
        MCK_BACKUP_DESTINATION: '$(touch /tmp/unsafe)',
        MCK_OPS_OWNER: 'owner;touch-file',
      },
    };

    try {
      validateProductionDeployment(invalid);
      throw new Error('Expected validation to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProductionDeploymentValidationError);
      expect((error as ProductionDeploymentValidationError).issues.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['EVIL', 'MCK_BACKUP_DESTINATION', 'MCK_OPS_OWNER']),
      );
    }
  });
});
