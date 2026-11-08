import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage, Orders } from '../../api';
import { Admin, OfficeOrder } from '../../api/admin';
import { addDaysIso, dateChip, dayLabel, money, plural, todayIso } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/ui';
import { ACTION_LABELS, allowedTransitions, canMarkPaid, ORDER_STATUS_LABELS, OrderStatus, Role } from '../../shared';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { callPhone } from '../contacts';
import { Header, TAB_BAR_SPACE } from '../layout';
import { StatusChip } from '../order';
import { ProductImage } from '../product';
import { Button, Chip, EmptyState, ErrorState, hapticSuccess, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { ActionItem, ago, ListSkeleton, SearchBar, Segmented, Sheet, TabHeader } from './kit';
import { ORDER_REJECT_PRESETS, PayMethodSheet, ReasonSheet } from './Sheets';

type FKey = 'new' | 'approved' | 'work' | 'ready' | 'all';
const OPEN: OrderStatus[] = ['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'];
const FILTERS: { key: FKey; label: string; statuses?: OrderStatus[]; paid?: boolean }[] = [
  { key: 'new', label: 'Новые', statuses: ['NEW', 'APPROVED', 'PAID'] },
  { key: 'approved', label: 'Не оплачены', statuses: OPEN, paid: false },
  { key: 'work', label: 'В работе', statuses: ['IN_PRODUCTION'] },
  { key: 'ready', label: 'Готовы', statuses: ['READY', 'SHIPPED'] },
  { key: 'all', label: 'Все' },
];

type DKey = 'any' | 'yesterday' | 'today' | 'tomorrow' | 'after';
const DATES: { key: DKey; label: string; shift?: number }[] = [
  { key: 'any', label: 'Все даты' },
  { key: 'today', label: 'Сегодня', shift: 0 },
  { key: 'tomorrow', label: 'Завтра', shift: 1 },
  { key: 'after', label: 'Послезавтра', shift: 2 },
  { key: 'yesterday', label: 'Вчера', shift: -1 },
];

/**
 * Заказы глазами офиса: быстрый разбор новых, одобрение в одно касание,
 * отклонение с причиной, меню действий по долгому нажатию.
 */
export function OfficeOrders({ stack }: { stack?: boolean }) {
  const insets = useSafeAreaInsets();
  const role = useAuth((s) => s.user?.role) as Role;
  const params = useLocalSearchParams<{ f?: string; d?: string }>();
  const [fkey, setFkey] = useState<FKey>((params.f as FKey) || (role === 'ACCOUNTANT' ? 'approved' : 'new'));
  const [dkey, setDkey] = useState<DKey>((params.d as DKey) || 'any');
  const [query, setQuery] = useState('');

  // Переход с пульта с новым фильтром
  useEffect(() => {
    if (params.f && FILTERS.some((f) => f.key === params.f)) setFkey(params.f as FKey);
    if (params.d) setDkey(params.d as DKey);
    else if (params.f) setDkey('any');
    if (!stack && (params.f || params.d)) router.setParams({ f: undefined, d: undefined });
  }, [params.f, params.d, stack]);

  const filter = FILTERS.find((f) => f.key === fkey)!;
  const date = DATES.find((d) => d.key === dkey)!;
  const day = date.shift != null ? addDaysIso(todayIso(), date.shift) : undefined;

  const list = useLoad(
    () => Admin.orders({ status: filter.statuses, paid: filter.paid, dateFrom: day, dateTo: day, search: query || undefined }),
    [fkey, day, query],
  );
  const dash = useLoad(() => Admin.dashboard(), []);

  const [menu, setMenu] = useState<OfficeOrder | null>(null);
  const [rejecting, setRejecting] = useState<{ o: OfficeOrder; cancel: boolean } | null>(null);
  const [paying, setPaying] = useState<OfficeOrder | null>(null);

  const sections = useMemo(() => {
    const map = new Map<string, OfficeOrder[]>();
    for (const o of list.data ?? []) {
      const arr = map.get(o.deliveryDate) ?? [];
      arr.push(o);
      map.set(o.deliveryDate, arr);
    }
    return [...map].map(([d, data]) => ({ key: d, title: d, total: data.reduce((a, o) => a + o.total, 0), data }));
  }, [list.data]);

  /** Смена статуса с мгновенным откликом и откатом при ошибке. */
  const change = useCallback(
    async (o: OfficeOrder, status: OrderStatus, extra: { comment?: string } = {}) => {
      const prev = list.data;
      const keep = !filter.statuses || filter.statuses.includes(status);
      list.setData((cur) => (cur ?? []).flatMap((x) => (x.id !== o.id ? [x] : keep ? [{ ...x, status }] : [])));
      Haptics.notificationAsync(status === 'REJECTED' || status === 'CANCELLED' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
      try {
        await Orders.setStatus(o.id, status, extra);
        toast.success(`№${o.number}: ${ORDER_STATUS_LABELS[status].toLowerCase()}`);
        dash.reload();
      } catch (e) {
        list.setData(prev);
        toast.error(errorMessage(e));
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, filter],
  );

  const onAction = useCallback(
    (o: OfficeOrder, a: OrderStatus) => {
      if (a === 'REJECTED' || a === 'CANCELLED') return setRejecting({ o, cancel: a === 'CANCELLED' });
      if (a === 'PAID') return setPaying(o); // оплата — отдельная отметка, не статус
      change(o, a).catch(() => {});
    },
    [change],
  );

  const d = dash.data;
  const counts: Partial<Record<FKey, number>> = d ? { new: d.newOrders, approved: d.awaitingPayment.count, work: d.inProduction, ready: d.ready } : {};
  const cancelMode = !!rejecting?.cancel;

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      {!stack && <TabHeader title="Заказы" subtitle={d ? `${d.newOrders} ${plural(d.newOrders, 'новый', 'новых', 'новых')} · ${d.awaitingPayment.count} ждут оплаты` : 'Разбор и статусы'} />}
      <Segmented scroll items={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] }))} value={fkey} onChange={setFkey} />
      <SearchBar placeholder="Партнёр или номер заказа" onDebounced={setQuery} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {DATES.map((x) => (
          <Chip key={x.key} label={x.label} icon={x.key === 'any' ? 'calendar' : undefined} active={x.key === dkey} onPress={() => setDkey(x.key)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {stack && <Header title="Заказы" subtitle={day ? dayLabel(day) : undefined} />}
      <SectionList
        sections={list.loading ? [] : sections}
        keyExtractor={(o) => o.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: stack ? space.sm : insets.top + space.md,
          paddingBottom: (stack ? space.xxxl : TAB_BAR_SPACE) + insets.bottom,
        }}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              list.refresh();
              dash.reload();
            }}
            tintColor={colors.mango}
            colors={[colors.mango]}
          />
        }
        renderSectionHeader={({ section }) => <DayHeader date={section.title} count={section.data.length} total={section.total} />}
        ItemSeparatorComponent={Sep}
        renderItem={({ item }) => <OrderRow order={item} role={role} onAction={onAction} onMenu={setMenu} />}
        ListEmptyComponent={
          list.loading ? (
            <ListSkeleton rows={4} height={150} />
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.refresh} />
          ) : (
            <EmptyState
              icon={query ? 'search' : 'check'}
              tint={query ? colors.softYellow : colors.greenSoft}
              title={query ? 'Ничего не нашли' : fkey === 'new' ? 'Новых заказов нет' : 'Здесь пусто'}
              text={query ? `По запросу «${query}» заказов нет.` : fkey === 'new' ? 'Как только партнёр оформит заказ, он появится здесь.' : 'Попробуйте другой фильтр или дату.'}
              action={dkey !== 'any' ? 'Все даты' : undefined}
              onAction={() => setDkey('any')}
            />
          )
        }
      />

      <OrderMenu
        order={menu}
        role={role}
        onClose={() => setMenu(null)}
        onAction={(o, a) => {
          setMenu(null);
          onAction(o, a);
        }}
      />
      <ReasonSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={cancelMode ? `Отменить №${rejecting?.o.number}?` : `Отклонить №${rejecting?.o.number}?`}
        message="Партнёр увидит причину в приложении"
        presets={ORDER_REJECT_PRESETS}
        confirmText={cancelMode ? 'Отменить заказ' : 'Отклонить заказ'}
        onSubmit={async (reason) => {
          const { o } = rejecting!;
          setRejecting(null);
          await change(o, cancelMode ? 'CANCELLED' : 'REJECTED', { comment: reason }).catch(() => {});
        }}
      />
      <PayMethodSheet
        visible={!!paying}
        onClose={() => setPaying(null)}
        title={`Оплата №${paying?.number ?? ''}`}
        total={paying?.total}
        onPick={async (m) => {
          const o = paying!;
          setPaying(null);
          try {
            await Orders.markPaid(o.id, { paymentMethod: m });
            hapticSuccess();
            toast.success(`№${o.number}: оплата отмечена`);
            list.setData((cur) =>
              (cur ?? []).flatMap((x) => (x.id !== o.id ? [x] : filter.paid === false ? [] : [{ ...x, paidAt: new Date().toISOString() }])),
            );
            dash.reload();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </View>
  );
}

function Sep() {
  return <View style={{ height: space.md }} />;
}

function DayHeader({ date, count, total }: { date: string; count: number; total: number }) {
  const c = dateChip(date);
  const today = date === todayIso();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.lg, paddingBottom: space.md }}>
      <View style={[st.dayBox, today && { backgroundColor: colors.mango }]}>
        <T v="caption" color={today ? colors.white : colors.textMuted} style={{ fontFamily: fonts.bold, fontSize: 10 }}>
          {c.weekday}
        </T>
        <T style={{ fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 18 }} color={today ? colors.white : colors.text}>
          {c.day}
        </T>
      </View>
      <View style={{ flex: 1 }}>
        <T v="h3">{dayLabel(date)}</T>
        <T v="small" color={colors.textMuted}>
          {count} {plural(count, 'заказ', 'заказа', 'заказов')} · {money(total)}
        </T>
      </View>
    </View>
  );
}

