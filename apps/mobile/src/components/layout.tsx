import React from 'react';
import { Platform, RefreshControl, ScrollView, ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';
import { Icon } from './Icon';
import { T, Touchable } from './ui';

export const TAB_BAR_SPACE = 110;

/** Шапка вложенного экрана: круглая кнопка «назад», заголовок, правый слот. */
export function Header({
  title,
  subtitle,
  right,
  onBack,
  transparent,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  transparent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 6, backgroundColor: transparent ? 'transparent' : colors.bg },
      ]}
    >
      <Touchable
        haptic
        accessibilityLabel="Назад"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.back}
      >
        <Icon name="chevronLeft" size={22} />
      </Touchable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {!!title && (
          <T v="h3" numberOfLines={1}>
            {title}
          </T>
        )}
        {!!subtitle && (
          <T v="small" color={colors.textMuted} numberOfLines={1}>
            {subtitle}
          </T>
        )}
      </View>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Прокручиваемый экран с pull-to-refresh. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
  withTabBar,
  topInset,
  ...rest
}: ScrollViewProps & {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  withTabBar?: boolean;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scroll = (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[
        {
          paddingHorizontal: space.lg,
          paddingTop: topInset ? insets.top + space.md : space.sm,
          paddingBottom: (withTabBar ? TAB_BAR_SPACE : space.xxxl) + insets.bottom,
          gap: space.lg,
        },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? <BrandRefresh refreshing={!!refreshing} onRefresh={onRefresh} offset={topInset ? insets.top : undefined} /> : undefined
      }
      {...rest}
    >
      {children}
    </ScrollView>
  );
  if (!topInset) return scroll;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll}
      <StatusScrim />
    </View>
  );
}

/** Подложка под статус-бар: при прокрутке контент не «просвечивает» под часами. */
export function StatusScrim() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: 'rgba(249,245,230,0.97)', zIndex: 10, elevation: 10 }}
    />
  );
}

/** Фирменный индикатор обновления: манго-кольцо на молочной подложке. */
// В вебе ScrollView передаёт сюда свои children/style через cloneElement — их нужно пробросить, иначе экран пустой.
export function BrandRefresh({ refreshing, onRefresh, offset, ...rest }: { refreshing: boolean; onRefresh: () => void; offset?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.mango}
      colors={[colors.mango, colors.coffee]}
      progressBackgroundColor={colors.softYellow}
      progressViewOffset={offset}
      title={Platform.OS === 'ios' ? 'Достаём из печи…' : undefined}
      titleColor={colors.textMuted}
    />
  );
}

/** Нижняя «липкая» панель с кнопкой. */
export function BottomBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: space.sm,
    shadowColor: '#5A3B1E',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
});
