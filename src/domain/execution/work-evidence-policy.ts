import { DomainRuleError } from '../shared/domain-errors.js';
import { assertSafeTelegramPhotoReference } from '../shared/telegram-photo-policy.js';

export const workEvidencePhases = ['BEFORE', 'AFTER'] as const;
export type WorkEvidencePhase = (typeof workEvidencePhases)[number];

export interface WorkEvidenceInput {
  readonly fileId: string;
  readonly fileSize: number;
  readonly fileUniqueId: string;
  readonly mediaType: 'image/jpeg' | 'image/png';
  readonly note?: string;
  readonly phase: WorkEvidencePhase;
}

export function validateWorkLogNote(note: string): string {
  const normalized = note.trim();
  if (normalized.length < 3 || normalized.length > 2_000) {
    throw new DomainRuleError(
      'WORK_LOG_NOTE_INVALID',
      'Work log note must contain 3 to 2000 characters',
    );
  }
  return normalized;
}

export function validateWorkEvidence(input: WorkEvidenceInput, existingCount: number): void {
  assertSafeTelegramPhotoReference(input);
  if (input.mediaType !== 'image/jpeg' && input.mediaType !== 'image/png') {
    throw new DomainRuleError(
      'WORK_EVIDENCE_TYPE_INVALID',
      'Only JPEG and PNG evidence is accepted',
    );
  }
  if (existingCount >= 3) {
    throw new DomainRuleError('WORK_EVIDENCE_LIMIT', 'At most three photos are allowed per phase');
  }
  if (input.note !== undefined && input.note.trim().length > 500) {
    throw new DomainRuleError(
      'WORK_EVIDENCE_NOTE_INVALID',
      'Evidence note must be at most 500 characters',
    );
  }
}
