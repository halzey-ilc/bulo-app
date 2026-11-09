import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage, Orders } from '../../api';
import { Admin, OfficeOrder } from '../../api/admin';
import { addDaysIso, dateChip, dayLabel, money, plural, todayIso } from '../../lib/format';
import { runConfirm, runMarkPaid } from '../../lib/orderActions';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/ui';
import { actionLabel, allowedTransitions, canConfirm, canMarkPaid, OrderStatus, Role, statusLabel } from '../../shared';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { paymentTitle } from '../cafe';
import { callPhone } from '../contacts';
import { Header, TAB_BAR_SPACE } from '../layout';
import { orderTitle, orderWhen, StatusChip } from '../order';
import { ProductImage } from '../product';
import { Button, Chip, EmptyState, ErrorState, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { ActionItem, ago, ListSkeleton, SearchBar, Segmented, Sheet, TabHeader } from './kit';
import { ORDER_REJECT_PRESETS, ReasonSheet } from './Sheets';

/** Действие в строке: смена статуса, подтверждение оплаты или «деньги получены». */
type Act = OrderStatus | 'CONFIRM' | 'MONEY';

type FKey = 'confirm' | 'cafe' | 'work' | 'ready' | 'debt' | 'all';
const OPEN: OrderStatus[] = ['APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'];
const FILTERS: { key: FKey; label: string; statuses?: OrderStatus[]; paid?: boolean; awaiting?: boolean; channel?: 'CAFE' | 'PARTNER' }[] = [
  { key: 'confirm', label: 'Подтвердить', awaiting: true },
  { key: 'cafe', label: 'Брони', channel: 'CAFE', statuses: ['PAID', 'READY'] },
  { key: 'work', label: 'В цеху', channel: 'PARTNER', statuses: ['APPROVED', 'PAID', 'IN_PRODUCTION'] },
  { key: 'ready', label: 'Готовы', channel: 'PARTNER', statuses: ['READY', 'SHIPPED'] },
  { key: 'debt', label: 'Не оплачены', statuses: OPEN, paid: false },
  { key: 'all', label: 'Все' },
];

type CKey = 'any' | 'CAFE' | 'PARTNER';

type DKey = 'any' | 'yesterday' | 'today' | 'tomorrow' | 'after';
const DATES: { key: DKey; label: string; shift?: number }[] = [
  { key: 'any', label: 'Все даты' },
  { key: 'today', label: 'Сегодня', shift: 0 },
  { key: 'tomorrow', label: 'Завтра', shift: 1 },
  { key: 'after', label: 'Послезавтра', shift: 2 },
  { key: 'yesterday', label: 'Вчера', shift: -1 },
];

/**
 * Заказы глазами офиса: сначала — что подтвердить (оплата пришла / принять за наличные),
 * потом брони кофейни, цех, готовые. Отклонение с причиной, меню по долгому нажатию.
 */
export function OfficeOrders({ stack }: { stack?: boolean }) {
  const insets = useSafeAreaInsets();
  const role = useAuth((s) => s.user?.role) as Role;
  const cashier = role === 'CASHIER';
  const params = useLocalSearchParams<{ f?: string; d?: string }>();
  const [fkey, setFkey] = useState<FKey>((params.f as FKey) || 'confirm');
  const [ckey, setCkey] = useState<CKey>('any');
  const [dkey, setDkey] = useState<DKey>((params.d as DKey) || 'any');
  const [query, setQuery] = useState('');
  const filters = cashier ? FILTERS.filter((f) => f.key !== 'work' && f.key !== 'ready') : FILTERS;

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
  const channel = filter.channel ?? (ckey === 'any' ? undefined : ckey);

  const list = useLoad(
    () =>
      Admin.orders({
        status: filter.statuses,
        paid: filter.paid,
        awaiting: filter.awaiting,
        channel,
        dateFrom: day,
        dateTo: day,
        search: query || undefined,
      }),
    [fkey, channel, day, query],
  );
  const dash = useLoad(() => (cashier ? Promise.resolve(null) : Admin.dashboard()), [cashier]);

  const [menu, setMenu] = useState<OfficeOrder | null>(null);
  const [rejecting, setRejecting] = useState<{ o: OfficeOrder; cancel: boolean } | null>(null);

  const sections = useMemo(() => {
    const map = new Map<string, OfficeOrder[]>();
    for (const o of list.data ?? []) {
      const arr = map.get(o.deliveryDate) ?? [];
      arr.push(o);
      map.set(o.deliveryDate, arr);
    }
    return [...map].map(([d, data]) => ({ key: d, title: d, total: data.reduce((a, o) => a + o.total, 0), data }));
  }, [list.data]);

  const replace = (o: OfficeOrder) =>
    list.setData((cur) => (cur ?? []).flatMap((x) => (x.id !== o.id ? [x] : fkey === 'confirm' && o.status !== 'NEW' ? [] : [o])));

  /** Смена статуса с мгновенным откликом и откатом при ошибке. */
  const change = useCallback(
    async (o: OfficeOrder, status: OrderStatus, extra: { comment?: string } = {}) => {
      const prev = list.data;
      const keep = !filter.statuses || filter.statuses.includes(status);
      list.setData((cur) => (cur ?? []).flatMap((x) => (x.id !== o.id ? [x] : keep ? [{ ...x, status }] : [])));
      Haptics.notificationAsync(status === 'REJECTED' || status === 'CANCELLED' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
      try {
        await Orders.setStatus(o.id, status, extra);
        toast.success(`№${o.number}: ${statusLabel(status, o.channel).toLowerCase()}`);
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
    (o: OfficeOrder, a: Act) => {
      const done = (u: OfficeOrder) => {
        replace(u);
        dash.reload();
      };
      if (a === 'CONFIRM') return runConfirm(o, (u) => done(u as OfficeOrder));
      if (a === 'MONEY') return runMarkPaid(o, (u) => done(u as OfficeOrder));
      if (a === 'REJECTED' || a === 'CANCELLED') return setRejecting({ o, cancel: a === 'CANCELLED' });
      change(o, a).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [change, fkey],
  );

  const d = dash.data;
  const counts: Partial<Record<FKey, number>> = d ? { confirm: d.newOrders, cafe: d.cafeActive, work: d.inProduction, ready: d.ready, debt: d.awaitingPayment.count } : {};
  const cancelMode = !!rejecting?.cancel;

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      {!stack && (
        <TabHeader
          title={cashier ? 'Брони' : 'Заказы'}
          subtitle={
            d
              ? `${d.newOrders} ${plural(d.newOrders, 'ждёт', 'ждут', 'ждут')} подтверждения${d.claimed ? ` · ${d.claimed} уже оплатили` : ''}`
              : cashier
                ? 'Брони гостей кофейни'
                : 'Подтверждение и статусы'
          }
        />
      )}
      <Segmented scroll items={filters.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] }))} value={fkey} onChange={setFkey} />
      {!cashier && !filter.channel && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(
            [
              ['any', 'Все'],
              ['CAFE', 'Кофейня'],
              ['PARTNER', 'Партнёры'],
            ] as [CKey, string][]
          ).map(([k, label]) => (
            <Chip key={k} label={label} icon={k === 'CAFE' ? 'coffee' : k === 'PARTNER' ? 'shop' : undefined} active={ckey === k} onPress={() => setCkey(k)} />
          ))}
        </View>
      )}
      <SearchBar placeholder={cashier ? 'Имя, телефон или номер брони' : 'Партнёр, гость или номер заказа'} onDebounced={setQuery} />
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
              title={query ? 'Ничего не нашли' : fkey === 'confirm' ? 'Всё подтверждено' : 'Здесь пусто'}
              text={
                query
                  ? `По запросу «${query}» заказов нет.`
                  : fkey === 'confirm'
                    ? 'Новые заказы и брони появятся здесь — подтвердите их, когда придёт оплата.'
                    : 'Попробуйте другой фильтр или дату.'
              }
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
        message="Покупатель увидит причину в приложении"
        presets={ORDER_REJECT_PRESETS}
        confirmText={cancelMode ? 'Отменить заказ' : 'Отклонить заказ'}
        onSubmit={async (reason) => {
          const { o } = rejecting!;
          setRejecting(null);
          await change(o, cancelMode ? 'CANCELLED' : 'REJECTED', { comment: reason }).catch(() => {});
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

function rowActions(order: OfficeOrder, role: Role): Act[] {
  if (canConfirm(order, role)) return ['CONFIRM', ...(allowedTransitions(order.status, role, order.channel).includes('REJECTED') ? (['REJECTED'] as Act[]) : [])];
  const moves = allowedTransitions(order.status, role, order.channel).filter((a) => a !== 'CANCELLED' && a !== 'REJECTED');
  const money = canMarkPaid(order, role) && !(order.channel === 'CAFE' && moves.includes('DELIVERED'));
  return [...moves.slice(0, money ? 1 : 2), ...(money ? (['MONEY'] as Act[]) : [])];
}

const actTitle = (a: Act, o: OfficeOrder) =>
  a === 'CONFIRM' ? (o.paymentMethod === 'CASH' ? 'Принять' : 'Оплата пришла') : a === 'MONEY' ? 'Деньги получены' : actionLabel(a, o.channel);

const OrderRow = memo(function OrderRow({
  order,
  role,
  onAction,
  onMenu,
}: {
  order: OfficeOrder;
  role: Role;
  onAction: (o: OfficeOrder, a: Act) => void;
  onMenu: (o: OfficeOrder) => void;
}) {
  const actions = rowActions(order, role);
  const fresh = order.status === 'NEW';
  const cafe = order.channel === 'CAFE';
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
      style={[st.row, fresh && st.rowFresh, fresh && !!order.paymentClaimedAt && st.rowClaimed]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={[st.channel, { backgroundColor: cafe ? colors.coffeeSoft : colors.softYellow }]}>
              <AIcon name={cafe ? 'coffee' : 'shop'} size={12} color={cafe ? colors.coffee : '#8A5A00'} strokeWidth={2.2} />
            </View>
            <T v="h3">{orderTitle(order)}</T>
            {fresh && (
              <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                {ago(order.createdAt)}
              </T>
            )}
          </View>
          <T v="bodyStrong" numberOfLines={1}>
            {order.buyer}
          </T>
          <T v="small" color={colors.textMuted} numberOfLines={1}>
            {cafe ? `Заберёт ${orderWhen(order)}` : order.deliveryAddress}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusChip status={order.status} small channel={order.channel} />
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
          {paymentTitle(order.paymentMethod)}
          {order.paidAt ? ' · оплачено' : order.paymentClaimedAt ? ' · оплатил, проверьте' : ''}
          {order.freeCoffees ? ` · 🎁 ${order.freeCoffees}` : ''}
          {!order.paidAt && !order.paymentClaimedAt ? ` · ${count} ${plural(count, 'позиция', 'позиции', 'позиций')}` : ''}
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
              title={actTitle(a, order)}
              icon={a === 'CONFIRM' ? 'check' : a === 'REJECTED' ? 'close' : undefined}
              kind={a === 'REJECTED' ? 'ghost' : a === 'CONFIRM' || a === 'MONEY' || a === 'READY' || a === 'DELIVERED' ? 'primary' : 'dark'}
              style={{ flex: a === 'REJECTED' ? 0.7 : 1 }}
              onPress={() => onAction(order, a)}
            />
          ))}
        </View>
      )}
    </Touchable>
  );
});

