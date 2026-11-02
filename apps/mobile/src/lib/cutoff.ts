import { useEffect, useMemo, useState } from 'react';
import type { OrderRules, User } from '../api';
import { addDaysIso, plural } from './format';

/** Бишкек: UTC+6 круглый год. Считаем время приёма в нём, а не в часовом поясе телефона. */
const OFFSET_MIN = 6 * 60;

export function bishkekNow(now = Date.now()) {
  const d = new Date(now + OFFSET_MIN * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function durationText(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} ${plural(m, 'минута', 'минуты', 'минут')}`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export interface CutoffState {
  /** Приём на завтра ещё открыт. */
  open: boolean;
  /** Минут до закрытия приёма на завтра. */
  leftMin: number;
  /** Срочно: меньше часа. */
  urgent: boolean;
  /** Первая доступная дата доставки. */
  earliest: string;
  /** Ближайшие даты доставки для выбора. */
  days: string[];
  cutoffTime: string;
  /** Короткая строка для баннеров. */
  text: string;
}

/** Живой отсчёт до закрытия приёма заказов (обновляется раз в 20 секунд). */
export function useCutoff(rules: OrderRules | undefined, daysCount = 10): CutoffState {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    const cutoffTime = rules?.cutoffTime ?? '16:00';
    const b = bishkekNow(now);
    const left = toMinutes(cutoffTime) - b.minutes;
    const open = left > 0;
    const computed = addDaysIso(b.date, open ? 1 : 2);
    const earliest = rules?.earliestDeliveryDate && rules.earliestDeliveryDate > computed ? rules.earliestDeliveryDate : computed;
    const days = Array.from({ length: daysCount }, (_, i) => addDaysIso(earliest, i));
    const text = open
      ? `До закрытия приёма на завтра осталось ${durationText(left)}`
      : `Приём на завтра закрыт в ${cutoffTime} — ближайшая доставка послезавтра`;
    return { open, leftMin: Math.max(0, left), urgent: open && left <= 60, earliest, days, cutoffTime, text };
  }, [rules?.cutoffTime, rules?.earliestDeliveryDate, now, daysCount]);
}

/** Тексты для разных покупателей: лавка-партнёр (опт) и частный клиент (розница). */
export function buyerCopy(user: User | null | undefined) {
  const client = user?.role === 'CLIENT';
  const guest = user?.role === 'GUEST';
  return {
    client,
    ordersTitle: client || guest ? 'Мои заказы' : 'Заказы лавки',
    ordersSubtitle: client ? 'История, статусы и повтор в одно касание' : 'Поставки для вашей точки: статусы и история',
    priceNote: client ? 'Розничные цены' : guest ? 'Цены для гостей' : 'Оптовые цены партнёра',
    fallbackName: client ? 'друг' : 'партнёр',
  };
}
