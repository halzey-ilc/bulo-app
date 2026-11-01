import type { OrderStatus } from '@bulo/shared';

/** Подписи кнопок действий над заказом. */
export const ACTION_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новый',
  APPROVED: 'Одобрить',
  PAID: 'Отметить оплату',
  IN_PRODUCTION: 'В производство',
  READY: 'Готов к отгрузке',
  SHIPPED: 'Передан курьеру',
  DELIVERED: 'Доставлен',
  REJECTED: 'Отклонить',
  CANCELLED: 'Отменить заказ',
};

export const NEGATIVE: OrderStatus[] = ['REJECTED', 'CANCELLED'];
