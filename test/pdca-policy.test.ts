import { describe, expect, it } from 'vitest';

import {
  isPdcaClosed,
  planPdcaTransition,
  validatePdcaAction,
} from '../src/domain/pdca/pdca-policy.js';

const now = new Date('2026-07-27T10:00:00Z');

describe('PDCA policy', () => {
  it('normalizes a bounded future action', () => {
    expect(
      validatePdcaAction(
        {
          dueAt: new Date('2026-08-01T10:00:00Z'),
          expectedOutcome: '  No leak  ',
          plannedAction: ' Replace   pipe ',
          problemStatement: ' Pipe leaks ',
          title: ' Repair leak ',
        },
        now,
      ),
    ).toMatchObject({ expectedOutcome: 'No leak', plannedAction: 'Replace pipe' });
  });

  it('enforces deadline and text bounds', () => {
    const base = {
      dueAt: now,
      expectedOutcome: 'Good',
      plannedAction: 'Work',
      problemStatement: 'Issue',
      title: 'Fix',
    };
    expect(() => validatePdcaAction(base, now)).toThrow(/future/u);
    expect(() =>
      validatePdcaAction({ ...base, dueAt: new Date('2027-08-01T10:00:00Z') }, now),
    ).toThrow(/366/u);
    expect(() =>
      validatePdcaAction({ ...base, dueAt: new Date('2026-08-01T10:00:00Z'), title: 'x' }, now),
    ).toThrow(/title/u);
  });

  it('allows only the explicit Plan-Do-Check-Act lifecycle', () => {
    expect(planPdcaTransition('PLAN', 'DO', 'Work started')).toEqual({
      reason: 'Work started',
      to: 'DO',
    });
    expect(planPdcaTransition('ACT', 'PLAN', 'Revise plan')).toMatchObject({ to: 'PLAN' });
    expect(() => planPdcaTransition('PLAN', 'COMPLETED', 'Skip')).toThrow(/PLAN.*COMPLETED/u);
    expect(() => planPdcaTransition('DO', 'CHECK', 'x')).toThrow(/reason/u);
    expect(isPdcaClosed('COMPLETED')).toBe(true);
    expect(isPdcaClosed('CANCELLED')).toBe(true);
    expect(isPdcaClosed('ACT')).toBe(false);
  });
});
