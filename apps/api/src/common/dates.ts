/** Часовой пояс пекарни: от него считаются время отсечки и «сегодня/завтра». */
export const BAKERY_TZ = process.env.TZ || 'Asia/Bishkek';

/** Дата (YYYY-MM-DD) и время (HH:MM) в часовом поясе пекарни. */
export function localNow(now = new Date(), tz = BAKERY_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Дата без времени для полей @db.Date. */
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
