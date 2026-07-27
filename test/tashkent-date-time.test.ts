import { describe, expect, it } from 'vitest';

import {
  formatTashkentDate,
  formatTashkentDateTime,
  parseTashkentDateTime,
} from '../src/domain/shared/tashkent-date-time.js';

describe('Tashkent date and time policy', () => {
  it('shows UTC instants in a simple Uzbek-market format', () => {
    const instant = new Date('2026-07-29T20:20:04.500Z');
    expect(formatTashkentDate(instant)).toBe('30.07.2026');
    expect(formatTashkentDateTime(instant)).toBe('30.07.2026 01:20');
  });

  it('parses local staff input into the correct UTC instant', () => {
    expect(parseTashkentDateTime('10.08.2026', '18:00')).toEqual(
      new Date('2026-08-10T13:00:00.000Z'),
    );
  });

  it('rejects impossible or ambiguous local values', () => {
    expect(() => parseTashkentDateTime('31.02.2026', '18:00')).toThrow(RangeError);
    expect(() => parseTashkentDateTime('10.08.2026', '25:00')).toThrow(RangeError);
    expect(() => formatTashkentDateTime('not-a-date')).toThrow(RangeError);
  });
});
