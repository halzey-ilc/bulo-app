import React from 'react';
import { AccountantDashboard, OfficeDashboard } from '../../src/components/admin/Dashboard';
import { usePersona } from '../../src/store/auth';

/** Пульт: у бухгалтера — про деньги, у администратора и менеджера — про заказы и людей. */
export default function DashboardTab() {
  const persona = usePersona();
  return persona === 'accountant' ? <AccountantDashboard /> : <OfficeDashboard />;
}
