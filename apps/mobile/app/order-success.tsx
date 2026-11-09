import React, { useEffect, useRef } from 'react';
import { Animated, BackHandler, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from '../src/components/Icon';
import { FadeIn } from '../src/components/motion';
import { Button, T } from '../src/components/ui';
import { deliveryPhrase } from '../src/lib/format';
import { colors, space } from '../src/theme';

export default function OrderSuccess() {
  const { id, number, date, cafe, time } = useLocalSearchParams<{ id: string; number: string; date?: string; cafe?: string; time?: string }>();
  const isCafe = cafe === '1';
  const insets = useSafeAreaInsets();
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 5, bounciness: 14 }).start();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [pop]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + space.xl }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Circle cx={340} cy={120} r={110} fill={colors.softYellow} />
        <Circle cx={60} cy={640} r={140} fill={colors.iceCube} opacity={0.6} />
        <Circle cx={90} cy={170} r={10} fill={colors.mango} opacity={0.6} />
        <Circle cx={320} cy={560} r={14} fill={colors.strawberryMilk} />
        <Circle cx={250} cy={260} r={6} fill={colors.lime} />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
        <Animated.View style={[styles.badge, { transform: [{ scale: pop }] }]}>
          <Icon name="check" size={64} color={colors.white} strokeWidth={2.4} />
        </Animated.View>
        <FadeIn delay={250} style={{ gap: space.md, alignItems: 'center' }}>
          <T v="display" center>
            {isCafe ? `Бронь №${number} оформлена!` : `Заказ №${number} оформлен!`}
          </T>
          <T v="body" center color={colors.textMuted} style={{ maxWidth: 300, fontSize: 16, lineHeight: 24 }}>
            {isCafe
              ? `Приготовим к ${time ?? 'выбранному времени'}. Если выбрали QR — оплатите на следующем экране. Пришлём уведомление, когда всё будет готово.`
              : `${date ? `Доставка — ${deliveryPhrase(date)}. ` : ''}Оплатите заказ — как только оплата придёт, менеджер подтвердит его и он уйдёт в цех.`}
          </T>
        </FadeIn>
      </View>
      <View style={{ gap: space.sm }}>
        <Button title={isCafe ? 'Открыть бронь' : 'Оплата и статус'} onPress={() => router.replace(`/order/${id}`)} />
        <Button title="На главную" kind="ghost" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.oatMilk, paddingHorizontal: space.xl, overflow: 'hidden' },
  badge: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: colors.white,
  },
});
