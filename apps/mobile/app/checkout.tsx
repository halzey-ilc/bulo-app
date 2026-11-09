import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Addresses, errorMessage, Orders, PaymentMethod, PickupSlot } from '../src/api';
import { BranchChip, PaymentPicker, PickupPicker, usePromoPreview } from '../src/components/cafe';
import { useBranch, useIsCafe } from '../src/lib/branch';
import { invalidate } from '../src/lib/cache';
import { returnAfterLogin } from '../src/lib/session';
import { AddressPicker, PickedAddress } from '../src/components/delivery/MapPicker';
import { Icon } from '../src/components/Icon';
import { FadeIn } from '../src/components/motion';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { ProductImage } from '../src/components/product';
import { Button, Card, Divider, EmptyState, ErrorState, Field, hapticSuccess, Skeleton, T, Touchable } from '../src/components/ui';
import { setCached } from '../src/lib/cache';
import { useCutoff } from '../src/lib/cutoff';
import { dateChip, dateLong, dayLabel, money, qtyText } from '../src/lib/format';
import { goTab } from '../src/lib/nav';
import { invalidateOrders, Q, useQuery } from '../src/lib/queries';
import { useAuth } from '../src/store/auth';
import { cartTotal, useCart } from '../src/store/cart';
import { toast } from '../src/store/ui';
import { colors, fonts, radius, space } from '../src/theme';

export default function Checkout() {
  const cafe = useIsCafe();
  return cafe ? <CafeCheckout /> : <PartnerCheckout />;
}

