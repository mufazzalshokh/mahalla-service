import { describe, expect, it } from 'vitest';

import {
  calculatePriority,
  validatePriorityOverride,
  type PriorityCriterionDefinition,
} from '../src/domain/priority/priority-calculator.js';

const criteria: readonly PriorityCriterionDefinition[] = [
  { code: 'SAFETY_RISK', maximumValue: 5, weight: 30 },
  { code: 'URGENCY', maximumValue: 5, weight: 25 },
  { code: 'RESIDENTS_AFFECTED', maximumValue: 5, weight: 20 },
  { code: 'SOCIAL_IMPACT', maximumValue: 5, weight: 15 },
  { code: 'SOURCE_CONFIDENCE', maximumValue: 5, weight: 10 },
];

describe('priority calculator', () => {
  it.each([
    [5, 'URGENT'],
    [3, 'IMPORTANT'],
    [2, 'PLANNED'],
    [1, 'MONITOR'],
  ] as const)('maps normalized input %s to %s', (input, band) => {
    const result = calculatePriority(criteria, {
      RESIDENTS_AFFECTED: input,
      SAFETY_RISK: input,
      SOCIAL_IMPACT: input,
      SOURCE_CONFIDENCE: input,
      URGENCY: input,
    });
    expect(result.band).toBe(band);
    expect(result.score).toBe(input * 20);
    expect(result.factors).toHaveLength(5);
    expect(result.explanation).toContain(`band=${band}`);
  });

  it('rejects malformed models and inputs', () => {
    expect(() => calculatePriority([], {} as never)).toThrowError(/no criteria/i);
    expect(() => calculatePriority(criteria.slice(1), {} as never)).toThrowError(/exactly once/i);
    expect(() => calculatePriority([...criteria, criteria[0]!], {} as never)).toThrowError(
      /exactly once/i,
    );
    expect(() =>
      calculatePriority([{ ...criteria[0]!, weight: 0 }, ...criteria.slice(1)], {
        RESIDENTS_AFFECTED: 1,
        SAFETY_RISK: 1,
        SOCIAL_IMPACT: 1,
        SOURCE_CONFIDENCE: 1,
        URGENCY: 1,
      }),
    ).toThrowError(/positive/i);
    expect(() =>
      calculatePriority(criteria, {
        RESIDENTS_AFFECTED: 1,
        SAFETY_RISK: 5.5,
        SOCIAL_IMPACT: 1,
        SOURCE_CONFIDENCE: 1,
        URGENCY: 1,
      }),
    ).toThrowError(/integer/i);
  });

  it('requires a bounded score and meaningful reason for overrides', () => {
    expect(() =>
      validatePriorityOverride(75, 'IMPORTANT', 'Verified safety escalation'),
    ).not.toThrow();
    expect(() =>
      validatePriorityOverride(101, 'URGENT', 'Verified safety escalation'),
    ).toThrowError(/0 to 100/i);
    expect(() => validatePriorityOverride(50, 'PLANNED', 'short')).toThrowError(/reason/i);
    expect(() =>
      validatePriorityOverride(50, 'INVALID' as never, 'Verified manual assessment'),
    ).toThrowError(/band is invalid/i);
  });
});
