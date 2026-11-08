// Mirrors @bulo/shared (packages/shared/src/index.ts). The mobile app is a standalone
// Expo project (not an npm workspace), so the constants it needs are copied here.
// Keep in sync when roles / statuses change.

export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'ACCOUNTANT'
  | 'WORKSHOP'
  | 'COURIER'
  | 'CASHIER'
  | 'PARTNER'
  | 'GUEST'
  | 'CLIENT';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Администратор',
  MANAGER: 'Менеджер',
  ACCOUNTANT: 'Бухгалтер',
  WORKSHOP: 'Цех',
  COURIER: 'Курьер',
  CASHIER: 'Кассир',
  PARTNER: 'Партнёр',
  GUEST: 'Гость',
  CLIENT: 'Клиент',
};

export const STAFF_ROLES: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER', 'CASHIER'];
/** Офисные роли: в приложении у них облегчённый вид, основная работа — в веб-панели. */
export const OFFICE_ROLES: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT'];

export type OrderStatus =
  | 'NEW'
  | 'APPROVED'
  | 'PAID'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Принят',
  APPROVED: 'Одобрен',
  PAID: 'Оплачен',
  IN_PRODUCTION: 'В производстве',
  READY: 'Готов к отгрузке',
  SHIPPED: 'Передан курьеру',
  DELIVERED: 'Доставлен',
  REJECTED: 'Отклонён',
  CANCELLED: 'Отменён',
};

export const ORDER_FLOW: OrderStatus[] = [
  'NEW',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'DELIVERED',
];

/** Оплата отмечается отдельно от статуса: заказ готовят, не дожидаясь её. */
export function canMarkPaid(order: { status: OrderStatus; paidAt?: string | null }, role?: Role | null): boolean {
  return (role === 'ADMIN' || role === 'ACCOUNTANT') && !order.paidAt && order.status !== 'REJECTED' && order.status !== 'CANCELLED';
}

/** Подписи кнопок для переходов статуса. */
export const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  APPROVED: 'Одобрить',
  PAID: 'Оплачен',
  IN_PRODUCTION: 'В производство',
  READY: 'Готово',
  SHIPPED: 'Забрал',
  DELIVERED: 'Доставлено',
  REJECTED: 'Отклонить',
  CANCELLED: 'Отменить',
};

/**
 * Копия таблицы переходов из API (apps/api/src/orders/order-rules.ts).
 * Список заказов не возвращает `actions`, поэтому для кнопок в списках
 * считаем их здесь; сервер всё равно проверяет каждое действие.
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
  PAID: { IN_PRODUCTION: ['ADMIN', 'MANAGER', 'WORKSHOP'], CANCELLED: ['ADMIN'] },
  IN_PRODUCTION: { READY: ['ADMIN', 'MANAGER', 'WORKSHOP'] },
  READY: { SHIPPED: ['ADMIN', 'MANAGER', 'COURIER'] },
  SHIPPED: { DELIVERED: ['ADMIN', 'MANAGER', 'COURIER'] },
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};

export function allowedTransitions(from: OrderStatus, role: Role): OrderStatus[] {
  return (Object.entries(TRANSITIONS[from] ?? {}) as [OrderStatus, Role[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
}

export type PartnerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  PENDING: 'Заявка на рассмотрении',
  APPROVED: 'Доступ открыт',
  REJECTED: 'Заявка отклонена',
  BLOCKED: 'Заблокирован',
};

export const BRAND_COLORS = {
  mango: '#E94F15',
  coffee: '#70171F',
  cambodia: '#26422B',
  iceCube: '#CDE4F8',
  softYellow: '#F9EDB3',
  oatMilk: '#F9F5E6',
  blueberry: '#004B97',
  lime: '#DDDD3F',
  strawberryMilk: '#F5B1D0',
} as const;
