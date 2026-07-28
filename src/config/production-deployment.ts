import { isAbsolute, resolve } from 'node:path';

export const productionSecretNames = [
  'backup_passphrase',
  'database_url',
  'ops_alert_chat_id',
  'postgres_password',
  'resident_bot_token',
  'staff_bot_token',
] as const;

export type ProductionSecretName = (typeof productionSecretNames)[number];

export interface ProductionDeploymentInput {
  readonly secrets: Readonly<Record<ProductionSecretName, string>>;
  readonly settings: Readonly<Record<string, string | undefined>>;
}

export interface ProductionDeploymentIssue {
  readonly message: string;
  readonly name: string;
}

export class ProductionDeploymentValidationError extends Error {
  readonly issues: readonly ProductionDeploymentIssue[];

  constructor(issues: readonly ProductionDeploymentIssue[]) {
    super(
      `Invalid production deployment configuration: ${issues.map(({ name }) => name).join(', ')}`,
    );
    this.name = 'ProductionDeploymentValidationError';
    this.issues = issues;
  }
}

const digestImage = /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}$/;
const gitRelease = /^[a-f0-9]{40}$/;
const telegramToken = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const safeAbsolutePath = /^\/[A-Za-z0-9._/-]+$/;
const safeDestination = /^[A-Za-z0-9._:/@+-]{3,200}$/;
const safeIdentifier = /^[A-Za-z0-9._@+-]{2,100}$/;
const safeDatabaseIdentifier = /^[a-z][a-z0-9_]{0,62}$/;

const supportedSettings = new Set([
  'AUTOMATION_POLL_SECONDS',
  'BACKUP_PASSPHRASE',
  'DATABASE_URL',
  'LOG_LEVEL',
  'MCK_BACKUP_DESTINATION',
  'MCK_BACKUP_DIR',
  'MCK_DB_NAME',
  'MCK_DB_USER',
  'MCK_HEALTH_PORT',
  'MCK_OPS_OWNER',
  'MCK_RELEASE',
  'MCK_SECRET_DIR',
  'NODE_IMAGE',
  'OPS_ALERT_CHAT_ID',
  'POSTGRES_IMAGE',
  'POSTGRES_PASSWORD',
  'RESIDENT_BOT_RATE_LIMIT',
  'RESIDENT_BOT_TOKEN',
  'STAFF_BOT_RATE_LIMIT',
  'STAFF_BOT_TOKEN',
  'TELEGRAM_RATE_LIMIT_WINDOW_SECONDS',
]);