const OrderRow = memo(function OrderRow({
  order,
  role,
  onAction,
  onMenu,
}: {
  order: OfficeOrder;
  role: Role;
  onAction: (o: OfficeOrder, a: OrderStatus) => void;
  onMenu: (o: OfficeOrder) => void;
}) {
  const pay = canMarkPaid(order, role);
  const actions = [...(role ? allowedTransitions(order.status, role).filter((a) => a !== 'CANCELLED') : []).slice(0, pay ? 1 : 2), ...(pay ? (['PAID'] as OrderStatus[]) : [])];
  const fresh = order.status === 'NEW';
  const count = order.items.length;
  return (
    <Touchable
      onPress={() => router.push(`/order/${order.id}`)}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onMenu(order);
      }}
      delayLongPress={350}
      scaleTo={0.985}
      style={[st.row, fresh && st.rowFresh]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <T v="h3">№{order.number}</T>
            {fresh && (
              <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                {ago(order.createdAt)}
              </T>
            )}
          </View>
          <T v="bodyStrong" numberOfLines={1}>
            {order.partner?.name}
          </T>
          {!!order.deliveryAddress && (
            <T v="small" color={colors.textMuted} numberOfLines={1}>
              {order.deliveryAddress}
            </T>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusChip status={order.status} small />
          <T v="h3">{money(order.total)}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flexDirection: 'row' }}>
          {order.items.slice(0, 5).map((i, k) => (
            <ProductImage key={i.id} photoUrl={i.photoUrl} category={i.category} seed={i.productId} iconSize={16} rounded={11} style={[st.thumb, { marginLeft: k ? -8 : 0, zIndex: 10 - k }]} />
          ))}
        </View>
        <T v="small" color={colors.textSoft} style={{ flex: 1 }} numberOfLines={1}>
          {count} {plural(count, 'позиция', 'позиции', 'позиций')}
          {order.comment ? ' · есть комментарий' : ''}
        </T>
        <Touchable haptic onPress={() => onMenu(order)} hitSlop={10} accessibilityLabel="Действия" style={st.more}>
          <AIcon name="dots" size={20} color={colors.textMuted} strokeWidth={2.4} />
        </Touchable>
      </View>
      {actions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {actions.slice(0, 2).map((a) => (
            <Button
              key={a}
              small
              title={a === 'PAID' ? 'Оплата получена' : ACTION_LABELS[a] ?? a}
              icon={a === 'APPROVED' ? 'check' : a === 'REJECTED' ? 'close' : undefined}
              kind={a === 'REJECTED' ? 'ghost' : a === 'APPROVED' || a === 'PAID' ? 'primary' : 'dark'}
              style={{ flex: 1 }}
              onPress={() => onAction(order, a)}
            />
          ))}
        </View>
      )}
    </Touchable>
  );
});

