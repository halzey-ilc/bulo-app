import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { distText, NextTurn } from '../../lib/navigation';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { T } from '../ui';

/**
 * Плашка навигатора над картой: стрелка манёвра, сколько до него и на какую улицу.
 * Новый манёвр «въезжает» сверху, расстояние меняется на месте.
 */
export function NavBanner({ next, offRoute }: { next: NextTurn | null; offRoute: boolean }) {
  const key = offRoute ? 'off' : next ? `${next.maneuver.at}:${next.maneuver.kind}` : 'none';
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [key, v]);

  if (!next && !offRoute) return null;
  const m = next?.maneuver;
  const near = !!next && next.distance < 120;

  return (
    <Animated.View
      style={[
        styles.wrap,
        near && styles.near,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
      ]}
    >
      {offRoute ? (
        <>
          <View style={styles.iconBox}>
            <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <T style={styles.dist}>Перестраиваем</T>
            <T v="small" color="rgba(249,245,230,0.8)">
              Вы свернули с маршрута
            </T>
          </View>
        </>
      ) : m ? (
        <>
          <View style={styles.iconBox}>
            <ManeuverIcon kind={m.kind} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={styles.dist}>{m.kind === 'arrive' ? (next!.distance < 30 ? 'Вы на месте' : distText(next!.distance)) : distText(next!.distance)}</T>
            <T v="bodyStrong" color={colors.oatMilk} numberOfLines={1}>
              {m.kind === 'arrive' ? (next!.distance < 30 ? 'Отметьте «Я на месте»' : 'до адреса') : m.text}
            </T>
            {!!m.street && m.kind !== 'arrive' && (
              <T v="small" color="rgba(249,245,230,0.75)" numberOfLines={1}>
                на {m.street}
              </T>
            )}
          </View>
          {next!.then && next!.distance < 250 && next!.then.kind !== 'arrive' && (
            <View style={styles.then}>
              <T v="caption" color="rgba(249,245,230,0.75)" style={{ letterSpacing: 0 }}>
                затем
              </T>
              <ManeuverIcon kind={next!.then.kind} size={22} />
            </View>
          )}
        </>
      ) : null}
    </Animated.View>
  );
}

/** Стрелка манёвра: поворот, плавный, резкий, разворот, кольцо, финиш. */
export function ManeuverIcon({ kind, size = 34 }: { kind: string; size?: number }) {
  const c = colors.white;
  const left = kind.endsWith('left');
  const flip = left ? { transform: [{ scaleX: -1 }] } : undefined;
  let d = 'M12 21V4M6 10l6-6 6 6'; // прямо
  if (kind.startsWith('turn')) d = 'M7 21v-8a4 4 0 0 1 4-4h9M16 5l4 4-4 4';
  else if (kind.startsWith('slight')) d = 'M9 21v-6.5a4 4 0 0 1 1.2-2.8L17 5M11.5 5H17v5.5';
  else if (kind.startsWith('sharp')) d = 'M8 21V8a4 4 0 0 1 7-2.6L18 9M18 3.5V9h-5.5';
  else if (kind === 'uturn') d = 'M7 21V9a5 5 0 0 1 10 0v6M13 11l4 4 4-4';
  if (kind === 'roundabout') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={12} cy={10} r={4} />
        <Path d="M12 21v-7M16 6.5l2.5-2.5M15 3.5h3.5V7" />
      </Svg>
    );
  }
  if (kind === 'arrive') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
        <Circle cx={12} cy={10} r={2.3} fill={c} />
      </Svg>
    );
  }
  return (
    <View style={flip}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <Path d={d} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.cambodia,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    ...shadows.card,
  },
  near: { backgroundColor: '#1F5130' },
  iconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  dist: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, color: colors.white },
  then: { alignItems: 'center', gap: 2, paddingLeft: space.sm, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(249,245,230,0.3)' },
});
