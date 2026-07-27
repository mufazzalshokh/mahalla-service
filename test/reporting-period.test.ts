import { describe, expect, it } from 'vitest';

import {
  createReportingPeriod,
  percentage,
  rounded,
} from '../src/domain/reporting/reporting-period.js';

describe('reporting period policy', () => {
  it('starts a Tashkent week on local Monday and keeps the report current-to-date', () => {
    const asOf = new Date('2026-07-27T04:30:00Z');
    const period = createReportingPeriod('WEEK', asOf);
    expect(period.startInclusive.toISOString()).toBe('2026-07-26T19:00:00.000Z');
    expect(period.endExclusive).toEqual(asOf);
    expect(period.label).toBe('WEEK 2026-07-27 through 2026-07-27');
    expect(period.timezone).toBe('Asia/Tashkent');
  });

  it('starts a month at local midnight even when that is the prior UTC date', () => {
    const period = createReportingPeriod('MONTH', new Date('2026-08-15T12:00:00Z'));
    expect(period.startInclusive.toISOString()).toBe('2026-07-31T19:00:00.000Z');
    expect(period.label).toBe('MONTH 2026-08-01 through 2026-08-15');
  });

  it('rejects invalid dates and handles safe KPI arithmetic', () => {
    expect(() => createReportingPeriod('WEEK', new Date('invalid'))).toThrow(RangeError);
    expect(percentage(7, 8)).toBe(87.5);
    expect(percentage(0, 0)).toBeNull();
    expect(rounded(1.236, 2)).toBe(1.24);
    expect(rounded(Number.POSITIVE_INFINITY)).toBeNull();
    expect(rounded(null)).toBeNull();
  });
});