/** Меню действий по долгому нажатию. */
function OrderMenu({ order, role, onClose, onAction }: { order: OfficeOrder | null; role: Role; onClose: () => void; onAction: (o: OfficeOrder, a: Act) => void }) {
  const o = order;
  const moves = o && role ? allowedTransitions(o.status, role, o.channel) : [];
  const confirm = !!o && canConfirm(o, role);
  const money_ = !!o && canMarkPaid(o, role);
  const canEdit = !!o && (role === 'ADMIN' || role === 'MANAGER') && o.status === 'NEW' && !o.confirmedAt;
  const phone = o?.partner?.phone ?? o?.createdBy?.phone ?? null;
  return (
    <Sheet visible={!!o} onClose={onClose} title={o ? orderTitle(o) : ''} subtitle={o ? `${o.buyer} · ${money(o.total)}` : ''}>
      {o && (
        <View style={{ gap: space.sm }}>
          {confirm && (
            <ActionItem
              icon="check"
              tone="green"
              title={o.paymentMethod === 'CASH' ? 'Принять заказ' : 'Оплата пришла — подтвердить'}
              subtitle={o.channel === 'CAFE' ? 'Бронь подтвердится, товар спишется в 1С' : 'Заказ уйдёт в цех, товар спишется в 1С'}
              onPress={() => onAction(o, 'CONFIRM')}
            />
          )}
          {moves
            .filter((a) => a !== 'CANCELLED' && a !== 'REJECTED')
            .map((a) => (
              <ActionItem
                key={a}
                icon={a === 'IN_PRODUCTION' ? 'chef' : a === 'READY' ? 'box' : a === 'DELIVERED' ? 'check' : 'truck'}
                tone="green"
                title={actionLabel(a, o.channel)}
                subtitle={`→ ${statusLabel(a, o.channel)}`}
                onPress={() => onAction(o, a)}
              />
            ))}
          {money_ && <ActionItem icon="cash" tone="green" title="Деньги получены" subtitle={paymentTitle(o.paymentMethod)} onPress={() => onAction(o, 'MONEY')} />}
          <ActionItem icon="receipt" title="Открыть заказ" subtitle="Состав, оплата, история" onPress={() => { onClose(); router.push(`/order/${o.id}`); }} />
          {canEdit && <ActionItem icon="edit" title="Изменить состав" subtitle="До подтверждения, по согласованию" onPress={() => { onClose(); router.push(`/admin/order-edit/${o.id}`); }} />}
          {!!phone && <ActionItem icon="phone" title={o.channel === 'CAFE' ? 'Позвонить гостю' : 'Позвонить партнёру'} subtitle={o.partner?.contactName ?? o.buyer} onPress={() => callPhone(phone)} />}
          {role !== 'ACCOUNTANT' && role !== 'CASHIER' && !!o.partner?.id && (
            <ActionItem icon="shop" title="Карточка партнёра" onPress={() => { onClose(); router.push(`/admin/partner/${o.partner!.id}`); }} />
          )}
          {moves.includes('REJECTED') && <ActionItem icon="close" danger title="Отклонить" subtitle="С причиной для покупателя" onPress={() => onAction(o, 'REJECTED')} />}
          {moves.includes('CANCELLED') && <ActionItem icon="trash" danger title="Отменить" onPress={() => onAction(o, 'CANCELLED')} />}
        </View>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  row: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
  rowFresh: { borderWidth: 1.5, borderColor: colors.primarySoft },
  rowClaimed: { borderColor: colors.blueberry, backgroundColor: '#F4F9FF' },
  channel: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 30, height: 30, borderWidth: 2, borderColor: colors.white },
  more: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  dayBox: { width: 44, height: 48, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
});
