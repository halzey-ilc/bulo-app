import { addDays, BAKERY_TZ, localNow } from '../common/dates';

/** Время "HH:MM" в дате YYYY-MM-DD по часовому поясу пекарни → момент времени. */
export function localToDate(date: string, time: string, tz = BAKERY_TZ): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = localNow(guess, tz);
  const shownMs = Date.parse(`${shown.date}T${shown.time}:00Z`);
  return new Date(guess.getTime() - (shownMs - guess.getTime()));
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Сколько минут нужно, чтобы собрать бронь. */
export const PREP_MINUTES = 15;
const STEP = 15;

/**
 * Слоты самовывоза: сегодня с ближайшего (через 15 минут, кратно 15), до закрытия;
 * если сегодня уже поздно — завтра с открытия.
 */
export function pickupSlots(opensAt: string, closesAt: string, now = new Date()) {
  const local = localNow(now);
  const open = toMin(opensAt);
  const close = toMin(closesAt);
  const from = Math.max(open, Math.ceil((toMin(local.time) + PREP_MINUTES) / STEP) * STEP);
  const day = (date: string, start: number) => {
    const out: { at: string; time: string; date: string }[] = [];
    for (let m = start; m <= close - STEP; m += STEP) {
      const time = toTime(m);
      out.push({ at: localToDate(date, time).toISOString(), time, date });
    }
    return out;
  };
  const today = day(local.date, from);
  const tomorrow = day(addDays(local.date, 1), open);
  return { today, tomorrow, closedToday: today.length === 0 };
}

/** Проверяет выбранное время брони. Возвращает текст ошибки или null. */
export function checkPickup(at: Date, opensAt: string, closesAt: string, now = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return 'Выберите время, когда заберёте заказ';
  if (at.getTime() < now.getTime() + (PREP_MINUTES - 1) * 60_000) {
    return `Нам нужно хотя бы ${PREP_MINUTES} минут, чтобы всё собрать — выберите время позже`;
  }
  const local = localNow(at);
  const today = localNow(now).date;
  if (local.date !== today && local.date !== addDays(today, 1)) return 'Бронь — только на сегодня или завтра';
  const m = toMin(local.time);
  if (m < toMin(opensAt) || m > toMin(closesAt) - STEP) return `Филиал работает с ${opensAt} до ${closesAt}`;
  return null;
}
