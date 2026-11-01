import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Addresses, errorMessage, Orders } from '../src/api';
import { Icon } from '../src/components/Icon';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { ProductImage } from '../src/components/product';
import { Button, Card, Divider, ErrorState, Field, Skeleton, T, Touchable } from '../src/components/ui';
import { addDaysIso, dateChip, dateLong, dayLabel, money, qtyText } from '../src/lib/format';
import { goTab } from '../src/lib/nav';
import { useLoad } from '../src/lib/useLoad';
import { cartTotal, useCart } from '../src/store/cart';
import { confirmDialog, toast } from '../src/store/ui';
import { colors, fonts, radius, space } from '../src/theme';

export default function Checkout() {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const rules = useLoad(() => Orders.rules(), [], { refetchOnFocus: false });
  const addresses = useLoad(() => Addresses.list(), []);
  const [date, setDate] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = rules.data?.earliestDeliveryDate;
    if (!start) return [];
    return Array.from({ length: 14 }, (_, i) => addDaysIso(start, i));
  }, [rules.data?.earliestDeliveryDate]);

  useEffect(() => {
    if (days.length && !date) setDate(days[0]);
  }, [days, date]);

  useEffect(() => {
    const list = addresses.data;
    if (list?.length && (!addressId || !list.some((a) => a.id === addressId))) {
      setAddressId((list.find((a) => a.isDefault) ?? list[0]).id);
    }
  }, [addresses.data, addressId]);

  const total = cartTotal(lines);
  const minSum = rules.data?.minOrderSum ?? 0;

  const addAddress = () =>
    confirmDialog({
      title: 'Новый адрес',
      message: 'Улица, дом, ориентир — чтобы курьер нашёл вас быстрее.',
      input: { placeholder: 'г. Бишкек, ул. Киевская, 95', required: true },
      confirmText: 'Сохранить',
      onConfirm: async (address) => {
        const a = await Addresses.create({ address, isDefault: !addresses.data?.length });
        addresses.setData([...(addresses.data ?? []), a]);
        setAddressId(a.id);
        toast.success('Адрес добавлен');
      },
    });

  const submit = async () => {
    setError(null);
    if (!date) return setError('Выберите дату доставки');
    if (!addressId) return setError('Добавьте адрес доставки');
    setSubmitting(true);
    try {
      const order = await Orders.create({
        deliveryDate: date,
        addressId,
        comment: comment.trim() || undefined,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      });
      clear();
      router.replace({ pathname: '/order-success', params: { id: order.id, number: String(order.number), date: order.deliveryDate } });
    } catch (e) {
      setError(errorMessage(e));
      rules.reload();
    } finally {
      setSubmitting(false);
    }
  };

  if (!lines.length) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Оформление" />
        <ErrorState message="Корзина пуста — добавьте товары из каталога." onRetry={() => goTab('/catalog')} />
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
                    {dayLabel(date)}, {dateLong(date)}. Заказ на завтра принимаем до {rules.data?.cutoffTime}.
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
          ) : (
            <View style={{ gap: space.sm }}>
              {(addresses.data ?? []).map((a) => {
                const active = a.id === addressId;
                return (
                  <Touchable key={a.id} haptic onPress={() => setAddressId(a.id)} style={[styles.addr, active && styles.addrActive]} scaleTo={0.98}>
                    <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                    <View style={{ flex: 1 }}>
                      {!!a.label && (
                        <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                          {a.label.toUpperCase()}
                        </T>
                      )}
                      <T v="bodyStrong">{a.address}</T>
                    </View>
                    <Icon name="pin" size={20} color={active ? colors.mango : colors.textSoft} />
                  </Touchable>
                );
              })}
              <Touchable onPress={addAddress} style={styles.addAddr} haptic>
                <Icon name="plus" size={18} color={colors.mango} strokeWidth={2} />
                <T v="bodyStrong" color={colors.mango}>
                  {addresses.data?.length ? 'Другой адрес' : 'Добавить адрес доставки'}
                </T>
              </Touchable>
            </View>
          )}
        </View>

        {/* Комментарий */}
        <View style={{ gap: space.md }}>
          <View style={styles.stepTitle}>
            <View style={styles.stepNum}>
              <T v="caption" color={colors.white} style={{ fontFamily: fonts.extrabold }}>
                3
              </T>
            </View>
            <T v="h2">Пожелания</T>
          </View>
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
            Оплата — после одобрения заказа менеджером. Способ оплаты уточняется, менеджер свяжется с вами.
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
          disabled={!date || !addressId}
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
