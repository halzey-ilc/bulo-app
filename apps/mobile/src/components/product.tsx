import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Animated, GestureResponderEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import type { Product } from '../api';
import { photoSrc } from '../api/admin';
import { money } from '../lib/format';
import { goTab } from '../lib/nav';
import { normalizeQty, useCart, useInCart } from '../store/cart';
import { useIsFavorite, usePrefs } from '../store/prefs';
import { toast, useUi } from '../store/ui';
import { colors, fonts, radius, shadows, space, tileFor } from '../theme';
import { categoryIcon, Icon } from './Icon';
import { hapticImpact, hapticSuccess, T, Touchable } from './ui';

/** Фото товара или фирменная заглушка: мягкая цветная плитка + линейная иконка выпечки. */
export const ProductImage = memo(function ProductImage({
  photoUrl,
  category,
  seed,
  style,
  iconSize = 64,
  rounded = radius.lg,
}: {
  photoUrl?: string | null;
  category?: string | null;
  seed?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  rounded?: number;
}) {
  // Цвет плитки — по товару (разнообразие в сетке), иконка — по категории.
  const tile = tileFor(seed ?? category);
  // сервер отдаёт ссылки с localhost — подставляем адрес сервера, к которому подключено приложение
  const uri = photoSrc(photoUrl);
  if (uri) {
    return (
      <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: tile.bg }, style]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          recyclingKey={uri}
        />
      </View>
    );
  }
  return (
    <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: tile.bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      {/* Декоративные «крошки» */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Circle cx={84} cy={16} r={22} fill="#FFFFFF" opacity={0.35} />
        <Circle cx={10} cy={92} r={16} fill="#FFFFFF" opacity={0.3} />
        <Circle cx={22} cy={18} r={2.2} fill={tile.fg} opacity={0.25} />
        <Circle cx={78} cy={80} r={2.6} fill={tile.fg} opacity={0.22} />
        <Circle cx={88} cy={58} r={1.6} fill={tile.fg} opacity={0.25} />
      </Svg>
      <Icon name={categoryIcon(category)} size={iconSize} color={tile.fg} strokeWidth={1.4} />
    </View>
  );
});

export function NewBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.newBadge, style]}>
      <Icon name="sparkle" size={12} color={colors.cambodia} strokeWidth={2} />
      <T v="caption" style={{ fontFamily: fonts.extrabold }}>
        NEW
      </T>
    </View>
  );
}

/**
 * Добавление в корзину: тактильный отклик, «полёт» к корзине (если известна точка касания)
 * или короткое сообщение со ссылкой на корзину.
 */
export function useAddToCart() {
  return useCallback((p: Product, qty?: number, e?: GestureResponderEvent | { toast: true }) => {
    useCart.getState().add(
      {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        multiplicity: p.multiplicity,
        price: p.price,
        photoUrl: p.photoUrl,
        categoryName: p.category?.name,
      },
      qty ?? normalizeQty(p.multiplicity || 1, p.multiplicity),
    );
    hapticSuccess();
    const ne = e && 'nativeEvent' in e ? e.nativeEvent : undefined;
    if (ne && ne.pageX != null) {
      useUi.getState().flyToCart(ne.pageX, ne.pageY);
    } else {
      useUi.getState().bumpCart();
      toast.success(`«${p.name}» в корзине`, { label: 'Открыть', onPress: () => goTab('/cart') });
    }
  }, []);
}