/** Бронь в кофейне: филиал, время самовывоза, оплата по QR или на кассе, подарок по акции. */
function CafeCheckout() {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const user = useAuth((s) => s.user);
  const uid = user?.id ?? 'anon';
  const { branch } = useBranch();
  const rules = useQuery(Q.rules(), { refetchOnFocus: false, staleTime: 10_000 });
  const loyalty = useQuery(Q.loyalty(uid), { enabled: !!user, staleTime: 0 });
  const [slot, setSlot] = useState<PickupSlot | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('QR');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placed = useRef(false);
  const qrReady = rules.data?.payment?.qr !== false;
  const methods: PaymentMethod[] = qrReady ? ['QR', 'CASH'] : ['CASH'];
  const pay = methods.includes(method) ? method : methods[0];

  const gross = cartTotal(lines);
  const promo = usePromoPreview(lines, user ? loyalty.data : null);
  const total = Math.max(0, gross - promo.discount);

  const submit = async () => {
    setError(null);
    if (!user) {
      returnAfterLogin('/checkout');
      router.push('/login');
      return;
    }
    if (!branch) return setError('Выберите филиал');
    if (!slot) return setError('Выберите, во сколько заберёте');
    setSubmitting(true);
    try {
      const order = await Orders.create({
        branchId: branch.id,
        pickupAt: slot.at,
        paymentMethod: pay,
        comment: comment.trim() || undefined,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      });
      placed.current = true;
      hapticSuccess();
      invalidateOrders();
      invalidate('loyalty:');
      setCached(Q.order(order.id).key, order);
      router.replace({ pathname: '/order-success', params: { id: order.id, number: String(order.number), date: order.deliveryDate, cafe: '1', time: slot.time } });
      setTimeout(() => clear(), 400);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!lines.length) {
    if (placed.current) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
    return (
      <View style={{ flex: 1 }}>
        <Header title="Бронь" />
        <EmptyState icon="bag" title="Корзина пуста" text="Добавьте кофе и выпечку из меню — и возвращайтесь." action="В меню" onAction={() => goTab('/catalog')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Бронь с собой" />
      <Screen contentStyle={{ paddingBottom: 190, gap: space.xl }}>
        <View style={{ gap: space.md }}>
          <Step n={1} title="Где заберёте" />
          <BranchChip />
          {!!branch?.address && (
            <T v="small" color={colors.textMuted}>
              {branch.address} · {branch.opensAt}–{branch.closesAt}
            </T>
          )}
        </View>

        <View style={{ gap: space.md }}>
          <Step n={2} title="Во сколько" />
          <PickupPicker branch={branch} value={slot?.at ?? null} onChange={setSlot} />
          <View style={styles.hint}>
            <Icon name="clock" size={18} color={colors.cambodia} />
            <T v="small" style={{ flex: 1, fontFamily: fonts.semibold }}>
              Соберём к {slot?.time ?? 'выбранному времени'}. Бронь держим до закрытия филиала.
            </T>
          </View>
        </View>

        <View style={{ gap: space.md }}>
          <Step n={3} title="Как оплатите" />
          <PaymentPicker value={pay} onChange={setMethod} methods={methods} cafe />
        </View>

        <View style={{ gap: space.md }}>
          <Step n={4} title="Пожелания" />
          <Field multiline placeholder="Например: латте на овсяном, без сахара" value={comment} onChangeText={setComment} maxLength={1000} />
        </View>

        <Card style={{ gap: space.md }}>
          <T v="h3">Ваша бронь</T>
          {lines.map((l, i) => (
            <View key={l.productId} style={{ gap: space.md }}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <ProductImage photoUrl={l.photoUrl} category={l.categoryName} seed={l.productId} style={{ width: 44, height: 44 }} iconSize={22} rounded={14} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>
                    {l.name}
                  </T>
                  <T v="small" color={colors.textSoft}>
                    {qtyText(l.qty, l.unit)} × {money(l.price)}
                    {l.promo ? ' · ☕ штамп' : ''}
                  </T>
                </View>
                <T v="bodyStrong">{money((l.price ?? 0) * l.qty)}</T>
              </View>
            </View>
          ))}
          {promo.free > 0 && (
            <>
              <Divider />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="gift" size={18} color={colors.coffee} />
                <T v="bodyStrong" color={colors.coffee} style={{ flex: 1 }}>
                  {promo.free === 1 ? 'Кофе в подарок' : `Кофе в подарок: ${promo.free}`}
                </T>
                <T v="bodyStrong" color={colors.coffee}>
                  −{money(promo.discount)}
                </T>
              </View>
            </>
          )}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="h3">Итого</T>
            <T v="h3" color={colors.mango}>
              {money(total)}
            </T>
          </View>
        </Card>

        {user && loyalty.data?.enabled && promo.free === 0 && lines.some((l) => l.promo) && (
          <View style={[styles.hint, { backgroundColor: colors.coffeeSoft }]}>
            <Icon name="gift" size={18} color={colors.coffee} />
            <T v="small" color={colors.coffee} style={{ flex: 1, fontFamily: fonts.semibold }}>
              После этой брони в карте будет {Math.min(loyalty.data.every - 1, loyalty.data.stamps + lines.filter((l) => l.promo).reduce((s, l) => s + Math.floor(l.qty), 0))} из {loyalty.data.every} штампов
            </T>
          </View>
        )}
        {!user && (
          <View style={[styles.hint, { backgroundColor: colors.iceCube }]}>
            <Icon name="phone" size={18} color={colors.blueberry} />
            <T v="small" color={colors.blueberry} style={{ flex: 1, fontFamily: fonts.semibold }}>
              Чтобы забронировать, войдите по номеру телефона — это 20 секунд. Корзина сохранится.
            </T>
          </View>
        )}
      </Screen>

      <BottomBar>
        {error && (
          <View style={styles.error}>
            <Icon name="info" size={18} color={colors.danger} />
            <T v="small" color={colors.danger} style={{ flex: 1, fontFamily: fonts.semibold }}>
              {error}
            </T>
          </View>
        )}
        <Button
          title={user ? (pay === 'QR' ? 'Забронировать и оплатить' : 'Забронировать') : 'Войти и забронировать'}
          loading={submitting}
          disabled={!!user && !slot}
          onPress={submit}
          right={
            <T v="small" color="rgba(255,255,255,0.85)" style={{ fontFamily: fonts.bold }}>
              · {money(total)}
            </T>
          }
        />
      </BottomBar>
    </View>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <View style={styles.stepTitle}>
      <View style={styles.stepNum}>
        <T v="caption" color={colors.white} style={{ fontFamily: fonts.extrabold }}>
          {n}
        </T>
      </View>
      <T v="h2">{title}</T>
    </View>
  );
}

function PartnerCheckout() {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const cartDate = useCart((s) => s.deliveryDate);
  const uid = useAuth((s) => s.user?.id ?? 'anon');
  const rules = useQuery(Q.rules(), { refetchOnFocus: false, staleTime: 10_000 });
  // Адреса показываем сразу из кэша и тихо сверяем (их могли поменять на экране «Адреса»).
  const addresses = useQuery(Q.addresses(uid), { staleTime: 0 });
  const cutoff = useCutoff(rules.data, 14);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('QR');
  const [submitting, setSubmitting] = useState(false);
  const partnerMethods: PaymentMethod[] = [
    ...(rules.data?.payment?.qr !== false ? (['QR'] as const) : []),
    'BANK',
    'CASH',
  ];
  const placed = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Дата выбирается ещё в корзине; если она уже недоступна (прошла отсечка) — ближайшая.
  const days = rules.data ? cutoff.days : [];
  const date = days.length ? (cartDate && days.includes(cartDate) ? cartDate : days[0]) : null;
  const setDate = (d: string) => useCart.getState().setDeliveryDate(d);

  // Адрес заранее не подставляем — выбирают сами: последние адреса под рукой, одно касание.
  const info = useQuery(Q.info(), { staleTime: 5 * 60_000 });
  const bakery = info.data?.bakeryLat != null && info.data?.bakeryLng != null ? { lat: info.data.bakeryLat, lng: info.data.bakeryLng } : null;
  const [picking, setPicking] = useState(false);
  const recents = addresses.data ?? [];
  const chosen = recents.find((a) => a.id === addressId) ?? null;

  const total = cartTotal(lines);
  const minSum = rules.data?.minOrderSum ?? 0;

  const onPicked = async (p: PickedAddress) => {
    try {
      if (p.id) {
        setAddressId(p.id);
      } else {
        // такой адрес уже есть — не плодим копии
        const same = recents.find((a) => a.address.trim().toLowerCase() === p.address.trim().toLowerCase());
        if (same) {
          const upd = await Addresses.update(same.id, { address: same.address, lat: p.lat, lng: p.lng, entrance: p.entrance || same.entrance || null });
          addresses.setData(recents.map((a) => (a.id === same.id ? { ...a, ...upd } : a)));
          setAddressId(same.id);
        } else {
          const a = await Addresses.create({ address: p.address, lat: p.lat, lng: p.lng, entrance: p.entrance || null });
          addresses.setData([a, ...recents]);
          setAddressId(a.id);
        }
      }
      setError(null);
      setPicking(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const submit = async () => {
    setError(null);
    if (!date) return setError('Выберите дату доставки');
    if (!addressId) {
      setPicking(true);
      return setError('Укажите, куда доставить');
    }
    setSubmitting(true);
    try {
      const order = await Orders.create({
        deliveryDate: date,
        addressId,
        paymentMethod: partnerMethods.includes(method) ? method : 'BANK',
        comment: comment.trim() || undefined,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      });
      placed.current = true;
      hapticSuccess();
      invalidateOrders();
      setCached(Q.order(order.id).key, order);
      router.replace({ pathname: '/order-success', params: { id: order.id, number: String(order.number), date: order.deliveryDate } });
      // Корзину чистим после перехода — без мелькания «пустой корзины».
      setTimeout(() => {
        clear();
        useCart.getState().setDeliveryDate(null);
      }, 400);
    } catch (e) {
      setError(errorMessage(e));
      rules.reload();
    } finally {
      setSubmitting(false);
    }
  };

  if (!lines.length) {
    if (placed.current) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
    return (
      <View style={{ flex: 1 }}>
        <Header title="Оформление" />
        <EmptyState icon="bag" title="Корзина пуста" text="Добавьте товары из каталога — и возвращайтесь." action="В каталог" onAction={() => goTab('/catalog')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Оформление заказа" />
      <Screen contentStyle={{ paddingBottom: 180, gap: space.xl }}>
        {/* Дата */}
        <View style={{ gap: space.md }}>
          <View style={styles.stepTitle}>
            <View style={styles.stepNum}>
              <T v="caption" color={colors.white} style={{ fontFamily: fonts.extrabold }}>
                1
              </T>
            </View>
            <T v="h2">Когда привезти</T>
          </View>
          {rules.loading ? (
            <Skeleton style={{ height: 84 }} />
          ) : rules.error ? (
            <ErrorState message={rules.error} onRetry={rules.refresh} />
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
                {days.map((d) => {
                  const c = dateChip(d);
                  const active = d === date;
                  const weekend = c.weekday === 'Сб' || c.weekday === 'Вс';
                  return (
                    <Touchable key={d} haptic onPress={() => setDate(d)} style={[styles.dateChip, active && styles.dateChipActive]} scaleTo={0.94}>
                      <T v="caption" color={active ? 'rgba(255,255,255,0.85)' : weekend ? colors.mango : colors.textSoft} style={{ fontFamily: fonts.bold }}>
                        {c.weekday}
                      </T>
                      <T v="h2" color={active ? colors.white : colors.text}>
                        {c.day}
                      </T>
                      <T v="caption" color={active ? 'rgba(255,255,255,0.85)' : colors.textSoft}>
                        {c.month}
                      </T>
                    </Touchable>
                  );
                })}
              </ScrollView>
              {date && (
                <View style={styles.hint}>
                  <Icon name="calendar" size={18} color={colors.cambodia} />
                  <T v="small" style={{ flex: 1, fontFamily: fonts.semibold }}>
                    {/^[0-9]/.test(dayLabel(date)) ? dateLong(date) : `${dayLabel(date)}, ${dateLong(date)}`}. Заказ на завтра принимаем до {rules.data?.cutoffTime}.
                  </T>
                </View>
              )}
            </>
          )}
        </View>

        {/* Адрес */}
        <View style={{ gap: space.md }}>
          <View style={styles.stepTitle}>
            <View style={styles.stepNum}>
              <T v="caption" color={colors.white} style={{ fontFamily: fonts.extrabold }}>
                2
              </T>
            </View>
            <T v="h2">Куда</T>
          </View>
          {addresses.loading ? (
            <Skeleton style={{ height: 64 }} />
          ) : chosen ? (
            <FadeIn key={chosen.id} offset={8}>
              <Touchable haptic onPress={() => setPicking(true)} style={[styles.addr, styles.addrActive]} scaleTo={0.98}>
                <View style={styles.addrIcon}>
                  <Icon name="pin" size={20} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{chosen.address}</T>
                  {!!chosen.entrance && (
                    <T v="small" color={colors.textMuted}>
                      {chosen.entrance}
                    </T>
                  )}
                </View>
                <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                  Изменить
                </T>
              </Touchable>
            </FadeIn>
          ) : (
            <View style={{ gap: space.sm }}>
              <Touchable haptic onPress={() => setPicking(true)} style={styles.where} scaleTo={0.98}>
                <Icon name="search" size={20} color={colors.textSoft} />
                <T v="body" color={colors.textSoft} style={{ flex: 1 }}>
                  Улица и номер дома
                </T>
              </Touchable>
              {recents.slice(0, 3).map((a, i) => (
                <FadeIn key={a.id} delay={i * 50} offset={6}>
                  <Touchable haptic onPress={() => (a.lat == null ? setPicking(true) : setAddressId(a.id))} style={styles.recent} scaleTo={0.98}>
                    <View style={styles.recentIcon}>
                      <Icon name="clock" size={16} color={colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong" numberOfLines={1}>
                        {a.address}
                      </T>
                      {!!a.entrance && (
                        <T v="small" color={colors.textMuted} numberOfLines={1}>
                          {a.entrance}
                        </T>
                      )}
                    </View>
                  </Touchable>
                </FadeIn>
              ))}
            </View>
          )}
        </View>

        {/* Оплата */}
        <View style={{ gap: space.md }}>
          <Step n={3} title="Как оплатите" />
          <PaymentPicker value={partnerMethods.includes(method) ? method : 'BANK'} onChange={setMethod} methods={partnerMethods} />
        </View>

        {/* Комментарий */}
        <View style={{ gap: space.md }}>
          <Step n={4} title="Пожелания" />
          <Field multiline placeholder="Например: привезти до 8:00, вход со двора" value={comment} onChangeText={setComment} maxLength={1000} />
        </View>

        {/* Состав */}
        <Card style={{ gap: space.md }}>
          <T v="h3">Ваш заказ</T>
          {lines.map((l, i) => (
            <View key={l.productId} style={{ gap: space.md }}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <ProductImage photoUrl={l.photoUrl} category={l.categoryName} seed={l.productId} style={{ width: 44, height: 44 }} iconSize={22} rounded={14} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>
                    {l.name}
                  </T>
                  <T v="small" color={colors.textSoft}>
                    {qtyText(l.qty, l.unit)} × {money(l.price)}
                  </T>
                </View>
                <T v="bodyStrong">{money((l.price ?? 0) * l.qty)}</T>
              </View>
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="h3">Итого</T>
            <T v="h3" color={colors.mango}>
              {money(total)}
            </T>
          </View>
          {minSum > total && (
            <T v="small" color={colors.danger}>
              Минимальная сумма заказа — {money(minSum)}
            </T>
          )}
        </Card>

        <View style={[styles.hint, { backgroundColor: colors.iceCube }]}>
          <Icon name="card" size={18} color={colors.blueberry} />
          <T v="small" color={colors.blueberry} style={{ flex: 1, fontFamily: fonts.semibold }}>
            {method === 'CASH'
              ? 'Менеджер подтвердит заказ — и он уйдёт в цех. Оплата наличными курьеру.'
              : 'После оформления покажем, как оплатить. Как только оплата придёт, менеджер подтвердит заказ — и он уйдёт в цех.'}
          </T>
        </View>
      </Screen>

      <BottomBar>
        {error && (
          <View style={styles.error}>
            <Icon name="info" size={18} color={colors.danger} />
            <T v="small" color={colors.danger} style={{ flex: 1, fontFamily: fonts.semibold }}>
              {error}
            </T>
          </View>
        )}
        <Button
          title="Оформить заказ"
          loading={submitting}
          disabled={!date}
          onPress={submit}
          right={
            <T v="small" color="rgba(255,255,255,0.85)" style={{ fontFamily: fonts.bold }}>
              · {money(total)}
            </T>
          }
        />
      </BottomBar>

      <AddressPicker visible={picking} recents={recents} near={bakery} onClose={() => setPicking(false)} onDone={onPicked} />
    </View>
  );
}

const styles = StyleSheet.create({
  stepTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChip: {
    width: 64,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dateChipActive: { backgroundColor: colors.mango, borderColor: colors.mango },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.softYellow,
    padding: space.md,
    borderRadius: radius.lg,
  },
  addr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  addrActive: { borderColor: colors.mango, backgroundColor: '#FFF8F4' },
  addrIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.mango, alignItems: 'center', justifyContent: 'center' },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 56,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  recent: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, paddingHorizontal: 4 },
  recentIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.mango },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mango },
  addAddr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.mango,
  },
  error: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    padding: space.md,
    borderRadius: radius.md,
  },
});
