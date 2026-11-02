import React from 'react';
import { OfficeOrders } from '../../src/components/admin/OfficeOrders';

/** Заказы как отдельный экран — для бухгалтера (у него нет вкладки «Заказы») и переходов с пульта. */
export default function AdminOrdersScreen() {
  return <OfficeOrders stack />;
}
