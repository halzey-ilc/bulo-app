import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Order, Orders } from '../../src/api';
import { Icon } from '../../src/components/Icon';
import { OfficeOrders } from '../../src/components/admin/OfficeOrders';
import { BuyerOrders } from '../../src/components/BuyerOrders';
import { TAB_BAR_SPACE } from '../../src/components/layout';
import { OrderCard, OrderCardSkeleton } from '../../src/components/order';
import { Button, Chip, EmptyState, ErrorState, T } from '../../src/components/ui';
import { actionKind, runOrderAction } from '../../src/lib/orderActions';
import { useLoad } from '../../src/lib/useLoad';
import { isOffice, useAuth, usePersona } from '../../src/store/auth';
import { ACTION_LABELS, allowedTransitions, OrderStatus, Role } from '../../src/shared';
import { colors, fonts, radius, space } from '../../src/theme';

interface Filter {
  key: string;
  label: string;
  statuses?: OrderStatus[];
  local?: (o: Order) => boolean;
}

const ACTIVE: OrderStatus[] = ['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED'];

const BUYER_FILTERS: Filter[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные', local: (o) => ACTIVE.includes(o.status) },
  { key: 'done', label: 'Завершённые', local: (o) => !ACTIVE.includes(o.status) },
];

const OFFICE_FILTERS: Filter[] = [
  { key: 'new', label: 'Новые', statuses: ['NEW', 'APPROVED', 'PAID'] },
  { key: 'work', label: 'В работе', statuses: ['IN_PRODUCTION', 'READY', 'SHIPPED'] },
  { key: 'all', label: 'Все' },
];

const WORKSHOP_FILTERS: Filter[] = [
  { key: 'new', label: 'Новые', statuses: ['NEW', 'APPROVED', 'PAID'] },
  { key: 'prod', label: 'В производстве', statuses: ['IN_PRODUCTION'] },
  { key: 'ready', label: 'Готовы', statuses: ['READY'] },
];

function defaultFilter(role: Role | undefined, persona: string) {
  if (persona === 'buyer') return 'all';
  if (persona === 'workshop') return 'new';
  if (role === 'ACCOUNTANT') return 'new';
  return 'new';
}

// Офис (админ/менеджер) — отдельный экран разбора заказов.
export default function OrdersTab() {
  const persona = usePersona();
  return isOffice(persona) || persona === 'cashier' ? <OfficeOrders /> : persona === 'buyer' ? <BuyerOrders /> : <OrdersScreen />;
}

function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const persona = usePersona();
  const role = useAuth((s) => s.user?.role);
  const filters = persona === 'buyer' ? BUYER_FILTERS : persona === 'workshop' ? WORKSHOP_FILTERS : OFFICE_FILTERS;
  const [fkey, setFkey] = useState(() => defaultFilter(role, persona));
  const filter = filters.find((f) => f.key === fkey) ?? filters[0];

  const list = useLoad(() => Orders.list(filter.statuses), [filter.key, role]);
  const data = useMemo(() => (list.data ?? []).filter(filter.local ?? (() => true)), [list.data, filter]);
  const staff = persona !== 'buyer';

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.sm }}>
      <View>
        <T v="display">{persona === 'buyer' ? 'Мои заказы' : 'Заказы'}</T>
        <T v="body" color={colors.textMuted}>
          {persona === 'buyer' ? 'История и статусы доставок' : persona === 'workshop' ? 'Что сейчас в работе у цеха' : 'Быстрые действия с телефона'}
        </T>
      </View>
      {isOffice(persona) && (
        <View style={styles.hint}>
          <Icon name="info" size={18} color={colors.blueberry} />
          <T v="small" color={colors.blueberry} style={{ flex: 1, fontFamily: fonts.semibold }}>
            Здесь — контроль заказов, отклонение и отметка оплаты. Редактирование, отчёты и справочники — в веб-панели BULO.
          </T>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {filters.map((f) => (
          <Chip key={f.key} label={f.label} active={f.key === fkey} onPress={() => setFkey(f.key)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={list.loading ? [] : data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: insets.top + space.md,
          paddingBottom: TAB_BAR_SPACE + insets.bottom,
          gap: space.md,
        }}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.mango} colors={[colors.mango]} />}
        renderItem={({ item }) => {
          // В списке — главные действия; «Отменить» доступна в карточке заказа.
          const actions = staff && role ? allowedTransitions(item.status, role).filter((a) => a !== 'CANCELLED') : [];
          return (
            <OrderCard
              order={item}
              showPartner={staff}
              footer={
                actions.length ? (
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {actions.map((a) => (
                      <Button
                        key={a}
                        small
                        title={ACTION_LABELS[a] ?? a}
                        kind={actionKind(a)}
                        style={{ flex: 1 }}
                        onPress={() => runOrderAction(item, a, () => list.reload())}
                      />
                    ))}
                  </View>
                ) : undefined
              }
            />
          );
        }}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: space.md }}>
              <OrderCardSkeleton />
              <OrderCardSkeleton />
              <OrderCardSkeleton />
            </View>
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.refresh} />
          ) : persona === 'buyer' ? (
            <EmptyState
              icon="receipt"
              title="Заказов пока нет"
              text="Соберите первый заказ — мы испечём всё к нужному дню."
              action="В каталог"
              onAction={() => router.navigate('/catalog')}
            />
          ) : (
            <EmptyState icon="check" tint={colors.greenSoft} title="Всё разобрано" text="В этом разделе сейчас нет заказов." />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    backgroundColor: colors.iceCube,
    padding: space.md,
    borderRadius: radius.lg,
  },
});