/** Сердечко «в избранное» с пружинкой. */
export function FavoriteButton({ productId, size = 34, style }: { productId: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const fav = useIsFavorite(productId);
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 16 }).start();
  }, [fav, scale]);
  return (
    <Touchable
      hitSlop={8}
      scaleTo={0.85}
      onPress={() => {
        const now = usePrefs.getState().toggleFavorite(productId);
        hapticImpact(now);
      }}
      accessibilityRole="button"
      accessibilityLabel={fav ? 'Убрать из избранного' : 'В избранное'}
      accessibilityState={{ selected: fav }}
      style={[styles.fav, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon
          name="heart"
          size={Math.round(size * 0.53)}
          color={fav ? colors.mango : colors.textMuted}
          fill={fav ? colors.mango : 'none'}
          strokeWidth={2}
        />
      </Animated.View>
    </Touchable>
  );
}

export const ProductCard = memo(function ProductCard({
  product,
  canOrder,
  width,
}: {
  product: Product;
  canOrder: boolean;
  width?: number;
}) {
  const addToCart = useAddToCart();
  const inCart = useInCart(product.id);
  const step = product.multiplicity || 1;
  return (
    <Touchable
      onPress={() => router.push(`/product/${product.id}`)}
      style={[styles.card, width ? { width } : { flex: 1 }]}
      scaleTo={0.97}
      accessibilityLabel={product.name}
    >
      <View>
        <ProductImage
          photoUrl={product.photoUrl}
          category={product.category?.name}
          seed={product.id}
          style={{ aspectRatio: 1, width: '100%' }}
          rounded={radius.lg}
        />
        {product.isNew && <NewBadge style={{ position: 'absolute', top: 8, left: 8 }} />}
        <FavoriteButton productId={product.id} style={{ position: 'absolute', top: 6, right: 6 }} />
      </View>
      <View style={{ paddingHorizontal: 4, paddingTop: 10, gap: 2, flex: 1 }}>
        <T v="bodyStrong" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, minHeight: 38 }}>
          {product.name}
        </T>
        <T v="small" color={colors.textSoft} numberOfLines={1}>
          {[product.weight, `по ${product.multiplicity} ${product.unit}`].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={styles.cardFoot}>
        {product.price != null ? (
          inCart > 0 && canOrder ? null : (
            <T v="h3" style={{ fontSize: 16 }} numberOfLines={1}>
              {money(product.price)}
            </T>
          )
        ) : (
          <View style={styles.lockPrice}>
            <Icon name="key" size={14} color={colors.mango} />
            <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
              Цена после входа
            </T>
          </View>
        )}
        {product.price != null && canOrder && (
          inCart > 0 ? (
            <View style={styles.miniStepper}>
              <Touchable
                haptic
                hitSlop={6}
                onPress={() => useCart.getState().setQty(product.id, Math.round((inCart - step) * 1000) / 1000)}
                style={styles.miniBtn}
                accessibilityLabel="Меньше"
              >
                <Icon name={inCart - step <= 0 ? 'trash' : 'minus'} size={16} color={colors.white} strokeWidth={2.2} />
              </Touchable>
              <T v="bodyStrong" color={colors.white} style={{ fontFamily: fonts.extrabold, minWidth: 28, textAlign: 'center' }}>
                {String(inCart).replace('.', ',')}
              </T>
              <Touchable
                hitSlop={6}
                onPress={(e) => addToCart(product, step, e)}
                style={styles.miniBtn}
                accessibilityLabel="Больше"
              >
                <Icon name="plus" size={16} color={colors.white} strokeWidth={2.2} />
              </Touchable>
            </View>
          ) : (
            <Touchable
              hitSlop={6}
              onPress={(e) => addToCart(product, undefined, e)}
              style={styles.addBtn}
              accessibilityLabel={`Добавить «${product.name}» в корзину`}
            >
              <Icon name="plus" size={20} color={colors.white} strokeWidth={2.2} />
            </Touchable>
          )
        )}
      </View>
    </Touchable>
  );
});

export function ProductCardSkeleton() {
  return (
    <View style={[styles.card, { flex: 1 }]}>
      <View style={{ aspectRatio: 1, borderRadius: radius.lg, backgroundColor: 'rgba(38,66,43,0.06)' }} />
      <View style={{ height: 14, width: '80%', marginTop: 12, borderRadius: 6, backgroundColor: 'rgba(38,66,43,0.06)' }} />
      <View style={{ height: 12, width: '50%', marginTop: 8, borderRadius: 6, backgroundColor: 'rgba(38,66,43,0.06)' }} />
      <View style={{ height: 18, width: '40%', marginTop: 14, borderRadius: 6, backgroundColor: 'rgba(38,66,43,0.06)' }} />
    </View>
  );
}

/** Степпер количества: шаг = кратность. */
export function Stepper({
  value,
  step,
  unit,
  onChange,
  min = 0,
  compact,
}: {
  value: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  min?: number;
  compact?: boolean;
}) {
  const s = step > 0 ? step : 1;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const h = compact ? 36 : 44;
  return (
    <View style={[styles.stepper, { height: h, borderRadius: h / 2 }]}>
      <Touchable
        haptic
        hitSlop={4}
        onPress={() => onChange(Math.max(min, round(value - s)))}
        style={[styles.stepBtn, { width: h - 8, height: h - 8 }]}
        accessibilityLabel="Меньше"
      >
        <Icon name={min === 0 && value - s <= 0 ? 'trash' : 'minus'} size={compact ? 16 : 20} color={colors.text} />
      </Touchable>
      <View style={{ minWidth: compact ? 48 : 60, alignItems: 'center' }}>
        <T v={compact ? 'bodyStrong' : 'h3'} style={{ fontFamily: fonts.extrabold }}>
          {String(round(value)).replace('.', ',')}
        </T>
        {!compact && (
          <T v="caption" color={colors.textSoft}>
            {unit}
          </T>
        )}
      </View>
      <Touchable
        haptic
        hitSlop={4}
        onPress={() => onChange(round(value + s))}
        style={[styles.stepBtn, { width: h - 8, height: h - 8, backgroundColor: colors.mango }]}
        accessibilityLabel="Больше"
      >
        <Icon name="plus" size={compact ? 16 : 20} color={colors.white} strokeWidth={2} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 8,
    paddingBottom: 12,
    ...shadows.soft,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 8,
    minHeight: 42,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cambodia,
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 2,
  },
  miniBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.lime,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  fav: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.oatMilk,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtn: {
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { space };
