import { PartnerStatus, Role, ROLE_LABELS } from '../../shared';
import { colors } from '../../theme';
import type { AIconName } from './icons';

export interface RoleMeta {
  role: Role;
  label: string;
  icon: AIconName;
  bg: string;
  fg: string;
  /** Одна строка — что умеет роль */
  about: string;
  staff: boolean;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  ADMIN: { role: 'ADMIN', label: ROLE_LABELS.ADMIN, icon: 'shield', bg: colors.cambodia, fg: colors.oatMilk, about: 'Всё: люди, роли, каталог, настройки, 1С', staff: true },
  MANAGER: { role: 'MANAGER', label: ROLE_LABELS.MANAGER, icon: 'handshake', bg: colors.primarySoft, fg: colors.mango, about: 'Заказы, партнёры и каталог', staff: true },
  ACCOUNTANT: { role: 'ACCOUNTANT', label: ROLE_LABELS.ACCOUNTANT, icon: 'wallet', bg: '#E6EBC4', fg: colors.cambodia, about: 'Оплаты, отчёты, выгрузка в 1С', staff: true },
  WORKSHOP: { role: 'WORKSHOP', label: ROLE_LABELS.WORKSHOP, icon: 'chef', bg: colors.softYellow, fg: '#8A5A00', about: 'Сводная накладная и готовность', staff: true },
  COURIER: { role: 'COURIER', label: ROLE_LABELS.COURIER, icon: 'truck', bg: '#FBD9E8', fg: colors.coffee, about: 'Маршрут и отметки о доставке', staff: true },
  PARTNER: { role: 'PARTNER', label: ROLE_LABELS.PARTNER, icon: 'shop', bg: colors.iceCube, fg: colors.blueberry, about: 'Кофейня или магазин: оптовые заказы', staff: false },
  GUEST: { role: 'GUEST', label: ROLE_LABELS.GUEST, icon: 'eye', bg: '#ECE8DC', fg: colors.textMuted, about: 'Смотрит цены, заказы — по разрешению', staff: false },
  CLIENT: { role: 'CLIENT', label: ROLE_LABELS.CLIENT, icon: 'heart', bg: '#FDE0D2', fg: colors.mango, about: 'Покупатель по розничным ценам', staff: false },
};

export const STAFF_ORDER: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER'];
export const CLIENT_ORDER: Role[] = ['PARTNER', 'CLIENT', 'GUEST'];

export const PARTNER_STATUS_STYLE: Record<PartnerStatus, { bg: string; fg: string; label: string; icon: AIconName }> = {
  PENDING: { bg: colors.softYellow, fg: '#8A5A00', label: 'Заявка', icon: 'hourglass' },
  APPROVED: { bg: '#DDEFD9', fg: colors.success, label: 'Работает', icon: 'check' },
  REJECTED: { bg: colors.dangerSoft, fg: colors.danger, label: 'Отклонён', icon: 'close' },
  BLOCKED: { bg: '#ECE8DC', fg: colors.coffee, label: 'Заблокирован', icon: 'lock' },
};
