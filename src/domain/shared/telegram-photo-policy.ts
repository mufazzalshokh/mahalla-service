import { DomainRuleError } from './domain-errors.js';

export const maximumTelegramPhotoBytes = 10 * 1024 * 1024;

export interface TelegramPhotoReference {
  readonly fileId: string;
  readonly fileSize: number;
  readonly fileUniqueId: string;
}

function safeOpaqueReference(value: string, maximumLength: number): boolean {
  return (
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  );
}

export function isSafeTelegramPhotoReference(input: TelegramPhotoReference): boolean {
  return (
    safeOpaqueReference(input.fileId, 512) &&
    safeOpaqueReference(input.fileUniqueId, 256) &&
    Number.isInteger(input.fileSize) &&
    input.fileSize > 0 &&
    input.fileSize <= maximumTelegramPhotoBytes
  );
}

export function assertSafeTelegramPhotoReference(input: TelegramPhotoReference): void {
  if (!safeOpaqueReference(input.fileId, 512) || !safeOpaqueReference(input.fileUniqueId, 256)) {
    throw new DomainRuleError('WORK_EVIDENCE_INVALID', 'Telegram file identity is invalid');
  }
  if (
    !Number.isInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > maximumTelegramPhotoBytes
  ) {
    throw new DomainRuleError('WORK_EVIDENCE_SIZE_INVALID', 'Evidence must be at most 10 MB');
  }
}
