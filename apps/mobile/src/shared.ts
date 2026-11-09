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
  GUEST: 'Просмотр',
  CLIENT: 'Гость',
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

export type Channel = 'PARTNER' | 'CAFE';

/** Партнёрский заказ: ждёт оплаты → подтверждён → в цеху → готов → у курьера → доставлен. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Ждёт оплаты',
  APPROVED: 'Одобрен',
  PAID: 'Подтверждён',
  IN_PRODUCTION: 'В производстве',
  READY: 'Готов к отгрузке',
  SHIPPED: 'Передан курьеру',
  DELIVERED: 'Доставлен',
  REJECTED: 'Отклонён',
  CANCELLED: 'Отменён',
};

/** Бронь гостя кофейни. */
export const CAFE_STATUS_LABELS: Record<OrderStatus, string> = {
  ...ORDER_STATUS_LABELS,
  NEW: 'Новая бронь',
  PAID: 'Подтверждена',
  IN_PRODUCTION: 'Готовим',
  READY: 'Готова — можно забирать',
  DELIVERED: 'Выдана',
  REJECTED: 'Отклонена',
  CANCELLED: 'Отменена',
};

export function statusLabel(status: OrderStatus, channel: Channel = 'PARTNER'): string {
  return (channel === 'CAFE' ? CAFE_STATUS_LABELS : ORDER_STATUS_LABELS)[status];
}

export const ORDER_FLOW: OrderStatus[] = ['NEW', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'];
export const CAFE_FLOW: OrderStatus[] = ['NEW', 'PAID', 'READY', 'DELIVERED'];

export function flowOf(channel: Channel = 'PARTNER'): OrderStatus[] {
  return channel === 'CAFE' ? CAFE_FLOW : ORDER_FLOW;
}

/** Деньги получены (наличные при выдаче/доставке) — после подтверждения заказа. */
export function canMarkPaid(order: { status: OrderStatus; paidAt?: string | null; channel?: Channel }, role?: Role | null): boolean {
  const staff = role === 'ADMIN' || role === 'MANAGER' || role === 'ACCOUNTANT' || (role === 'CASHIER' && order.channel === 'CAFE');
  return staff && !order.paidAt && !['NEW', 'REJECTED', 'CANCELLED'].includes(order.status);
}

/** Подтвердить заказ (оплата пришла / принят за наличные). */
export function canConfirm(order: { status: OrderStatus; confirmedAt?: string | null; channel?: Channel }, role?: Role | null): boolean {
  const staff = role === 'ADMIN' || role === 'MANAGER' || role === 'ACCOUNTANT' || (role === 'CASHIER' && order.channel === 'CAFE');
  return staff && order.status === 'NEW' && !order.confirmedAt;
}

/** Подписи кнопок для переходов статуса. */
export const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  APPROVED: 'Одобрить',
  PAID: 'Подтвердить',
  IN_PRODUCTION: 'В производство',
  READY: 'Готово',
  SHIPPED: 'Забрал',
  DELIVERED: 'Доставлено',
  REJECTED: 'Отклонить',
  CANCELLED: 'Отменить',
};

export const CAFE_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  ...ACTION_LABELS,
  READY: 'Готово к выдаче',
  DELIVERED: 'Выдать',
};

export function actionLabel(to: OrderStatus, channel: Channel = 'PARTNER') {
  return (channel === 'CAFE' ? CAFE_ACTION_LABELS : ACTION_LABELS)[to] ?? to;
}

/**
 * Копия таблиц переходов из API (apps/api/src/orders/order-rules.ts).
 * Список заказов не возвращает `actions`, поэтому для кнопок в списках
 * считаем их здесь; сервер всё равно проверяет каждое действие.
 * Подтверждение оплаты (NEW → PAID) — отдельное действие confirm, не переход.
 */
type Table = Record<OrderStatus, Partial<Record<OrderStatus, Role[]>>>;
const PARTNER_T: Table = {
  NEW: {
    REJECTED: ['ADMIN', 'MANAGER'],
    CANCELLED: ['ADMIN', 'MANAGER', 'PARTNER', 'GUEST', 'CLIENT'],
  },
  APPROVED: {
    IN_PRODUCTION: ['ADMIN', 'MANAGER', 'WORKSHOP'],
    REJECTED: ['ADMIN', 'MANAGER'],
    CANCELLED: ['ADMIN', 'MANAGER'],
  },
  PAID: { IN_PRODUCTION: ['ADMIN', 'MANAGER', 'WORKSHOP'], CANCELLED: ['ADMIN', 'MANAGER'] },
  IN_PRODUCTION: { READY: ['ADMIN', 'MANAGER', 'WORKSHOP'] },
  READY: { SHIPPED: ['ADMIN', 'MANAGER', 'COURIER'] },
  SHIPPED: { DELIVERED: ['ADMIN', 'MANAGER', 'COURIER'] },
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};
const CAFE_STAFF: Role[] = ['ADMIN', 'MANAGER', 'CASHIER'];
const CAFE_T: Table = {
  NEW: { REJECTED: CAFE_STAFF, CANCELLED: [...CAFE_STAFF, 'CLIENT', 'GUEST'] },
  APPROVED: {},
  PAID: { READY: CAFE_STAFF, DELIVERED: CAFE_STAFF, CANCELLED: CAFE_STAFF },
  IN_PRODUCTION: { READY: CAFE_STAFF },
  READY: { DELIVERED: CAFE_STAFF, CANCELLED: CAFE_STAFF },
  SHIPPED: {},
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};

export function allowedTransitions(from: OrderStatus, role: Role, channel: Channel = 'PARTNER'): OrderStatus[] {
  return (Object.entries((channel === 'CAFE' ? CAFE_T : PARTNER_T)[from] ?? {}) as [OrderStatus, Role[]][])
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