export function validateProductionDeployment(input: ProductionDeploymentInput): void {
  const issues: ProductionDeploymentIssue[] = [];
  for (const name of Object.keys(input.settings)) {
    if (!supportedSettings.has(name)) {
      issues.push({ message: 'is not a supported production setting', name });
    }
  }
  for (const name of [
    'BACKUP_PASSPHRASE',
    'DATABASE_URL',
    'OPS_ALERT_CHAT_ID',
    'POSTGRES_PASSWORD',
    'RESIDENT_BOT_TOKEN',
    'STAFF_BOT_TOKEN',
  ]) {
    if (input.settings[name]?.trim()) {
      issues.push({ message: 'must be supplied as a secret file', name });
    }
  }
  const requiredSetting = (name: string): string => {
    const value = input.settings[name]?.trim();
    if (!value) issues.push({ message: 'is required', name });
    return value ?? '';
  };

  const release = requiredSetting('MCK_RELEASE');
  if (release && !gitRelease.test(release)) {
    issues.push({ message: 'must be a full lowercase Git commit SHA', name: 'MCK_RELEASE' });
  }
  for (const name of ['NODE_IMAGE', 'POSTGRES_IMAGE']) {
    const value = requiredSetting(name);
    if (value && !digestImage.test(value)) {
      issues.push({ message: 'must be pinned by sha256 digest', name });
    }
  }

  const secretDirectory = requiredSetting('MCK_SECRET_DIR');
  const backupDirectory = requiredSetting('MCK_BACKUP_DIR');
  if (
    secretDirectory &&
    (!isAbsolute(secretDirectory) || !safeAbsolutePath.test(secretDirectory))
  ) {
    issues.push({ message: 'must be a safe absolute path', name: 'MCK_SECRET_DIR' });
  }
  if (
    backupDirectory &&
    (!isAbsolute(backupDirectory) || !safeAbsolutePath.test(backupDirectory))
  ) {
    issues.push({ message: 'must be a safe absolute path', name: 'MCK_BACKUP_DIR' });
  }
  if (secretDirectory && backupDirectory && resolve(secretDirectory) === resolve(backupDirectory)) {
    issues.push({ message: 'must not be the secret directory', name: 'MCK_BACKUP_DIR' });
  }
  const backupDestination = requiredSetting('MCK_BACKUP_DESTINATION');
  if (backupDestination && !safeDestination.test(backupDestination)) {
    issues.push({
      message: 'must contain only safe destination characters',
      name: 'MCK_BACKUP_DESTINATION',
    });
  }
  const operationsOwner = requiredSetting('MCK_OPS_OWNER');
  if (operationsOwner && !safeIdentifier.test(operationsOwner)) {
    issues.push({ message: 'must be a safe owner identifier', name: 'MCK_OPS_OWNER' });
  }

  const port = Number(requiredSetting('MCK_HEALTH_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    issues.push({ message: 'must be a valid TCP port', name: 'MCK_HEALTH_PORT' });
  }

  const databaseName = input.settings.MCK_DB_NAME?.trim() || 'mck';
  const databaseUser = input.settings.MCK_DB_USER?.trim() || 'mck';
  if (!safeDatabaseIdentifier.test(databaseName)) {
    issues.push({ message: 'must be a safe database identifier', name: 'MCK_DB_NAME' });
  }
  if (!safeDatabaseIdentifier.test(databaseUser)) {
    issues.push({ message: 'must be a safe database identifier', name: 'MCK_DB_USER' });
  }
  if (
    input.settings.LOG_LEVEL &&
    !['debug', 'info', 'warn', 'error'].includes(input.settings.LOG_LEVEL)
  ) {
    issues.push({ message: 'must be debug, info, warn, or error', name: 'LOG_LEVEL' });
  }
  for (const name of [
    'AUTOMATION_POLL_SECONDS',
    'RESIDENT_BOT_RATE_LIMIT',
    'STAFF_BOT_RATE_LIMIT',
    'TELEGRAM_RATE_LIMIT_WINDOW_SECONDS',
  ]) {
    const value = input.settings[name];
    if (value !== undefined && (!/^\d{1,6}$/.test(value) || Number(value) < 1)) {
      issues.push({ message: 'must be a positive integer', name });
    }
  }

  const databaseUrl = input.secrets.database_url.trim();
  try {
    const parsed = new URL(databaseUrl);
    if (
      (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
      parsed.hostname !== 'postgres' ||
      parsed.pathname !== `/${databaseName}` ||
      decodeURIComponent(parsed.username) !== databaseUser ||
      decodeURIComponent(parsed.password) !== input.secrets.postgres_password.trim()
    ) {
      throw new Error('invalid production database URL');
    }
  } catch {
    issues.push({ message: 'must target the internal postgres service', name: 'database_url' });
  }
  if (input.secrets.postgres_password.trim().length < 20) {
    issues.push({ message: 'must contain at least 20 characters', name: 'postgres_password' });
  }
  if (!telegramToken.test(input.secrets.resident_bot_token.trim())) {
    issues.push({ message: 'is not a valid Telegram token', name: 'resident_bot_token' });
  }
  if (!telegramToken.test(input.secrets.staff_bot_token.trim())) {
    issues.push({ message: 'is not a valid Telegram token', name: 'staff_bot_token' });
  }
  if (input.secrets.resident_bot_token.trim() === input.secrets.staff_bot_token.trim()) {
    issues.push({ message: 'must differ from the resident token', name: 'staff_bot_token' });
  }
  if (!/^-?\d{1,20}$/.test(input.secrets.ops_alert_chat_id.trim())) {
    issues.push({ message: 'must be a Telegram chat identifier', name: 'ops_alert_chat_id' });
  }
  if (input.secrets.backup_passphrase.trim().length < 24) {
    issues.push({ message: 'must contain at least 24 characters', name: 'backup_passphrase' });
  }

  if (issues.length > 0) throw new ProductionDeploymentValidationError(issues);
}
