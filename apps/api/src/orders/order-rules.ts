import type { OrderStatus, Role } from '@prisma/client';
import { addDays, localNow } from '../common/dates';

/**
 * Переходы статусов заказа и кто может их делать.
 * Принят → В производстве → Готов → Передан курьеру → Доставлен.
 * Одобрения менеджера нет: заказ сразу виден цеху, менеджер только следит и может поправить
 * или отклонить его до начала производства. Оплата отмечается отдельно (paidAt) и статус не меняет.
 * IN_PRODUCTION ставится при формировании сводной накладной (или вручную цехом).
 * APPROVED и PAID остались только у старых заказов — их можно довести до конца.
 */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, Role[]>>> = {
  NEW: {
    IN_PRODUCTION: ['ADMIN', 'MANAGER', 'WORKSHOP'],
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
    CANCELLED: ['ADMIN'],
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

export function canTransition(from: OrderStatus, to: OrderStatus, role: Role): boolean {
  return TRANSITIONS[from]?.[to]?.includes(role) ?? false;
}

export function allowedTransitions(from: OrderStatus, role: Role): OrderStatus[] {
  return (Object.entries(TRANSITIONS[from] ?? {}) as [OrderStatus, Role[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
}

/** Пока цех не начал готовить, менеджер может править позиции. */
export const EDITABLE_STATUSES: OrderStatus[] = ['NEW', 'APPROVED', 'PAID'];

/** Статусы, которые цех берёт в сводную накладную (новые и старые заказы до производства). */
export const AWAITING_PRODUCTION: OrderStatus[] = ['NEW', 'APPROVED', 'PAID'];

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
