import React, { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoOrderNote, PartnerStatusCard } from '../../src/components/gates';
import { Icon } from '../../src/components/Icon';
import { Screen, TAB_BAR_SPACE } from '../../src/components/layout';
import { FadeIn, ProgressBar, SwipeToDelete } from '../../src/components/motion';
import { ProductCard, ProductImage, Stepper } from '../../src/components/product';
import { Button, Card, EmptyState, hapticImpact, T, Touchable } from '../../src/components/ui';
import { useCutoff } from '../../src/lib/cutoff';
import { dateChip, dayLabel, money, plural } from '../../src/lib/format';
import { frequentProducts, Q, useQuery } from '../../src/lib/queries';
import { useAuth } from '../../src/store/auth';
import { CartLine, cartTotal, useCart } from '../../src/store/cart';
import { toast } from '../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

/** Удаление с возможностью вернуть. */
function removeWithUndo(productId: string) {
  const taken = useCart.getState().take(productId);
  if (!taken) return;
  hapticImpact(true);
  toast.undo(`«${taken.line.name}» удалён из корзины`, () => useCart.getState().restore(taken.line, taken.index));
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const uid = user?.id ?? 'anon';
  const canOrder = !!user?.permissions.canOrder;
  const lines = useCart((s) => s.lines);
  const chosenDate = useCart((s) => s.deliveryDate);
  const rules = useQuery(Q.rules());
  const products = useQuery(Q.products(uid), { staleTime: 60_000, refetchOnFocus: false });
  const orders = useQuery(Q.orders(uid), { enabled: !!user, refetchOnFocus: false });
  const cutoff = useCutoff(rules.data, 7);

  const total = cartTotal(lines);
  const minSum = rules.data?.minOrderSum ?? 0;
  const left = Math.max(0, minSum - total);
  const progress = minSum ? Math.min(1, total / minSum) : 1;
  const date = chosenDate && chosenDate >= cutoff.earliest ? chosenDate : cutoff.earliest;

  // «Добавить к заказу»: то, что обычно берёте (или новинки), чего ещё нет в корзине.
  const suggestions = useMemo(() => {
    const inCart = new Set(lines.map((l) => l.productId));
    const freq = frequentProducts(orders.data, products.data, 12);
    const base = freq.length ? freq : (products.data ?? []).filter((p) => p.isNew);
    return base.filter((p) => !inCart.has(p.id) && p.price != null).slice(0, 6);
  }, [lines, orders.data, products.data]);

  const clearAll = () => {
    const snapshot = useCart.getState().lines;
    useCart.getState().clear();
    hapticImpact(true);
    toast.undo('Корзина очищена', () => useCart.getState().replace(snapshot));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen withTabBar topInset contentStyle={{ paddingBottom: TAB_BAR_SPACE + 150 + insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <T v="display">Корзина</T>
            <T v="body" color={colors.textMuted}>
              {lines.length ? `${lines.length} ${plural(lines.length, 'позиция', 'позиции', 'позиций')} · ${money(total)}` : 'Пока пусто'}
            </T>
          </View>
          {lines.length > 0 && (
            <Touchable onPress={clearAll} style={styles.clear} hitSlop={6}>
              <Icon name="trash" size={16} color={colors.textMuted} />
              <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.semibold }}>
                Очистить
              </T>
            </Touchable>
          )}
        </View>

        {user && <PartnerStatusCard user={user} />}
        {user?.role === 'GUEST' && !canOrder && <NoOrderNote />}

        {!lines.length ? (
          <EmptyState
            icon="bag"
            title="В корзине пока пусто"
            text="Загляните в каталог — синнабоны уже ждут своей очереди в печь."
            action="В каталог"
            onAction={() => router.navigate('/catalog')}
          />
        ) : (
          <>
            {/* Когда привезти — даты с учётом времени приёма */}
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="calendar" size={20} color={colors.mango} />
                <T v="h3" style={{ flex: 1 }}>
                  Доставка {dayLabel(date).toLowerCase()}
                </T>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -space.lg }}
                contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
              >
                {cutoff.days.map((d) => {
                  const c = dateChip(d);
                  const active = d === date;
                  const weekend = c.weekday === 'Сб' || c.weekday === 'Вс';
                  return (
                    <Touchable
                      key={d}
                      haptic
                      onPress={() => useCart.getState().setDeliveryDate(d)}
                      style={[styles.dateChip, active && styles.dateChipActive]}
                      scaleTo={0.94}
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${dayLabel(d)}, ${c.day} ${c.month}`}
                    >
                      <T v="caption" color={active ? 'rgba(255,255,255,0.85)' : weekend ? colors.mango : colors.textSoft} style={{ fontFamily: fonts.bold }}>
                        {d === cutoff.earliest && cutoff.open ? 'Завтра' : c.weekday}
                      </T>
                      <T v="h3" color={active ? colors.white : colors.text}>
                        {c.day}
                      </T>
                      <T v="caption" color={active ? 'rgba(255,255,255,0.85)' : colors.textSoft}>
                        {c.month}
                      </T>
                    </Touchable>
                  );
                })}
              </ScrollView>
              <View style={[styles.countdown, cutoff.urgent && { backgroundColor: colors.primarySoft }, !cutoff.open && { backgroundColor: colors.iceCube }]}>
                <Icon name={cutoff.open ? 'clock' : 'info'} size={16} color={cutoff.urgent ? colors.mango : cutoff.open ? colors.cambodia : colors.blueberry} />
                <T
                  v="small"
                  style={{ flex: 1, fontFamily: fonts.semibold }}
                  color={cutoff.urgent ? colors.mango : cutoff.open ? colors.text : colors.blueberry}
                >
                  {cutoff.text}
                </T>
              </View>
            </Card>

            {lines.map((l, i) => (
              <FadeIn key={l.productId} delay={Math.min(i, 6) * 40}>
                <SwipeToDelete onDelete={() => removeWithUndo(l.productId)}>
                  <CartRow line={l} />
                </SwipeToDelete>
              </FadeIn>
            ))}
            <T v="caption" color={colors.textSoft} center style={{ marginTop: -space.sm }}>
              Смахните позицию влево, чтобы удалить
            </T>

            {minSum > 0 && (
              <Card style={{ gap: space.sm, backgroundColor: left ? colors.softYellow : colors.greenSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Icon name={left ? 'info' : 'check'} size={20} color={colors.cambodia} />
                  <T v="bodyStrong" style={{ flex: 1 }}>
                    {left ? `Добавьте ещё на ${money(left)}` : 'Минимальная сумма набрана'}
                  </T>
                  <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
                    {Math.round(progress * 100)}%
                  </T>
                </View>
                <ProgressBar value={progress} color={left ? colors.mango : colors.success} />
                <T v="small" color={colors.textMuted}>
                  Минимальный заказ — {money(minSum)}
                </T>
              </Card>
            )}

            {canOrder && suggestions.length > 0 && (
              <View style={{ gap: space.md }}>
                <T v="h3">{left ? 'Добавить к заказу' : 'Не забыли?'}</T>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -space.lg }}
                  contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, paddingVertical: 4 }}
                >
                  {suggestions.map((p) => (
                    <ProductCard key={p.id} product={p} canOrder={canOrder} width={156} />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </Screen>

      {lines.length > 0 && (
        <View style={[styles.summary, { bottom: TAB_BAR_SPACE - 18 + insets.bottom }]}>
          <View style={{ flex: 1 }}>
            <T v="small" color="rgba(249,245,230,0.7)">
              Итого · {dayLabel(date).toLowerCase()}
            </T>
            <T v="h2" color={colors.oatMilk}>
              {money(total)}
            </T>
          </View>
          <Button
            title={left > 0 ? `Ещё ${money(left)}` : 'Оформить'}
            icon={left > 0 ? 'plus' : 'arrowRight'}
            kind={left > 0 ? 'light' : 'primary'}
            disabled={!canOrder}
            onPress={() =>
              left > 0
                ? toast.info(`Минимальный заказ — ${money(minSum)}. Добавьте ещё на ${money(left)}`)
                : router.push('/checkout')
            }
          />
        </View>
      )}
    </View>
  );
}

const CartRow = memo(function CartRow({ line: l }: { line: CartLine }) {
  return (
    <Card style={styles.line}>
      <Touchable onPress={() => router.push(`/product/${l.productId}`)}>
        <ProductImage photoUrl={l.photoUrl} category={l.categoryName} seed={l.productId} style={{ width: 64, height: 64 }} iconSize={28} rounded={16} />
      </Touchable>
      <View style={{ flex: 1, gap: 6 }}>
        <View>
          <T v="bodyStrong" numberOfLines={2}>
            {l.name}
          </T>
          <T v="small" color={colors.textSoft}>
            {l.price != null ? `${money(l.price)} / ${l.unit}` : 'цена уточняется'} · по {l.multiplicity}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Stepper
            compact
            value={l.qty}
            step={l.multiplicity}
            unit={l.unit}
            onChange={(v) => (v <= 0 ? removeWithUndo(l.productId) : useCart.getState().setQty(l.productId, v))}
          />
          <T v="h3" style={{ fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
            {money((l.price ?? 0) * l.qty)}
          </T>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 44 },
  line: { flexDirection: 'row', gap: space.md, padding: space.md },
  dateChip: {
    width: 54,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.oatMilk,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dateChipActive: { backgroundColor: colors.mango, borderColor: colors.mango },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.oatMilk,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  summary: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.cambodia,
    borderRadius: radius.xl,
    padding: space.sm,
    paddingLeft: space.lg,
    ...shadows.float,
  },
});
