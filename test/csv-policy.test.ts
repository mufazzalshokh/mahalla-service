import { describe, expect, it } from 'vitest';

import { csvRow, escapeCsvCell } from '../src/domain/reporting/csv-policy.js';

describe('CSV export policy', () => {
  it('neutralizes spreadsheet formulas and normalizes line breaks', () => {
    expect(escapeCsvCell(' =SUM(A1:A2)')).toBe("' =SUM(A1:A2)");
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('-1+2')).toBe("'-1+2");
    expect(escapeCsvCell('@link')).toBe("'@link");
    expect(escapeCsvCell('first\r\nsecond')).toBe('first second');
  });

  it('quotes delimiters, doubles quotes, and renders null as empty', () => {
    expect(csvRow(['a,b', 'say "yes"', 4, null])).toBe('"a,b","say ""yes""",4,');
  });
});
