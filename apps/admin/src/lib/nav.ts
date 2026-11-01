import {
  BookOpen,
  ChartColumn,
  ClipboardList,
  Factory,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  RefreshCcw,
  ScrollText,
  Settings,
  Store,
  Users,
} from 'lucide-react';
import type { Role } from '@bulo/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Сводка', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] },
  { href: '/orders', label: 'Заказы', icon: ClipboardList, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER'] },
  { href: '/partners', label: 'Партнёры', icon: Store, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] },
  { href: '/catalog', label: 'Каталог', icon: BookOpen, roles: ['ADMIN', 'MANAGER'] },
  { href: '/production', label: 'Производство', icon: Factory, roles: ['ADMIN', 'MANAGER', 'WORKSHOP', 'ACCOUNTANT'] },
  { href: '/invoices', label: 'Накладные', icon: FileText, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'COURIER'] },
  { href: '/reports', label: 'Отчёты', icon: ChartColumn, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] },
  { href: '/onec', label: '1С', icon: RefreshCcw, roles: ['ADMIN', 'ACCOUNTANT'] },
  { href: '/users', label: 'Пользователи и роли', icon: Users, roles: ['ADMIN'] },
  { href: '/settings', label: 'Настройки', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
  { href: '/audit', label: 'Журнал', icon: ScrollText, roles: ['ADMIN'] },
];

export const STAFF_PANEL_ROLES: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER'];

/** Стартовая страница роли */
export function homeFor(role: Role): string {
  if (role === 'WORKSHOP') return '/production';
  if (role === 'COURIER') return '/invoices';
  return '/';
}

export function canAccess(role: Role, pathname: string): boolean {
  const item = [...NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => (n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(n.href + '/')));
  if (!item) return true;
  return item.roles.includes(role);
}
