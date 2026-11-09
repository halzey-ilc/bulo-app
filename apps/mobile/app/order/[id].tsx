import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Order } from '../../src/api';
import { FadeIn, Pulse } from '../../src/components/motion';
import { hapticSuccess } from '../../src/components/ui';
import { invalidate } from '../../src/lib/cache';
import { invalidateOrders, Q, useQuery } from '../../src/lib/queries';
import { toast } from '../../src/store/ui';
import { OfficeOrderTools } from '../../src/components/admin/OfficeExtras';
import { callPhone, openMaps } from '../../src/components/contacts';
import { Icon } from '../../src/components/Icon';
import { BottomBar, Header, Screen } from '../../src/components/layout';
import { orderTitle, orderWhen, STATUS_STYLE } from '../../src/components/order';
import { PaymentPanel, paymentTitle, StaffPaymentPanel } from '../../src/components/cafe';
import { ProductImage } from '../../src/components/product';
import { Button, Card, Divider, ErrorState, Row, Skeleton, T, Touchable } from '../../src/components/ui';
import { dateTime, deliveryPhrase, formatPhone, money, qtyText } from '../../src/lib/format';
import { actionKind, runConfirm, runMarkPaid, runOrderAction } from '../../src/lib/orderActions';
import { repeatOrder } from '../../src/lib/repeat';
import { isOffice, usePersona } from '../../src/store/auth';
import { actionLabel, flowOf, OrderStatus, statusLabel } from '../../src/shared';
import { colors, fonts, radius, space } from '../../src/theme';

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const persona = usePersona();
  // Живой статус: открыт мгновенно из кэша, пока экран открыт — опрос каждые 25 секунд.
  const { data: order, error, loading, refresh, refreshing } = useQuery(Q.order(id), { staleTime: 10_000, poll: 25_000 });
  useStatusChangeNotice(order);

  if (loading || !order) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Заказ" />
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <Skeleton style={{ height: 160, borderRadius: radius.xl }} />
            <Skeleton style={{ height: 280, borderRadius: radius.xl }} />
          </View>
        )}
      </View>
    );
  }

  const buyer = persona === 'buyer';
  const cafe = order.channel === 'CAFE';
  const actions = (order.actions ?? []).filter((a) => !(buyer && a !== 'CANCELLED'));
  const onDone = () => {
    invalidateOrders();
    invalidate(`payment:${order.id}`);
    refresh();
  };
  const st = STATUS_STYLE[order.status];
  const buyerPhone = order.partner?.phone ?? order.createdBy?.phone ?? null;
  const subline = cafe
    ? order.status === 'DELIVERED'
      ? `Выдана · ${order.branch?.name ?? ''}`
      : order.status === 'READY'
        ? `Ждём вас в «${order.branch?.name ?? 'кофейне'}»`
        : `Заберёте ${orderWhen(order)}`
    : order.status === 'NEW'
      ? order.paymentMethod === 'CASH'
        ? 'Менеджер подтвердит заказ — и он уйдёт в цех'
        : 'Оплатите — и заказ уйдёт в цех'
      : `Доставка ${deliveryPhrase(order.deliveryDate)}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={orderTitle(order)} subtitle={`от ${dateTime(order.createdAt)}`} />
      <Screen refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingBottom: actions.length || buyer ? 170 : 40 }}>
        {/* Главная карточка */}
        <View style={[styles.hero, { backgroundColor: st.bg }]}>
          <View style={styles.heroIcon}>
            <Icon name={cafe && order.status === 'READY' ? 'bag' : st.icon} size={28} color={st.fg === colors.oatMilk ? colors.cambodia : st.fg} strokeWidth={1.8} />
          </View>
          <T v="h1" color={st.fg}>
            {statusLabel(order.status, order.channel)}
          </T>
          <T v="body" color={st.fg} style={{ opacity: 0.85 }}>
            {subline}
          </T>
        </View>

        {/* Доставка: курьер везёт — живой трекинг; заказ собран — скоро передадим */}
        {!cafe && (buyer || isOffice(persona)) && (order.status === 'SHIPPED' || order.status === 'READY') && <TrackCard order={order} />}

        {/* Оплата: QR с суммой, реквизиты, «Я оплатил» */}
        {buyer && <PaymentPanel order={order} onChanged={() => refresh()} />}
        {!buyer && (
          <StaffPaymentPanel
            order={order}
            canConfirm={!!order.canConfirm}
            canMarkPaid={!!order.canMarkPaid}
            onConfirm={() => runConfirm(order, onDone)}
            onMarkPaid={() => runMarkPaid(order, onDone)}
          />
        )}

        {(order.status === 'REJECTED' || order.status === 'CANCELLED') && (
          <Card style={{ backgroundColor: colors.dangerSoft, gap: 4 }}>
            <T v="h3" color={colors.coffee}>
              {order.status === 'REJECTED' ? 'Почему отклонён' : 'Заказ отменён'}
            </T>
            <T v="body" color={colors.coffee}>
              {order.rejectReason || order.history.at(-1)?.comment || 'Причина не указана'}
            </T>
          </Card>
        )}

        {/* Детали */}
        <Card padded={false} style={{ paddingVertical: 4 }}>
          {persona !== 'buyer' && (
            <>
              <Row
                icon={cafe ? 'user' : 'shop'}
                tint={colors.softYellow}
                title={order.buyer}
                subtitle={buyerPhone ? `${formatPhone(buyerPhone)} · позвонить` : cafe ? 'Гость кофейни' : order.partner?.contactName ?? undefined}
                onPress={buyerPhone ? () => callPhone(buyerPhone) : undefined}
              />
              <Divider inset={68} />
            </>
          )}
          {cafe ? (
            <Row
              icon="coffee"
              tint={colors.iceCube}
              iconColor={colors.blueberry}
              title={order.branch ? `${order.branch.name}${order.branch.address ? `, ${order.branch.address}` : ''}` : 'Самовывоз'}
              subtitle={`Самовывоз · ${orderWhen(order)}`}
              onPress={order.branch?.address ? () => openMaps(order.branch!.address!) : undefined}
            />
          ) : (
            <Row
              icon="pin"
              tint={colors.iceCube}
              iconColor={colors.blueberry}
              title={order.deliveryAddress || 'Адрес не указан'}
              subtitle="Адрес доставки"
              onPress={order.deliveryAddress ? () => openMaps(order.deliveryAddress!) : undefined}
            />
          )}
          {!!order.comment && (
            <>
              <Divider inset={68} />
              <Row icon="chat" tint={colors.greenSoft} title={order.comment} subtitle="Комментарий" />
            </>
          )}
          {!!order.courier && (
            <>
              <Divider inset={68} />
              <Row
                icon="truck"
                tint="#FBD9E8"
                iconColor={colors.coffee}
                title={order.courier.name || 'Курьер'}
                subtitle={order.courier.phone ? `${formatPhone(order.courier.phone)} · позвонить` : 'Курьер'}
                onPress={order.courier.phone ? () => callPhone(order.courier!.phone!) : undefined}
              />
            </>
          )}
          {!!order.paymentMethod && (
            <>
              <Divider inset={68} />
              <Row
                icon={order.paymentMethod === 'QR' ? 'qr' : order.paymentMethod === 'BANK' ? 'bank' : 'cash'}
                tint={colors.primarySoft}
                iconColor={colors.mango}
                title={paymentTitle(order.paymentMethod)}
                subtitle={order.paidAt ? 'Оплачено' : 'Способ оплаты'}
              />
            </>
          )}
        </Card>

        {isOffice(persona) && <OfficeOrderTools order={order} />}

        {/* Таймлайн */}
        <Card style={{ gap: space.md }}>
          <T v="h3">{cafe ? 'Путь брони' : 'Путь заказа'}</T>
          <Timeline order={order} />
        </Card>

        {/* Состав */}
        <Card style={{ gap: space.md }}>
          <T v="h3">Состав</T>
          {order.items.map((i, k) => (
            <View key={i.id} style={{ gap: space.md }}>
              {k > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <ProductImage photoUrl={i.photoUrl} category={i.category} seed={i.productId} style={{ width: 48, height: 48 }} iconSize={24} rounded={14} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={2}>
                    {i.name}
                  </T>
                  <T v="small" color={colors.textSoft}>
                    {qtyText(i.qty, i.unit)} × {money(i.price)}
                  </T>
                  {!!i.freeQty && (
                    <T v="small" color={colors.coffee} style={{ fontFamily: fonts.bold }}>
                      🎁 {i.freeQty} в подарок
                    </T>
                  )}
                </View>
                <T v="bodyStrong">{money(i.sum)}</T>
              </View>
            </View>
          ))}
          {order.discount > 0 && (
            <>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="bodyStrong" color={colors.coffee}>
                  {order.freeCoffees > 1 ? `Кофе в подарок × ${order.freeCoffees}` : 'Кофе в подарок'}
                </T>
                <T v="bodyStrong" color={colors.coffee}>
                  −{money(order.discount)}
                </T>
              </View>
            </>
          )}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="h3">Итого</T>
            <T v="h3" color={colors.mango}>
              {money(order.total)}
            </T>
          </View>
        </Card>
      </Screen>

      {(actions.length > 0 || buyer) && (
        <BottomBar>
          {buyer && (
            <Button title={cafe ? 'Повторить бронь' : 'Повторить заказ'} icon="repeat" kind={actions.length ? 'secondary' : 'primary'} onPress={() => repeatOrder(order)} />
          )}
          {actions.length > 0 && (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {actions.map((a) => (
                <Button
                  key={a}
                  title={buyer && a === 'CANCELLED' ? (cafe ? 'Отменить бронь' : 'Отменить заказ') : actionLabel(a, order.channel)}
                  kind={buyer ? 'ghost' : actionKind(a)}
                  style={{ flex: 1 }}
                  onPress={() => runOrderAction(order, a, onDone)}
                />
              ))}
            </View>
          )}
        </BottomBar>
      )}
    </View>
  );
}

/** Карточка «Отследить курьера» (в пути) / «Скоро передадим курьеру» (собран). */
function TrackCard({ order }: { order: Order }) {
  const shipped = order.status === 'SHIPPED';
  return (
    <Touchable onPress={() => router.push(`/track/${order.id}`)} haptic scaleTo={0.98} style={[styles.track, !shipped && styles.trackSoft]}>
      <View style={[styles.trackIcon, !shipped && { backgroundColor: colors.white }]}>
        {shipped && <Pulse size={48} color={colors.white} />}
        <Icon name={shipped ? 'navigation' : 'box'} size={24} color={shipped ? colors.mango : colors.blueberry} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3" color={shipped ? colors.white : colors.cambodia}>
          {shipped ? 'Отследить курьера' : 'Скоро передадим курьеру'}
        </T>
        <T v="small" color={shipped ? 'rgba(255,255,255,0.88)' : colors.textMuted}>
          {shipped ? 'Где сейчас заказ, когда приедет и код для вручения' : 'Заказ собран. Когда курьер заберёт его, здесь появится карта'}
        </T>
      </View>
      <Icon name="chevronRight" size={20} color={shipped ? colors.white : colors.textSoft} />
    </Touchable>
  );
}

/** Вертикальная шкала: этапы ORDER_FLOW с отметками времени из истории. */
function Timeline({ order }: { order: Order }) {
  const terminal = order.status === 'REJECTED' || order.status === 'CANCELLED';
  const reached = new Map<OrderStatus, Order['history'][number]>();
  for (const h of order.history) reached.set(h.to, h);
  const FLOW = flowOf(order.channel);
  const currentIdx = FLOW.indexOf(order.status === 'APPROVED' ? 'PAID' : order.status);

  let steps: { status: OrderStatus; state: 'done' | 'current' | 'todo' | 'fail' }[];
  if (terminal) {
    steps = FLOW.filter((s) => reached.has(s)).map((s) => ({ status: s, state: 'done' as const }));
    steps.push({ status: order.status, state: 'fail' });
  } else {
    steps = FLOW.map((s, i) => ({
      status: s,
      state: i < currentIdx ? 'done' : i === currentIdx ? (s === 'DELIVERED' ? 'done' : 'current') : 'todo',
    }));
  }

  return (
    <View>
      {steps.map((s, i) => {
        const h = reached.get(s.status);
        const last = i === steps.length - 1;
        const color =
          s.state === 'fail' ? colors.danger : s.state === 'todo' ? 'rgba(38,66,43,0.18)' : colors.mango;
        return (
          <FadeIn key={s.status} delay={i * 70} offset={8} style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ alignItems: 'center', width: 26 }}>
              {s.state === 'current' && (
                <View style={{ position: 'absolute', top: 0, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                  <Pulse size={26} />
                </View>
              )}
              <View
                style={[
                  styles.dot,
                  { borderColor: color, backgroundColor: s.state === 'done' || s.state === 'fail' ? color : colors.white },
                  s.state === 'current' && styles.dotCurrent,
                ]}
              >
                {s.state === 'done' && <Icon name="check" size={12} color={colors.white} strokeWidth={3} />}
                {s.state === 'fail' && <Icon name="close" size={12} color={colors.white} strokeWidth={3} />}
                {s.state === 'current' && <View style={styles.dotInner} />}
              </View>
              {!last && (
                <View style={[styles.line, { backgroundColor: steps[i + 1].state === 'todo' ? 'rgba(38,66,43,0.12)' : colors.mango }]} />
              )}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : space.lg, gap: 1 }}>
              <T
                v="bodyStrong"
                color={s.state === 'todo' ? colors.textSoft : s.state === 'fail' ? colors.danger : colors.text}
                style={s.state === 'current' ? { fontFamily: fonts.extrabold } : undefined}
              >
                {statusLabel(s.status, order.channel)}
              </T>
              {h && (
                <T v="small" color={colors.textSoft}>
                  {dateTime(h.createdAt)}
                  {h.user?.name ? ` · ${h.user.name}` : ''}
                </T>
              )}
              {h?.comment && s.state !== 'fail' && (
                <T v="small" color={colors.textMuted}>
                  {h.comment}
                </T>
              )}
            </View>
          </FadeIn>
        );
      })}
    </View>
  );
}

/** Статус сменился, пока заказ открыт, — мягко сообщаем и обновляем списки. */
function useStatusChangeNotice(order: Order | undefined) {
  const prev = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!order) return;
    const p = prev.current;
    if (p && p.id === order.id && p.status !== order.status) {
      hapticSuccess();
      toast.success(`${orderTitle(order)}: ${statusLabel(order.status, order.channel).toLowerCase()}`);
      invalidate('orders:');
      invalidate('notif:');
    }
    prev.current = { id: order.id, status: order.status };
  }, [order]);
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.lg, gap: 4 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  payment: { flexDirection: 'row', gap: space.md, borderWidth: 1.5, borderColor: colors.primarySoft },
  track: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.mango, borderRadius: radius.xl, padding: space.lg },
  trackSoft: { backgroundColor: colors.iceCube },
  trackIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  payIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: { width: 26, height: 26, borderRadius: 13, borderWidth: 3 },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mango },
  line: { width: 2, flex: 1, minHeight: 18, marginVertical: 2, borderRadius: 1 },
});
