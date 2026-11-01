import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Catalog } from '../../src/api';
import { NoOrderNote, PartnerStatusCard, SignInCta } from '../../src/components/gates';
import { Icon, IconName } from '../../src/components/Icon';
import { BottomBar } from '../../src/components/layout';
import { NewBadge, ProductImage, Stepper, useAddToCart } from '../../src/components/product';
import { Button, ErrorState, Skeleton, T, Touchable } from '../../src/components/ui';
import { money } from '../../src/lib/format';
import { goTab } from '../../src/lib/nav';
import { useLoad } from '../../src/lib/useLoad';
import { useAuth } from '../../src/store/auth';
import { useCart, useCartCount } from '../../src/store/cart';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const canOrder = !!user?.permissions.canOrder;
  const { data: p, error, loading, refresh } = useLoad(() => Catalog.product(id), [id, user?.id], { refetchOnFocus: false });
  const inCart = useCart((s) => s.lines.find((l) => l.productId === id)?.qty ?? 0);
  const cartCount = useCartCount();
  const addToCart = useAddToCart();
  const [qty, setQty] = useState(0);

  useEffect(() => {
    if (p) setQty(p.multiplicity || 1);
  }, [p]);

  const back = (
    <Touchable
      haptic
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/catalog'))}
      style={[styles.floatBtn, { top: insets.top + 8, left: space.lg }]}
      accessibilityLabel="Назад"
    >
      <Icon name="chevronLeft" size={22} />
    </Touchable>
  );

  if (loading || !p) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {error ? (
          <View style={{ paddingTop: insets.top + 80 }}>
            <ErrorState message={error} onRetry={refresh} />
          </View>
        ) : (
          <View style={{ gap: space.lg }}>
            <Skeleton style={{ height: 380, borderRadius: 0 }} />
            <View style={{ padding: space.lg, gap: space.md }}>
              <Skeleton style={{ height: 28, width: '70%' }} />
              <Skeleton style={{ height: 16, width: '40%' }} />
              <Skeleton style={{ height: 80 }} />
            </View>
          </View>
        )}
        {back}
      </View>
    );
  }

  const facts: { icon: IconName; label: string; value: string }[] = [
    p.weight ? { icon: 'leaf', label: 'Вес', value: p.weight } : null,
    p.shelfLife ? { icon: 'clock', label: 'Хранение', value: p.shelfLife } : null,
    { icon: 'box', label: 'Кратность', value: `${p.multiplicity} ${p.unit}` },
  ].filter(Boolean) as { icon: IconName; label: string; value: string }[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 200 }}>
        <ProductImage
          photoUrl={p.photoUrl}
          category={p.category?.name}
          seed={p.id}
          style={{ height: 380 + insets.top, width: '100%' }}
          iconSize={150}
          rounded={0}
        />
        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={styles.catPill}>
              <T v="caption" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
                {p.category?.name?.toUpperCase()}
              </T>
            </View>
            {p.isNew && <NewBadge />}
          </View>
          <T v="display" style={{ fontSize: 28, lineHeight: 34 }}>
            {p.name}
          </T>
          {p.price != null && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <T v="h1" color={colors.mango}>
                {money(p.price)}
              </T>
              <T v="body" color={colors.textSoft}>
                за 1 {p.unit}
              </T>
            </View>
          )}
          {!!p.description && (
            <T v="body" color={colors.textMuted} style={{ fontSize: 16, lineHeight: 24 }}>
              {p.description}
            </T>
          )}

          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Icon name={f.icon} size={20} color={colors.mango} />
                <T v="caption" color={colors.textSoft}>
                  {f.label}
                </T>
                <T v="bodyStrong" center style={{ fontSize: 14 }}>
                  {f.value}
                </T>
              </View>
            ))}
          </View>

          {!!p.composition && (
            <View style={styles.block}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="wheat" size={20} color={colors.cambodia} />
                <T v="h3">Состав</T>
              </View>
              <T v="body" color={colors.textMuted} style={{ lineHeight: 22 }}>
                {p.composition}
              </T>
            </View>
          )}

          {!user && <SignInCta />}
          {user && <PartnerStatusCard user={user} />}
          {user?.role === 'GUEST' && !canOrder && <NoOrderNote />}
        </View>
      </ScrollView>

      {back}
      {canOrder && (
        <Touchable haptic onPress={() => goTab('/cart')} style={[styles.floatBtn, { top: insets.top + 8, right: space.lg }]} accessibilityLabel="Корзина">
          <Icon name="bag" size={22} />
          {cartCount > 0 && (
            <View style={styles.dot}>
              <T v="caption" color={colors.white} style={{ fontFamily: fonts.extrabold, fontSize: 10 }}>
                {cartCount}
              </T>
            </View>
          )}
        </Touchable>
      )}

      {canOrder && p.price != null && (
        <BottomBar>
          {inCart > 0 && (
            <T v="small" color={colors.textMuted} center>
              Уже в корзине: {inCart} {p.unit}
            </T>
          )}
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Stepper value={qty} step={p.multiplicity} unit={p.unit} min={p.multiplicity || 1} onChange={setQty} />
            <Button
              title="В корзину"
              style={{ flex: 1 }}
              onPress={() => addToCart(p, qty)}
              right={
                <T v="small" color="rgba(255,255,255,0.85)" style={{ fontFamily: fonts.bold }}>
                  {money(p.price * qty)}
                </T>
              }
            />
          </View>
        </BottomBar>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  floatBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  dot: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  sheet: {
    marginTop: -32,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: space.xl,
    gap: space.md,
  },
  catPill: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  facts: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  fact: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: 6,
  },
  block: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.sm },
});
