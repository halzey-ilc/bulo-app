/** Дата в формате ДД.ММ.ГГГГ. Принимает 'YYYY-MM-DD' или ISO. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m && value.length <= 10) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  // Даты доставки приходят как полночь UTC — берём дату из строки
  if (/T00:00:00(\.000)?Z$/.test(value) && m) return `${m[3]}.${m[2]}.${m[1]}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number) {
  return n < 10 ? '0' + n : String(n);
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n).replace(/ /g, ' ') + ' сом'
  );
}

export function fmtQty(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);
}

/** Локальная дата YYYY-MM-DD со сдвигом в днях. */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** Склонение: plural(5, 'заказ', 'заказа', 'заказов') */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function fmtPhone(p: string | null | undefined) {
  if (!p) return '—';
  const m = /^\+996(\d{3})(\d{3})(\d{3})$/.exec(p);
  return m ? `+996 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export function monthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}
