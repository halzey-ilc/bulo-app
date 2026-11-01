import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Order, Orders } from '../../src/api';
import { callPhone, openMaps } from '../../src/components/contacts';
import { Icon } from '../../src/components/Icon';
import { TAB_BAR_SPACE } from '../../src/components/layout';
import { OrderCardSkeleton, StatusChip } from '../../src/components/order';
import { Button, Card, Chip, EmptyState, ErrorState, T, Touchable } from '../../src/components/ui';
import { dayLabel, formatPhone, plural } from '../../src/lib/format';
import { runOrderAction } from '../../src/lib/orderActions';
import { useLoad } from '../../src/lib/useLoad';
import { useAuth } from '../../src/store/auth';
import { colors, fonts, radius, space } from '../../src/theme';

type Tab = 'READY' | 'SHIPPED' | 'ALL';

export default function Deliveries() {
  const insets = useSafeAreaInsets();
  const name = useAuth((s) => s.user?.name);
  const [tab, setTab] = useState<Tab>('ALL');
  const list = useLoad(() => Orders.list(['READY', 'SHIPPED']), []);
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
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.mango} colors={[colors.mango]} />}
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
      {order.status === 'READY' ? (
        <Button title="Забрал" icon="box" kind="dark" onPress={() => runOrderAction(order, 'SHIPPED', onChanged)} />
      ) : (
        <Button title="Доставлено" icon="check" onPress={() => runOrderAction(order, 'DELIVERED', onChanged)} />
      )}
    </Card>
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
  },
  lineIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
