const tashkentOffsetMilliseconds = 5 * 60 * 60 * 1_000;

function validDate(value: Date): Date {
  if (Number.isNaN(value.valueOf())) throw new RangeError('Date must be valid');
  return value;
}

function parts(value: Date): {
  readonly day: string;
  readonly hours: string;
  readonly minutes: string;
  readonly month: string;
  readonly year: string;
} {
  const shifted = new Date(validDate(value).getTime() + tashkentOffsetMilliseconds);
  return {
    day: String(shifted.getUTCDate()).padStart(2, '0'),
    hours: String(shifted.getUTCHours()).padStart(2, '0'),
    minutes: String(shifted.getUTCMinutes()).padStart(2, '0'),
    month: String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    year: String(shifted.getUTCFullYear()).padStart(4, '0'),
  };
}

export function formatTashkentDate(value: Date): string {
  const { day, month, year } = parts(value);
  return `${day}.${month}.${year}`;
}

export function formatTashkentDateTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const { day, hours, minutes, month, year } = parts(date);
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function parseTashkentDateTime(dateText: string, timeText: string): Date {
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(dateText.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/u.exec(timeText.trim());
  if (!dateMatch || !timeMatch) {
    throw new RangeError('Date and time must use DD.MM.YYYY HH:mm');
  }
  const [, rawDay, rawMonth, rawYear] = dateMatch;
  const [, rawHours, rawMinutes] = timeMatch;
  const day = Number(rawDay);
  const month = Number(rawMonth);
  const year = Number(rawYear);
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  if (hours > 23 || minutes > 59) {
    throw new RangeError('Date and time must use DD.MM.YYYY HH:mm');
  }
  const parsed = new Date(
    Date.UTC(year, month - 1, day, hours, minutes) - tashkentOffsetMilliseconds,
  );
  if (formatTashkentDateTime(parsed) !== `${dateText.trim()} ${timeText.trim()}`) {
    throw new RangeError('Date and time must use DD.MM.YYYY HH:mm');
  }
  return parsed;
}