/** Меню действий по долгому нажатию. */
function OrderMenu({ order, role, onClose, onAction }: { order: OfficeOrder | null; role: Role; onClose: () => void; onAction: (o: OfficeOrder, a: OrderStatus) => void }) {
  const o = order;
  const actions = o && role ? [...allowedTransitions(o.status, role), ...(canMarkPaid(o, role) ? (['PAID'] as OrderStatus[]) : [])] : [];
  const canEdit = !!o && (role === 'ADMIN' || role === 'MANAGER') && ['NEW', 'APPROVED', 'PAID'].includes(o.status);
  return (
    <Sheet visible={!!o} onClose={onClose} title={o ? `Заказ №${o.number}` : ''} subtitle={o ? `${o.partner?.name} · ${money(o.total)}` : ''}>
      {o && (
        <View style={{ gap: space.sm }}>
          {actions
            .filter((a) => a !== 'CANCELLED' && a !== 'REJECTED')
            .map((a) => (
              <ActionItem key={a} icon={a === 'APPROVED' ? 'check' : a === 'PAID' ? 'cash' : a === 'IN_PRODUCTION' ? 'chef' : a === 'READY' ? 'box' : 'truck'} tone="green" title={a === 'PAID' ? 'Оплата получена' : ACTION_LABELS[a] ?? a} subtitle={a === 'PAID' ? 'Статус заказа не изменится' : `→ ${ORDER_STATUS_LABELS[a]}`} onPress={() => onAction(o, a)} />
            ))}
          <ActionItem icon="receipt" title="Открыть заказ" subtitle="Состав, история, комментарий" onPress={() => { onClose(); router.push(`/order/${o.id}`); }} />
          {canEdit && <ActionItem icon="edit" title="Изменить состав" subtitle="По согласованию с партнёром" onPress={() => { onClose(); router.push(`/admin/order-edit/${o.id}`); }} />}
          {!!o.partner?.phone && <ActionItem icon="phone" title="Позвонить партнёру" subtitle={o.partner.contactName ?? undefined} onPress={() => callPhone(o.partner.phone!)} />}
          {role !== 'ACCOUNTANT' && <ActionItem icon="shop" title="Карточка партнёра" onPress={() => { onClose(); router.push(`/admin/partner/${o.partner.id}`); }} />}
          {actions.includes('REJECTED') && <ActionItem icon="close" danger title="Отклонить" subtitle="С причиной для партнёра" onPress={() => onAction(o, 'REJECTED')} />}
          {actions.includes('CANCELLED') && <ActionItem icon="trash" danger title="Отменить заказ" onPress={() => onAction(o, 'CANCELLED')} />}
        </View>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  row: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
  rowFresh: { borderWidth: 1.5, borderColor: colors.primarySoft },
  thumb: { width: 30, height: 30, borderWidth: 2, borderColor: colors.white },
  more: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  dayBox: { width: 44, height: 48, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
});
