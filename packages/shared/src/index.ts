// Общие для API, веб-панели и мобильного приложения справочники: роли, статусы и их подписи.

export const ROLES = [
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'WORKSHOP',
  'COURIER',
  'CASHIER',
  'PARTNER',
  'GUEST',
  'CLIENT',
] as const;
export type Role = (typeof ROLES)[number];

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

/** Роли сотрудников, которых админ создаёт приглашением. */
export const STAFF_ROLES: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER', 'CASHIER'];

export const ORDER_STATUSES = [
  'NEW',
  'APPROVED',
  'PAID',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

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

/** Основной путь заказа — для шкалы статусов в приложении. */
export const ORDER_FLOW: OrderStatus[] = [
  'NEW',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'DELIVERED',
];

export const PARTNER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'BLOCKED'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  PENDING: 'Заявка на рассмотрении',
  APPROVED: 'Доступ открыт',
  REJECTED: 'Заявка отклонена',
  BLOCKED: 'Заблокирован',
};

export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Фирменные цвета BULO из брендбука. */
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
