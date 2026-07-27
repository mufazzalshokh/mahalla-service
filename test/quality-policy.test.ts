import { describe, expect, it } from 'vitest';

import {
  validateComplaint,
  validateFeedback,
  validateInspection,
  validateReworkReason,
} from '../src/domain/quality/quality-policy.js';

const checklist = [
  { code: 'WORK', isRequired: true },
  { code: 'CLEAN', isRequired: false },
] as const;

describe('quality policy', () => {
  it('normalizes a complete passing inspection', () => {
    expect(
      validateInspection(
        checklist,
        [
          { code: 'work', result: 'PASS' },
          { code: 'clean', result: 'NOT_APPLICABLE' },
        ],
        '  Checked safely  ',
      ),
    ).toEqual({
      outcome: 'PASS',
      results: [
        { code: 'WORK', result: 'PASS' },
        { code: 'CLEAN', result: 'NOT_APPLICABLE' },
      ],
      summary: 'Checked safely',
    });
  });

  it('derives failure from any failed item', () => {
    expect(
      validateInspection(
        checklist,
        [
          { code: 'WORK', result: 'FAIL' },
          { code: 'CLEAN', result: 'PASS' },
        ],
        'Needs correction',
      ).outcome,
    ).toBe('FAIL');
  });

  it('rejects empty, unknown, duplicate, missing, and skipped required items', () => {
    expect(() => validateInspection([], [], 'Checked')).toThrowError(
      expect.objectContaining({ code: 'CHECKLIST_EMPTY' }),
    );
    expect(() =>
      validateInspection(checklist, [{ code: 'OTHER', result: 'PASS' }], 'Checked'),
    ).toThrowError(expect.objectContaining({ code: 'CHECKLIST_ITEM_UNKNOWN' }));
    expect(() =>
      validateInspection(
        checklist,
        [
          { code: 'WORK', result: 'PASS' },
          { code: 'WORK', result: 'PASS' },
        ],
        'Checked',
      ),
    ).toThrowError(expect.objectContaining({ code: 'CHECKLIST_ITEM_DUPLICATE' }));
    expect(() =>
      validateInspection(checklist, [{ code: 'WORK', result: 'PASS' }], 'Checked'),
    ).toThrowError(expect.objectContaining({ code: 'CHECKLIST_ITEM_MISSING' }));
    expect(() =>
      validateInspection(
        checklist,
        [
          { code: 'WORK', result: 'NOT_APPLICABLE' },
          { code: 'CLEAN', result: 'PASS' },
        ],
        'Checked',
      ),
    ).toThrowError(expect.objectContaining({ code: 'CHECKLIST_REQUIRED_NOT_APPLICABLE' }));
  });

  it('validates bounded feedback and decision text', () => {
    expect(validateFeedback(5, '  Great work  ')).toEqual({
      comment: 'Great work',
      rating: 5,
    });
    expect(validateFeedback(1)).toEqual({ comment: null, rating: 1 });
    expect(() => validateFeedback(0)).toThrowError(
      expect.objectContaining({ code: 'RATING_INVALID' }),
    );
    expect(() => validateFeedback(3, 'x')).toThrowError(
      expect.objectContaining({ code: 'QUALITY_TEXT_INVALID' }),
    );
    expect(validateComplaint('  Water still leaks  ')).toBe('Water still leaks');
    expect(validateReworkReason('  Fix leak  ')).toBe('Fix leak');
    expect(() => validateComplaint('bad')).toThrowError(
      expect.objectContaining({ code: 'QUALITY_TEXT_INVALID' }),
    );
    expect(() => validateReworkReason('x')).toThrowError(
      expect.objectContaining({ code: 'QUALITY_TEXT_INVALID' }),
    );
  });
});
