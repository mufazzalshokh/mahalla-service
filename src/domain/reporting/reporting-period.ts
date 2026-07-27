import { formatTashkentDate } from '../shared/tashkent-date-time.js';

export const reportPeriodKinds = ['WEEK', 'MONTH'] as const;
export type ReportPeriodKind = (typeof reportPeriodKinds)[number];

export interface ReportingPeriod {
  readonly asOf: Date;
  readonly endExclusive: Date;
  readonly kind: ReportPeriodKind;
  readonly label: string;
  readonly startInclusive: Date;
  readonly timezone: 'Asia/Tashkent';
}

const tashkentOffsetMilliseconds = 5 * 60 * 60 * 1_000;

export function createReportingPeriod(kind: ReportPeriodKind, asOf: Date): ReportingPeriod {
  if (Number.isNaN(asOf.valueOf())) throw new RangeError('asOf must be a valid date');
  const shifted = new Date(asOf.getTime() + tashkentOffsetMilliseconds);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const date = shifted.getUTCDate();
  const localStartDate = kind === 'MONTH' ? 1 : date - ((shifted.getUTCDay() + 6) % 7);
  const startInclusive = new Date(
    Date.UTC(year, month, localStartDate) - tashkentOffsetMilliseconds,
  );
  return Object.freeze({
    asOf: new Date(asOf),
    endExclusive: new Date(asOf),
    kind,
    label: `${kind === 'WEEK' ? 'Hafta' : 'Oy'}: ${formatTashkentDate(startInclusive)}–${formatTashkentDate(asOf)}`,
    startInclusive,
    timezone: 'Asia/Tashkent',
  });
}

export function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

export function rounded(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
