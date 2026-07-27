const formulaPrefix = /^[=+\-@]/u;

export function escapeCsvCell(value: string | number | null): string {
  if (value === null) return '';
  let normalized = String(value).replace(/[\r\n]+/gu, ' ');
  if (formulaPrefix.test(normalized.trimStart())) normalized = `'${normalized}`;
  return /[",]/u.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function csvRow(values: readonly (string | number | null)[]): string {
  return values.map(escapeCsvCell).join(',');
}
