import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Order } from '../../api';
import { Persona, usePersona } from '../../store/auth';
import { space } from '../../theme';
import { ActionItem } from './kit';

/** Офисные действия в карточке заказа: правка состава, карточка партнёра. */
export function OfficeOrderTools({ order }: { order: Order }) {
  const persona = usePersona();
  const manage = persona === 'admin' || persona === 'manager';
  const editable = manage && (order.status === 'NEW' || order.status === 'APPROVED');
  if (!manage) return null;
  return (
    <View style={{ gap: space.sm }}>
      {editable && <ActionItem icon="edit" tone="ice" title="Изменить состав" subtitle="Количество кратно упаковке, партнёр получит уведомление" onPress={() => router.push(`/admin/order-edit/${order.id}`)} />}
      {!!order.partner?.id && <ActionItem icon="shop" title="Карточка партнёра" subtitle="Контакты, тип цен, история заказов" onPress={() => router.push(`/admin/partner/${order.partner.id}`)} />}
    </View>
  );
}

/** Ссылки офисного профиля: пароль, настройки, 1С, каталог, отчёты. */
export function OfficeProfileLinks() {
  const persona = usePersona() as Persona;
  const admin = persona === 'admin';
  return (
    <View style={{ gap: space.sm }}>
      <ActionItem icon="lock" title="Сменить пароль" subtitle="Для входа по логину" onPress={() => router.push('/admin/password')} />
      {(admin || persona === 'manager') && <ActionItem icon="settings" title="Настройки" subtitle={admin ? 'Приём заказов, контакты, 1С' : 'Только просмотр'} onPress={() => router.push('/admin/settings')} />}
      {(admin || persona === 'accountant') && <ActionItem icon="sync" tone="green" title="Обмен с 1С" subtitle="Статус, ошибки, выгрузка в Excel" onPress={() => router.push('/admin/onec')} />}
      {(admin || persona === 'manager') && <ActionItem icon="doc" tone="yellow" title="Сводная накладная" onPress={() => router.push('/admin/production')} />}
      {persona !== 'accountant' && <ActionItem icon="chart" tone="pink" title="Отчёты и Excel" onPress={() => router.push('/admin/reports')} />}
    </View>
  );
}
