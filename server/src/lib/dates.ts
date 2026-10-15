const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses YYYY-MM-DD as midnight UTC, the same representation Prisma returns for @db.Date columns. */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
