import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import type { Product } from '../api';
import { money } from '../lib/format';
import { normalizeQty, useCart } from '../store/cart';
import { toast } from '../store/ui';
import { colors, fonts, radius, shadows, space, tileFor } from '../theme';
import { categoryIcon, Icon } from './Icon';
import { T, Touchable } from './ui';

/** Фото товара или фирменная заглушка: мягкая цветная плитка + линейная иконка выпечки. */
export function ProductImage({
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
  if (photoUrl) {
    return (
      <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: tile.bg }, style]}>
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
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
}

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

export function useAddToCart() {
  const add = useCart((s) => s.add);
  return (p: Product, qty?: number) => {
    add(
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
    toast.success(`«${p.name}» в корзине`);
  };
}

export function ProductCard({
  product,
  canOrder,
  width,
}: {
  product: Product;
  canOrder: boolean;
  width?: number;
}) {
  const addToCart = useAddToCart();
  const inCart = useCart((s) => s.lines.find((l) => l.productId === product.id)?.qty ?? 0);
  return (
    <Touchable
      onPress={() => router.push(`/product/${product.id}`)}
      style={[styles.card, width ? { width } : { flex: 1 }]}
      scaleTo={0.97}
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
        {inCart > 0 && (
          <View style={styles.inCart}>
            <Icon name="check" size={12} color={colors.white} strokeWidth={2.4} />
            <T v="caption" color={colors.white} style={{ fontFamily: fonts.extrabold }}>
              {inCart}
            </T>
          </View>
        )}
      </View>
      <View style={{ paddingHorizontal: 4, paddingTop: 10, gap: 2, flex: 1 }}>
        <T v="bodyStrong" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19 }}>
          {product.name}
        </T>
        <T v="small" color={colors.textSoft} numberOfLines={1}>
          {[product.weight, `по ${product.multiplicity} ${product.unit}`].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={styles.cardFoot}>
        {product.price != null ? (
          <T v="h3" style={{ fontSize: 16 }}>
            {money(product.price)}
          </T>
        ) : (
          <View style={styles.lockPrice}>
            <Icon name="key" size={14} color={colors.mango} />
            <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
              Цена после входа
            </T>
          </View>
        )}
        {product.price != null && canOrder && (
          <Touchable
            haptic
            onPress={() => addToCart(product)}
            style={styles.addBtn}
            accessibilityLabel="Добавить в корзину"
          >
            <Icon name="plus" size={20} color={colors.white} strokeWidth={2.2} />
          </Touchable>
        )}
      </View>
    </Touchable>
  );
}

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
  const h = compact ? 38 : 52;
  return (
    <View style={[styles.stepper, { height: h, borderRadius: h / 2 }]}>
      <Touchable
        haptic
        onPress={() => onChange(Math.max(min, round(value - s)))}
        style={[styles.stepBtn, { width: h - 8, height: h - 8 }]}
        accessibilityLabel="Меньше"
      >
        <Icon name={min === 0 && value - s <= 0 ? 'trash' : 'minus'} size={compact ? 16 : 20} color={colors.text} />
      </Touchable>
      <View style={{ minWidth: compact ? 52 : 60, alignItems: 'center' }}>
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
    paddingTop: 10,
    minHeight: 46,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mango,
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
  inCart: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.cambodia,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
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
