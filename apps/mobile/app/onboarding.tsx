import React, { useRef, useState } from 'react';
import { Animated, BackHandler, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, IconName } from '../src/components/Icon';
import { Logo } from '../src/components/Logo';
import { Button, T, Touchable } from '../src/components/ui';
import { usePrefs } from '../src/store/prefs';
import { colors, fonts, radius, space } from '../src/theme';

const SLIDES: { title: string; text: string; icon: IconName; bg: string; fg: string; accent: string; chips: string[] }[] = [
  {
    title: 'Свежая выпечка\nк вашему утру',
    text: 'Синнабоны, круассаны, торты и сэндвичи BULO — печём ночью, привозим к открытию.',
    icon: 'spiral',
    bg: colors.softYellow,
    fg: colors.mango,
    accent: colors.strawberryMilk,
    chips: ['Синнабоны', 'Торты', 'Сэндвичи'],
  },
  {
    title: 'Заказ —\nв пару касаний',
    text: 'Соберите корзину, выберите день доставки. Заказы на завтра принимаем до 16:00.',
    icon: 'bag',
    bg: colors.iceCube,
    fg: colors.blueberry,
    accent: colors.softYellow,
    chips: ['Избранное', 'Повтор заказа', 'Поиск'],
  },
  {
    title: 'Следите\nза каждым шагом',
    text: 'Статус обновляется сам: одобрен, в печи, у курьера. Уведомим, когда заказ в пути.',
    icon: 'truck',
    bg: '#FBD9E8',
    fg: colors.coffee,
    accent: colors.iceCube,
    chips: ['В печи', 'У курьера', 'Доставлен'],
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const finish = (then?: () => void) => {
    usePrefs.getState().setOnboardingSeen();
    if (router.canGoBack()) router.back();
    else router.replace('/');
    if (then) setTimeout(then, 300);
  };

  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        finish();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const go = (i: number) => ref.current?.scrollTo({ x: i * width, animated: true });

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.top}>
        <Logo width={64} />
        {!last ? (
          <Touchable onPress={() => finish()} style={styles.skip} hitSlop={8}>
            <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
              Пропустить
            </T>
          </Touchable>
        ) : (
          <View style={{ height: 44 }} />
        )}
      </View>

      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => {
          const input = [(i - 1) * width, i * width, (i + 1) * width];
          const scale = scrollX.interpolate({ inputRange: input, outputRange: [0.7, 1, 0.7], extrapolate: 'clamp' });
          const rotate = scrollX.interpolate({ inputRange: input, outputRange: ['-12deg', '-4deg', '8deg'], extrapolate: 'clamp' });
          const textY = scrollX.interpolate({ inputRange: input, outputRange: [40, 0, 40], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange: input, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View key={i} style={{ width, paddingHorizontal: space.xl, justifyContent: 'center', gap: space.xxl }}>
              <View style={styles.artWrap}>
                <Svg width={300} height={260} viewBox="0 0 300 260" style={StyleSheet.absoluteFill}>
                  <Circle cx={150} cy={130} r={112} fill={s.bg} />
                  <Circle cx={246} cy={52} r={22} fill={s.accent} />
                  <Circle cx={52} cy={206} r={14} fill={colors.lime} opacity={0.8} />
                  <Path d="M40 70c12-16 34-16 46 0" stroke={s.fg} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.35} />
                </Svg>
                <Animated.View style={[styles.art, { backgroundColor: colors.white, transform: [{ scale }, { rotate }] }]}>
                  <Icon name={s.icon} size={96} color={s.fg} strokeWidth={1.3} />
                </Animated.View>
              </View>
              <Animated.View style={{ gap: space.md, opacity, transform: [{ translateY: textY }] }}>
                <T v="display" style={{ fontSize: 32, lineHeight: 38 }}>
                  {s.title}
                </T>
                <T v="body" color={colors.textMuted} style={{ fontSize: 16, lineHeight: 24 }}>
                  {s.text}
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {s.chips.map((c) => (
                    <View key={c} style={[styles.chip, { backgroundColor: s.bg }]}>
                      <T v="small" color={s.fg} style={{ fontFamily: fonts.bold }}>
                        {c}
                      </T>
                    </View>
                  ))}
                </View>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const w = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });
            const o = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [0.25, 1, 0.25],
              extrapolate: 'clamp',
            });
            return <Animated.View key={i} style={[styles.dot, { width: w, opacity: o }]} />;
          })}
        </View>
        {last ? (
          <View style={{ gap: space.sm }}>
            <Button title="Смотреть каталог" icon="grid" onPress={() => finish(() => router.navigate('/catalog'))} />
            <Button title="У меня есть аккаунт — войти" kind="ghost" icon="login" onPress={() => finish(() => router.push('/login'))} />
          </View>
        ) : (
          <Button title="Далее" icon="arrowRight" onPress={() => go(page + 1)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.oatMilk },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    // Правый верхний угол оставляем свободным (там всплывает кнопка разработчика Expo).
    paddingRight: 72,
  },
  skip: { height: 44, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.white },
  artWrap: { width: 300, height: 260, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  art: {
    width: 168,
    height: 168,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5A3B1E',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.mango },
});
