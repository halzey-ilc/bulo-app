import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Orders } from '../../src/api';
import { NoOrderNote, PartnerStatusCard } from '../../src/components/gates';
import { Icon } from '../../src/components/Icon';
import { Screen, TAB_BAR_SPACE } from '../../src/components/layout';
import { ProductImage, Stepper } from '../../src/components/product';
import { Button, Card, EmptyState, T, Touchable } from '../../src/components/ui';
import { money, plural } from '../../src/lib/format';
import { useLoad } from '../../src/lib/useLoad';
import { useAuth } from '../../src/store/auth';
import { cartTotal, useCart } from '../../src/store/cart';
import { confirmDialog } from '../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const canOrder = !!user?.permissions.canOrder;
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);
  const rules = useLoad(() => Orders.rules(), [user?.id], { enabled: !!user });

  const total = cartTotal(lines);
  const minSum = rules.data?.minOrderSum ?? 0;
  const left = Math.max(0, minSum - total);
  const progress = minSum ? Math.min(1, total / minSum) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen withTabBar topInset contentStyle={{ paddingBottom: TAB_BAR_SPACE + 150 + insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <T v="display">Корзина</T>
            <T v="body" color={colors.textMuted}>
              {lines.length ? `${lines.length} ${plural(lines.length, 'позиция', 'позиции', 'позиций')}` : 'Пока пусто'}
            </T>
          </View>
          {lines.length > 0 && (
            <Touchable
              onPress={() =>
                confirmDialog({
                  title: 'Очистить корзину?',
                  message: 'Все товары будут удалены из корзины.',
                  confirmText: 'Очистить',
                  destructive: true,
                  onConfirm: clear,
                })
              }
              style={styles.clear}
            >
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
            {lines.map((l) => (
              <Card key={l.productId} style={styles.line}>
                <Touchable onPress={() => router.push(`/product/${l.productId}`)}>
                  <ProductImage photoUrl={l.photoUrl} category={l.categoryName} seed={l.productId} style={{ width: 76, height: 76 }} iconSize={34} rounded={18} />
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Stepper compact value={l.qty} step={l.multiplicity} unit={l.unit} onChange={(v) => setQty(l.productId, v)} />
                    <T v="h3" style={{ fontSize: 16 }}>
                      {money((l.price ?? 0) * l.qty)}
                    </T>
                  </View>
                </View>
              </Card>
            ))}

            {minSum > 0 && (
              <Card style={{ gap: space.sm, backgroundColor: left ? colors.softYellow : colors.greenSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Icon name={left ? 'info' : 'check'} size={20} color={colors.cambodia} />
                  <T v="bodyStrong" style={{ flex: 1 }}>
                    {left ? `Добавьте ещё на ${money(left)}` : 'Минимальная сумма набрана'}
                  </T>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                </View>
                <T v="small" color={colors.textMuted}>
                  Минимальный заказ — {money(minSum)}
                </T>
              </Card>
            )}
          </>
        )}
      </Screen>

      {lines.length > 0 && (
        <View style={[styles.summary, { bottom: TAB_BAR_SPACE - 18 + insets.bottom }]}>
          <View style={{ flex: 1 }}>
            <T v="small" color="rgba(249,245,230,0.7)">
              Итого
            </T>
            <T v="h2" color={colors.oatMilk}>
              {money(total)}
            </T>
          </View>
          <Button
            title="Оформить"
            icon="arrowRight"
            disabled={!canOrder || left > 0}
            onPress={() => router.push('/checkout')}
            style={{ paddingHorizontal: space.xl }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  line: { flexDirection: 'row', gap: space.md, padding: space.md },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.7)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.mango },
  summary: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.cambodia,
    borderRadius: radius.xxl,
    padding: space.md,
    paddingLeft: space.xl,
    ...shadows.float,
  },
});
