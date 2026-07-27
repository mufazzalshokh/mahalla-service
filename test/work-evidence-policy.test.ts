import { describe, expect, it } from 'vitest';

import {
  validateWorkEvidence,
  validateWorkLogNote,
  type WorkEvidenceInput,
} from '../src/domain/execution/work-evidence-policy.js';

const valid: WorkEvidenceInput = {
  fileId: 'telegram-file',
  fileSize: 1024,
  fileUniqueId: 'unique-file',
  mediaType: 'image/jpeg',
  phase: 'BEFORE',
};

describe('work evidence policy', () => {
  it('normalizes bounded work notes', () => {
    expect(validateWorkLogNote('  Pipe replaced  ')).toBe('Pipe replaced');
    expect(() => validateWorkLogNote('x')).toThrowError(/3 to 2000/);
    expect(() => validateWorkLogNote('x'.repeat(2_001))).toThrowError(/3 to 2000/);
  });

  it('accepts a controlled photo before the per-phase limit', () => {
    expect(() => validateWorkEvidence(valid, 2)).not.toThrow();
  });

  it('requires Telegram identity, bounded size and supported media', () => {
    expect(() => validateWorkEvidence({ ...valid, fileId: '' }, 0)).toThrowError(/identity/i);
    expect(() => validateWorkEvidence({ ...valid, fileSize: 0 }, 0)).toThrowError(/10 MB/i);
    expect(() => validateWorkEvidence({ ...valid, fileSize: 10_485_761 }, 0)).toThrowError(
      /10 MB/i,
    );
    expect(() =>
      validateWorkEvidence({ ...valid, mediaType: 'image/gif' as never }, 0),
    ).toThrowError(/JPEG/i);
  });

  it('enforces phase count and note size', () => {
    expect(() => validateWorkEvidence(valid, 3)).toThrowError(/three/i);
    expect(() => validateWorkEvidence({ ...valid, note: 'x'.repeat(501) }, 0)).toThrowError(/500/);
  });
});
