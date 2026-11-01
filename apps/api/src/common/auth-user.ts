import type { Partner, PartnerStatus, Role, User } from '@prisma/client';

export type AuthUser = User & { partner: Partner | null };

const STAFF: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER'];

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
  if (user.role === 'PARTNER' || user.role === 'CLIENT') return partnerApproved(user.partner?.status);
  return false;
}

/** Оформлять заказы могут одобренные партнёры и гости, которым админ это разрешил (и привязал к контрагенту). */
export function canOrder(user?: AuthUser | null): boolean {
  if (!user || !user.partnerId) return false;
  if (user.role === 'PARTNER' || user.role === 'CLIENT') return partnerApproved(user.partner?.status);
  if (user.role === 'GUEST') return user.canOrder && partnerApproved(user.partner?.status);
  return false;
}

export function publicUser(user: AuthUser) {
  const { passwordHash, tokenVersion, ...rest } = user;
  return {
    ...rest,
    permissions: { canSeePrices: canSeePrices(user), canOrder: canOrder(user) },
  };
}
