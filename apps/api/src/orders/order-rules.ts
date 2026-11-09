import type { OrderChannel, OrderStatus, Role } from '@prisma/client';
import { addDays, localNow } from '../common/dates';

type Transitions = Record<OrderStatus, Partial<Record<OrderStatus, Role[]>>>;

/**
 * Партнёр (опт, доставка):
 * Ждёт оплаты (NEW) → подтверждён админом/менеджером после оплаты (PAID) → в цеху → готов → у курьера → доставлен.
 * Подтверждение делается отдельным действием «Подтвердить оплату» (confirm), а не сменой статуса.
 * Цех видит заказ только после подтверждения. APPROVED остался у старых заказов.
 */
const PARTNER: Transitions = {
  NEW: {
    REJECTED: ['ADMIN', 'MANAGER'],
    CANCELLED: ['ADMIN', 'MANAGER', 'PARTNER', 'GUEST', 'CLIENT'],
  },
  APPROVED: {
    IN_PRODUCTION: ['ADMIN', 'MANAGER', 'WORKSHOP'],
    REJECTED: ['ADMIN', 'MANAGER'],
    CANCELLED: ['ADMIN', 'MANAGER'],
  },
  PAID: {
    IN_PRODUCTION: ['ADMIN', 'MANAGER', 'WORKSHOP'],
    CANCELLED: ['ADMIN', 'MANAGER'],
  },
  IN_PRODUCTION: {
    READY: ['ADMIN', 'MANAGER', 'WORKSHOP'],
  },
  READY: {
    SHIPPED: ['ADMIN', 'MANAGER', 'COURIER'],
  },
  SHIPPED: {
    DELIVERED: ['ADMIN', 'MANAGER', 'COURIER'],
  },
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};

/**
 * Гость кофейни (бронь, самовывоз):
 * Новая бронь (NEW) → подтверждена (PAID) → готова к выдаче (READY) → выдана (DELIVERED).
 * Бронь ведут админ, менеджер и кассир филиала.
 */
const CAFE_STAFF: Role[] = ['ADMIN', 'MANAGER', 'CASHIER'];
const CAFE: Transitions = {
  NEW: {
    REJECTED: CAFE_STAFF,
    CANCELLED: [...CAFE_STAFF, 'CLIENT', 'GUEST'],
  },
  APPROVED: {},
  PAID: {
    READY: CAFE_STAFF,
    DELIVERED: CAFE_STAFF,
    CANCELLED: CAFE_STAFF,
  },
  IN_PRODUCTION: {
    READY: CAFE_STAFF,
  },
  READY: {
    DELIVERED: CAFE_STAFF,
    CANCELLED: CAFE_STAFF,
  },
  SHIPPED: {},
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};

const TABLES: Record<OrderChannel, Transitions> = { PARTNER, CAFE };

export function canTransition(from: OrderStatus, to: OrderStatus, role: Role, channel: OrderChannel = 'PARTNER'): boolean {
  return TABLES[channel][from]?.[to]?.includes(role) ?? false;
}

export function allowedTransitions(from: OrderStatus, role: Role, channel: OrderChannel = 'PARTNER'): OrderStatus[] {
  return (Object.entries(TABLES[channel][from] ?? {}) as [OrderStatus, Role[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
}

/** Кто подтверждает оплату и заказ. Бронь кофейни подтверждает ещё и кассир. */
export function canConfirm(role: Role, channel: OrderChannel): boolean {
  if (role === 'ADMIN' || role === 'MANAGER' || role === 'ACCOUNTANT') return true;
  return channel === 'CAFE' && role === 'CASHIER';
}

/** Пока цех не начал готовить, менеджер может править позиции. */
export const EDITABLE_STATUSES: OrderStatus[] = ['NEW', 'APPROVED', 'PAID'];

/** Статусы, которые цех берёт в сводную накладную: только подтверждённые (оплаченные) заказы партнёров. */
export const AWAITING_PRODUCTION: OrderStatus[] = ['APPROVED', 'PAID'];

/** Подтверждённый заказ: уже ушёл в 1С и считается выручкой. */
export const CONFIRMED_STATUSES: OrderStatus[] = ['APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'];

export const PAYMENT_METHODS = ['QR', 'BANK', 'CASH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Гость кофейни платит по QR или наличными на кассе; партнёр — ещё и на расчётный счёт. */
export function paymentAllowed(method: string, channel: OrderChannel): method is PaymentMethod {
  if (channel === 'CAFE') return method === 'QR' || method === 'CASH';
  return (PAYMENT_METHODS as readonly string[]).includes(method);
}

/**
 * Проверяет дату доставки: не раньше завтрашнего дня, а на завтра — только до времени отсечки.
 * Возвращает текст ошибки или null.
 */
export function checkDeliveryDate(deliveryDate: string, cutoffTime: string, now = new Date()): string | null {
  const local = localNow(now);
  const tomorrow = addDays(local.date, 1);
  if (deliveryDate < tomorrow) return 'Заказ принимается минимум на завтра';
  if (deliveryDate === tomorrow && local.time >= cutoffTime) {
    return `Приём заказов на завтра закрыт в ${cutoffTime}. Выберите дату позже`;
  }
  if (deliveryDate > addDays(local.date, 60)) return 'Дата доставки слишком далеко — не больше 60 дней';
  return null;
}

/** Первая доступная дата доставки с учётом отсечки. */
export function earliestDeliveryDate(cutoffTime: string, now = new Date()): string {
  const local = localNow(now);
  return addDays(local.date, local.time >= cutoffTime ? 2 : 1);
}

/** Количество должно быть положительным и кратным (с допуском на дробные единицы). */
export function checkMultiplicity(qty: number, multiplicity: number): boolean {
  if (!(qty > 0)) return false;
  if (!(multiplicity > 0)) return true;
  const ratio = qty / multiplicity;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
