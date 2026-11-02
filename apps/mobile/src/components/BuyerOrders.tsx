import React, { memo, useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Order } from '../api';
import { buyerCopy } from '../lib/cutoff';
import { dateLong, dayLabel, money, plural, todayIso } from '../lib/format';
import { Q, useQuery } from '../lib/queries';
import { repeatOrder } from '../lib/repeat';
import type { OrderStatus } from '../shared';
import { useAuth } from '../store/auth';
import { colors, fonts, radius, space } from '../theme';
import { Icon } from './Icon';
import { BrandRefresh, StatusScrim, TAB_BAR_SPACE } from './layout';
import { FadeIn } from './motion';
import { FlowDots, OrderCardSkeleton, StatusChip } from './order';
import { ProductImage } from './product';
import { Chip, EmptyState, ErrorState, T, Touchable } from './ui';

const ACTIVE: OrderStatus[] = ['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED'];
type FilterKey = 'active' | 'done' | 'all';

/**
 * Заказы покупателя: группы по дню доставки, фильтры со счётчиками, живые статусы,
 * повтор заказа прямо из списка. Данные — из общего кэша (мгновенно при переключении вкладок).
 */
export function BuyerOrders() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const copy = buyerCopy(user);
  const canOrder = !!user?.permissions.canOrder;
  // Статусы меняются в течение дня — считаем данные свежими 15 секунд.
  const list = useQuery(Q.orders(user?.id ?? 'anon'), { staleTime: 15_000 });
  const all = list.data ?? [];
  const activeCount = all.filter((o) => ACTIVE.includes(o.status)).length;
  const [picked, setPicked] = useState<FilterKey | null>(null);
  const fkey: FilterKey = picked ?? (activeCount ? 'active' : 'all');

  const sections = useMemo(() => {
    const items =
      fkey === 'active'
        ? all.filter((o) => ACTIVE.includes(o.status))
        : fkey === 'done'
          ? all.filter((o) => !ACTIVE.includes(o.status))
          : all;
    const groups = new Map<string, Order[]>();
    for (const o of items) {
      const k = o.deliveryDate.slice(0, 10);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(o);
    }
    // Активные — от ближайшей доставки, история — от свежей к старой.
    const keys = [...groups.keys()].sort((a, b) => (fkey === 'active' ? a.localeCompare(b) : b.localeCompare(a)));
    return keys.map((k) => ({ key: k, title: k, data: groups.get(k)! }));
  }, [all, fkey]);

  const renderItem = useCallback(
    ({ item, index }: { item: Order; index: number }) => <BuyerOrderCard order={item} canOrder={canOrder} index={index} />,
    [canOrder],
  );

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.sm }}>
      <View>
        <T v="display">{copy.ordersTitle}</T>
        <T v="body" color={colors.textMuted}>
          {copy.ordersSubtitle}
        </T>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.lg }}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
      >
        <Chip label="Активные" icon="clock" count={activeCount || undefined} active={fkey === 'active'} onPress={() => setPicked('active')} />
        <Chip label="Завершённые" active={fkey === 'done'} onPress={() => setPicked('done')} />
        <Chip label="Все" count={all.length || undefined} active={fkey === 'all'} onPress={() => setPicked('all')} />
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={list.loading ? [] : sections}
        keyExtractor={(o) => o.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: insets.top + space.md,
          paddingBottom: TAB_BAR_SPACE + insets.bottom,
        }}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={9}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={<BrandRefresh refreshing={list.refreshing} onRefresh={list.refresh} offset={insets.top} />}
        renderSectionHeader={({ section }) => <DayHeader iso={section.title} count={section.data.length} />}
        renderItem={renderItem}
        ItemSeparatorComponent={Gap}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: space.md }}>
              <OrderCardSkeleton />
              <OrderCardSkeleton />
              <OrderCardSkeleton />
            </View>
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.refresh} />
          ) : fkey === 'active' && all.length ? (
            <EmptyState icon="check" tint={colors.greenSoft} title="Активных заказов нет" text="Все заказы доставлены. Соберём следующий?" action="В каталог" onAction={() => router.navigate('/catalog')} />
          ) : (
            <EmptyState
              icon="receipt"
              title="Заказов пока нет"
              text="Соберите первый заказ — мы испечём всё к нужному дню."
              action="В каталог"
              onAction={() => router.navigate('/catalog')}
            />
          )
        }
      />
      <StatusScrim />
    </View>
  );
}

const Gap = () => <View style={{ height: space.md }} />;

function DayHeader({ iso, count }: { iso: string; count: number }) {
  const today = todayIso();
  const past = iso < today;
  return (
    <View style={styles.dayHeader}>
      <View style={[styles.dayDot, past && { backgroundColor: colors.textSoft }]} />
      <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }}>
        {dayLabel(iso)}
      </T>
      <T v="small" color={colors.textSoft} style={{ flex: 1 }} numberOfLines={1}>
        {dayLabel(iso).match(/^\d/) ? dateLong(iso).split(', ')[1] : dateLong(iso)} · {count} {plural(count, 'заказ', 'заказа', 'заказов')}
      </T>
    </View>
  );
}

const BuyerOrderCard = memo(function BuyerOrderCard({ order, canOrder, index }: { order: Order; canOrder: boolean; index: number }) {
  const count = order.items.length;
  const done = order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'REJECTED';
  return (
    <FadeIn delay={Math.min(index, 5) * 40}>
      <Touchable onPress={() => router.push(`/order/${order.id}`)} style={styles.card} scaleTo={0.98} accessibilityLabel={`Заказ номер ${order.number}`}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">Заказ №{order.number}</T>
            <T v="small" color={colors.textMuted} numberOfLines={1}>
              {order.deliveryAddress || 'Адрес не указан'}
            </T>
          </View>
          <StatusChip status={order.status} small />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row' }}>
            {order.items.slice(0, 4).map((i, k) => (
              <ProductImage
                key={i.id}
                photoUrl={i.photoUrl}
                category={i.category}
                seed={i.productId}
                iconSize={20}
                rounded={14}
                style={[styles.thumb, { marginLeft: k ? -10 : 0, zIndex: 10 - k }]}
              />
            ))}
            {count > 4 && (
              <View style={[styles.thumb, styles.more, { marginLeft: -10 }]}>
                <T v="caption" style={{ fontFamily: fonts.bold }}>
                  +{count - 4}
                </T>
              </View>
            )}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <T v="h3">{money(order.total)}</T>
            <T v="small" color={colors.textSoft}>
              {count} {plural(count, 'позиция', 'позиции', 'позиций')}
            </T>
          </View>
        </View>
        {!done && <FlowDots status={order.status} />}
        {done && canOrder && order.status === 'DELIVERED' && (
          <Touchable onPress={() => repeatOrder(order)} style={styles.repeat} haptic hitSlop={4}>
            <Icon name="repeat" size={16} color={colors.mango} strokeWidth={2} />
            <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
              Повторить заказ
            </T>
          </Touchable>
        )}
      </Touchable>
    </FadeIn>
  );
});

const styles = StyleSheet.create({
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm },
  dayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mango },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md },
  thumb: { width: 44, height: 44, borderWidth: 2, borderColor: colors.white },
  more: { borderRadius: 14, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
});
