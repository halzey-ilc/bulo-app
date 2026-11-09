import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsCafe } from '../lib/branch';
import { useAuth } from '../store/auth';
import { useCartCount } from '../store/cart';
import { useUi } from '../store/ui';
import { colors, fonts, shadows } from '../theme';
import { Icon, IconName } from './Icon';
import { Badge, T, Touchable } from './ui';

export const TAB_META: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Главная' },
  catalog: { icon: 'grid', label: 'Каталог' },
  cart: { icon: 'bag', label: 'Корзина' },
  orders: { icon: 'receipt', label: 'Заказы' },
  deliveries: { icon: 'truck', label: 'Доставки' },
  workshop: { icon: 'chef', label: 'Цех' },
  profile: { icon: 'user', label: 'Профиль' },
  dashboard: { icon: 'sparkle', label: 'Пульт' },
  people: { icon: 'shop', label: 'Люди' },
  payments: { icon: 'card', label: 'Оплаты' },
  reports: { icon: 'star', label: 'Отчёты' },
};

const PILL_W = 52;

/**
 * Нижняя панель: белая «подложка» со скруглением, центральная приподнятая кнопка корзины,
 * «едущая» подсветка активной вкладки и подпрыгивание корзины при добавлении товара.
 * Порядок вкладок задаёт `order` (зависит от роли).
 */
export function TabBar({
  state,
  emitter,
  navigateToTab,
  order,
  profileLabel,
}: BottomTabBarProps & { order: string[]; profileLabel: string }) {
  const insets = useSafeAreaInsets();
  const focusedName = state.routes[state.index]?.name;
  const routes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is (typeof state.routes)[number] => !!r);
  const [width, setWidth] = useState(0);
  const focusedIdx = routes.findIndex((r) => r.name === focusedName);
  const pos = useRef(new Animated.Value(Math.max(0, focusedIdx))).current;
  const cartFocused = focusedName === 'cart';
  const cafeMenu = useIsCafe();
  const cashierTab = useAuth((s) => s.user?.role === 'CASHIER');

  useEffect(() => {
    if (focusedIdx >= 0) Animated.spring(pos, { toValue: focusedIdx, useNativeDriver: true, speed: 16, bounciness: 7 }).start();
  }, [focusedIdx, pos]);

  const press = (key: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(key);
  };

  const inner = width - 16;
  const itemW = routes.length ? inner / routes.length : 0;
  const pb = Math.max(insets.bottom, 10);

  return (
    <>
      <View style={[styles.wrap, { paddingBottom: pb }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && routes.length > 1 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                bottom: pb + 2 + 14 + 2,
                opacity: cartFocused ? 0 : 1,
                transform: [
                  {
                    translateX: pos.interpolate({
                      inputRange: routes.map((_, i) => i),
                      outputRange: routes.map((_, i) => 8 + i * itemW + (itemW - PILL_W) / 2),
                    }),
                  },
                ],
              },
            ]}
          />
        )}
        {routes.map((route) => {
          const focused = route.name === focusedName;
          const meta = TAB_META[route.name] ?? { icon: 'info', label: route.name };
          const label = route.name === 'profile' ? profileLabel : route.name === 'catalog' && cafeMenu ? 'Меню' : route.name === 'orders' && cashierTab ? 'Брони' : meta.label;
          if (route.name === 'cart') {
            return <CartTab key={route.key} focused={focused} onPress={() => press(route.key, focused)} />;
          }
          return (
            <TabItem
              key={route.key}
              focused={focused}
              icon={label === 'Войти' ? 'login' : meta.icon}
              label={label}
              onPress={() => press(route.key, focused)}
            />
          );
        })}
      </View>
    </>
  );
}

const TabItem = memo(function TabItem({
  focused,
  icon,
  label,
  onPress,
}: {
  focused: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const tint = focused ? colors.mango : colors.textSoft;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={styles.item}
      scaleTo={0.9}
      haptic
    >
      <View style={styles.iconPill}>
        <Icon name={icon} size={24} color={tint} strokeWidth={focused ? 2 : 1.6} />
      </View>
      <T
        v="caption"
        color={focused ? colors.text : colors.textSoft}
        style={{ fontFamily: focused ? fonts.bold : fonts.semibold, letterSpacing: 0 }}
        numberOfLines={1}
      >
        {label}
      </T>
    </Touchable>
  );
});

/** Центральная кнопка корзины: подпрыгивает, когда в неё «прилетает» товар. */
function CartTab({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const cartCount = useCartCount();
  const bump = useUi((s) => s.cartBump);
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.setValue(0.85);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 18 }).start();
  }, [bump, scale]);

  return (
    <View style={styles.item}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Touchable
          haptic
          onPress={onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: focused }}
          accessibilityLabel={`Корзина${cartCount ? `, ${cartCount}` : ''}`}
          style={[styles.center, focused && { backgroundColor: colors.coffee }]}
          scaleTo={0.92}
        >
          <Icon name="bag" size={24} color={colors.white} strokeWidth={1.8} />
          <Badge count={cartCount} style={styles.centerBadge} />
        </Touchable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(249,245,230,0.96)', zIndex: 50, elevation: 30 },
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 8,
    ...Platform.select({
      ios: { shadowColor: '#5A3B1E', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: -6 } },
      android: { elevation: 16 },
      default: { boxShadow: '0px -6px 28px rgba(90,59,30,0.08)' } as object,
    }),
  },
  indicator: {
    position: 'absolute',
    left: 0,
    width: PILL_W,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingBottom: 2, minHeight: 48 },
  iconPill: { width: PILL_W, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  center: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    marginBottom: 4,
    borderWidth: 4,
    borderColor: colors.oatMilk,
    ...shadows.float,
  },
  centerBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.cambodia },
});
