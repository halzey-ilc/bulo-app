import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage, Order, Orders } from '../../src/api';
import { callPhone, openMaps } from '../../src/components/contacts';
import { Icon } from '../../src/components/Icon';
import { BrandRefresh, TAB_BAR_SPACE } from '../../src/components/layout';
import { ProgressBar } from '../../src/components/motion';
import { OrderCardSkeleton, StatusChip } from '../../src/components/order';
import { Button, Card, Chip, EmptyState, ErrorState, hapticSuccess, T, Touchable } from '../../src/components/ui';
import { dayLabel, formatPhone, plural } from '../../src/lib/format';
import { invalidateOrders } from '../../src/lib/queries';
import { useLoad } from '../../src/lib/useLoad';
import { toast } from '../../src/store/ui';
import { useAuth } from '../../src/store/auth';
import { colors, fonts, radius, space } from '../../src/theme';

type Tab = 'READY' | 'SHIPPED' | 'ALL';

export default function Deliveries() {
  const insets = useSafeAreaInsets();
  const name = useAuth((s) => s.user?.name);
  const [tab, setTab] = useState<Tab>('ALL');
  // Новые готовые заказы подтягиваются сами, пока экран открыт.
  const list = useLoad(() => Orders.list(['READY', 'SHIPPED']), [], { poll: 60_000 });
  const all = list.data ?? [];
  const data = useMemo(() => (tab === 'ALL' ? all : all.filter((o) => o.status === tab)), [all, tab]);
  const ready = all.filter((o) => o.status === 'READY').length;
  const shipped = all.filter((o) => o.status === 'SHIPPED').length;

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.sm }}>
      <View>
        <T v="body" color={colors.textMuted}>
          Хорошей дороги{name ? `, ${name}` : ''}!
        </T>
        <T v="display">Доставки</T>
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={[styles.stat, { backgroundColor: colors.mango }]}>
          <T v="display" color={colors.white}>
            {ready}
          </T>
          <T v="small" color="rgba(255,255,255,0.9)" style={{ fontFamily: fonts.semibold }}>
            ждут отгрузки
          </T>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.cambodia }]}>
          <T v="display" color={colors.oatMilk}>
            {shipped}
          </T>
          <T v="small" color="rgba(249,245,230,0.85)" style={{ fontFamily: fonts.semibold }}>
            в пути
          </T>
        </View>
      </View>
      <View style={styles.note}>
        <Icon name="info" size={18} color={colors.blueberry} />
        <T v="small" color={colors.blueberry} style={{ flex: 1, fontFamily: fonts.semibold }}>
          Процесс доставки дорабатывается: скоро появятся маршруты и накладные. Пока отмечайте «Забрал» и «Доставлено».
        </T>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <Chip label="Все" active={tab === 'ALL'} onPress={() => setTab('ALL')} count={all.length} />
        <Chip label="К отгрузке" icon="box" active={tab === 'READY'} onPress={() => setTab('READY')} count={ready} />
        <Chip label="В пути" icon="truck" active={tab === 'SHIPPED'} onPress={() => setTab('SHIPPED')} count={shipped} />
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={list.loading ? [] : data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: space.md }}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        refreshControl={<BrandRefresh refreshing={list.refreshing} onRefresh={list.refresh} offset={insets.top} />}
        renderItem={({ item }) => <DeliveryCard order={item} onChanged={list.reload} />}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: space.md }}>
              <OrderCardSkeleton />
              <OrderCardSkeleton />
            </View>
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.refresh} />
          ) : (
            <EmptyState icon="truck" tint={colors.iceCube} title="Пока нечего везти" text="Как только цех соберёт заказы, они появятся здесь." />
          )
        }
      />
    </View>
  );
}

function DeliveryCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const count = order.items.length;
  const phone = order.partner?.phone;
  return (
    <Card style={{ gap: space.md }}>
      <Touchable onPress={() => router.push(`/order/${order.id}`)} style={{ gap: space.sm }} scaleTo={0.99}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <T v="h3">{order.partner?.name}</T>
            <T v="small" color={colors.textMuted}>
              №{order.number} · {dayLabel(order.deliveryDate).toLowerCase()} · {count} {plural(count, 'позиция', 'позиции', 'позиций')}
            </T>
          </View>
          <StatusChip status={order.status} small />
        </View>
      </Touchable>
      <Touchable onPress={() => order.deliveryAddress && openMaps(order.deliveryAddress)} style={styles.line} haptic>
        <View style={[styles.lineIcon, { backgroundColor: colors.iceCube }]}>
          <Icon name="navigation" size={18} color={colors.blueberry} />
        </View>
        <T v="bodyStrong" style={{ flex: 1 }}>
          {order.deliveryAddress || 'Адрес не указан'}
        </T>
        <T v="caption" color={colors.blueberry} style={{ fontFamily: fonts.bold }}>
          КАРТА
        </T>
      </Touchable>
      {!!phone && (
        <Touchable onPress={() => callPhone(phone)} style={styles.line} haptic>
          <View style={[styles.lineIcon, { backgroundColor: colors.primarySoft }]}>
            <Icon name="phone" size={18} color={colors.mango} />
          </View>
          <T v="bodyStrong" style={{ flex: 1 }}>
            {formatPhone(phone)}
            {order.partner?.contactName ? ` · ${order.partner.contactName}` : ''}
          </T>
          <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
            ЗВОНОК
          </T>
        </Touchable>
      )}
      {!!order.comment && (
        <View style={[styles.line, { backgroundColor: colors.softYellow }]}>
          <Icon name="chat" size={18} color={colors.cambodia} />
          <T v="small" style={{ flex: 1, fontFamily: fonts.semibold }}>
            {order.comment}
          </T>
        </View>
      )}
      <UndoableAction order={order} onChanged={onChanged} />
    </Card>
  );
}

/**
 * «Забрал» / «Доставлено» без диалога, но с 5 секундами на «Отменить»:
 * курьер в дороге — одно касание, а случайное нажатие легко вернуть.
 */
function UndoableAction({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const next = order.status === 'READY' ? 'SHIPPED' : 'DELIVERED';
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(async () => {
      if (left > 1) return setLeft(left - 1);
      setLeft(0);
      setBusy(true);
      try {
        await Orders.setStatus(order.id, next);
        hapticSuccess();
        toast.success(next === 'SHIPPED' ? `Заказ №${order.number} у вас — в путь!` : `Заказ №${order.number} доставлен`);
        invalidateOrders();
        onChanged();
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy(false);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [left, next, order.id, order.number, onChanged]);

  if (left > 0) {
    return (
      <View style={styles.undo}>
        <ProgressBar value={left / 5} color={colors.mango} track="rgba(249,245,230,0.25)" height={4} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <T v="bodyStrong" color={colors.oatMilk} style={{ flex: 1 }}>
            {next === 'SHIPPED' ? 'Отмечаем «Забрал»…' : 'Отмечаем «Доставлено»…'} {left}
          </T>
          <Touchable onPress={() => setLeft(0)} style={styles.undoBtn} haptic hitSlop={6}>
            <T v="small" color={colors.cambodia} style={{ fontFamily: fonts.extrabold }}>
              Отменить
            </T>
          </Touchable>
        </View>
      </View>
    );
  }
  return next === 'SHIPPED' ? (
    <Button title="Забрал" icon="box" kind="dark" loading={busy} onPress={() => setLeft(5)} />
  ) : (
    <Button title="Доставлено" icon="check" loading={busy} onPress={() => setLeft(5)} />
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, borderRadius: radius.xl, padding: space.lg, gap: 0 },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.iceCube, padding: space.md, borderRadius: radius.lg },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.oatMilk,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 56,
  },
  lineIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  undo: { backgroundColor: colors.cambodia, borderRadius: radius.lg, padding: space.md, gap: space.md, minHeight: 54 },
  undoBtn: { backgroundColor: colors.lime, borderRadius: radius.pill, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
});
