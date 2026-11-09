import type { Partner, PartnerStatus, Role, User } from '@prisma/client';

export type AuthUser = User & { partner: Partner | null };

const STAFF: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER', 'CASHIER'];

export function isStaff(user?: Pick<User, 'role'> | null): boolean {
  return !!user && STAFF.includes(user.role);
}

function partnerApproved(status?: PartnerStatus) {
  return status === 'APPROVED';
}

/** Цены видят сотрудники, одобренные партнёры и гости. Анонимам и ждущим одобрения — нет. */
export function canSeePrices(user?: AuthUser | null): boolean {
  if (!user) return false;
  if (isStaff(user) || user.role === 'GUEST') return true;
  if (user.role === 'CLIENT' && !user.partnerId) return true;
  if (user.role === 'PARTNER' || user.role === 'CLIENT') return partnerApproved(user.partner?.status);
  return false;
}

/**
 * Оформлять заказы могут: гости кофейни (CLIENT без партнёра — бронь в филиале),
 * одобренные партнёры и гости, которым админ это разрешил и привязал к контрагенту.
 */
export function canOrder(user?: AuthUser | null): boolean {
  if (!user || user.deletedAt) return false;
  if (user.role === 'CLIENT' && !user.partnerId) return true;
  if (!user.partnerId) return false;
  if (user.role === 'PARTNER' || user.role === 'CLIENT') return partnerApproved(user.partner?.status);
  if (user.role === 'GUEST') return user.canOrder && partnerApproved(user.partner?.status);
  return false;
}

/** Канал покупателя: гость кофейни или партнёр. */
export function buyerChannel(user?: AuthUser | null): 'CAFE' | 'PARTNER' | null {
  if (!user || isStaff(user)) return null;
  return user.partnerId ? 'PARTNER' : 'CAFE';
}

export function publicUser(user: AuthUser) {
  const { passwordHash, tokenVersion, ...rest } = user;
  return {
    ...rest,
    hasPassword: !!passwordHash,
    channel: buyerChannel(user),
    permissions: { canSeePrices: canSeePrices(user), canOrder: canOrder(user) },
  };
}
