import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartCount } from '../store/cart';
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

/**
 * Нижняя панель: белая «подложка» со скруглением, центральная приподнятая кнопка корзины.
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
  const cartCount = useCartCount();
  const focusedName = state.routes[state.index]?.name;
  const routes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is (typeof state.routes)[number] => !!r);

  const press = (key: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(key);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {routes.map((route) => {
        const focused = route.name === focusedName;
        const meta = TAB_META[route.name] ?? { icon: 'info', label: route.name };
        const label = route.name === 'profile' ? profileLabel : meta.label;
        if (route.name === 'cart') {
          return (
            <View key={route.key} style={styles.item}>
              <Touchable
                haptic
                onPress={() => press(route.key, focused)}
                accessibilityRole="tab"
                accessibilityLabel={`Корзина${cartCount ? `, ${cartCount}` : ''}`}
                style={[styles.center, focused && { backgroundColor: colors.coffee }]}
                scaleTo={0.92}
              >
                <Icon name="bag" size={28} color={colors.white} strokeWidth={1.8} />
                <Badge count={cartCount} style={styles.centerBadge} />
              </Touchable>
            </View>
          );
        }
        const tint = focused ? colors.mango : colors.textSoft;
        return (
          <Touchable
            key={route.key}
            onPress={() => press(route.key, focused)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            style={styles.item}
            scaleTo={0.9}
            haptic
          >
            <View style={[styles.iconPill, focused && { backgroundColor: colors.primarySoft }]}>
              <Icon name={label === 'Войти' ? 'login' : meta.icon} size={24} color={tint} strokeWidth={focused ? 1.9 : 1.6} />
            </View>
            <T
              v="caption"
              color={focused ? colors.text : colors.textSoft}
              style={{ fontFamily: focused ? fonts.bold : fonts.semibold, letterSpacing: 0 }}
            >
              {label}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingBottom: 2 },
  iconPill: { width: 52, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  center: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
    marginBottom: 6,
    borderWidth: 5,
    borderColor: colors.oatMilk,
    ...shadows.float,
  },
  centerBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.cambodia },
});
