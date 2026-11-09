const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function money(n: number | null | undefined): string {
  if (n == null) return '';
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = String(rounded).split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${spaced}${frac ? ',' + frac.padEnd(2, '0') : ''} сом`;
}

export function qtyText(qty: number, unit: string): string {
  const q = Math.round(qty * 1000) / 1000;
  return `${String(q).replace('.', ',')} ${unit}`;
}

/** 'YYYY-MM-DD' → Date в локальном времени (без сдвига часового пояса). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export function todayIso(): string {
  return isoDay(new Date());
}

export function dayLabel(iso: string): string {
  const d = parseDay(iso);
  const today = todayIso();
  if (iso === today) return 'Сегодня';
  if (iso === addDaysIso(today, 1)) return 'Завтра';
  if (iso === addDaysIso(today, 2)) return 'Послезавтра';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function dateLong(iso: string): string {
  const d = parseDay(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS_FULL[d.getDay()]}`;
}

export function dateChip(iso: string) {
  const d = parseDay(iso);
  return { weekday: WEEKDAYS[d.getDay()], day: d.getDate(), month: MONTHS_SHORT[d.getMonth()] };
}

export function dateTime(isoTs: string): string {
  const d = new Date(isoTs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Только 9 цифр после +996. */
export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('996') && d.length > 9) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 9);
}

export function formatPhoneLocal(digits: string): string {
  const d = digits;
  const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(' ');
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const d = phoneDigits(phone);
  return d.length === 9 ? `+996 ${formatPhoneLocal(d)}` : phone;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** «завтра, 3 ноября, вторник» или «5 ноября, четверг» — без повтора даты. */
export function deliveryPhrase(iso: string): string {
  const label = dayLabel(iso);
  return /^[0-9]/.test(label) ? dateLong(iso) : `${label.toLowerCase()}, ${dateLong(iso)}`;
}

/** Бишкек живёт по UTC+6 без перехода на летнее время: время брони и часы филиала считаем так, а не по часовому поясу телефона. */
const BISHKEK_OFFSET_MS = 6 * 60 * 60 * 1000;
export function bishkekTime(at: string | number | Date): string {
  const d = new Date(new Date(at).getTime() + BISHKEK_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
