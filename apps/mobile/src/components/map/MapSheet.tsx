import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors, shadows, space } from '../../theme';
import { tap } from '../ui';

export interface MapSheetHandle {
  snapTo: (index: number) => void;
}

/** Пружина «как в iOS»: быстрая, почти без отскока в конце. */
const SPRING = { damping: 28, stiffness: 280, mass: 0.9, restDisplacementThreshold: 0.5, restSpeedThreshold: 0.5 };

/**
 * Шторка поверх карты (как в приложениях доставки).
 * - Тянется за любое место: пока не развёрнута — жест двигает шторку, а не список;
 *   развёрнута — список прокручивается, а потянуть вниз от верха списка — свернуть.
 * - Прилипает к ближайшей ступени с учётом скорости броска.
 * - `above` — плавающие кнопки над краем шторки: едут вместе с ней и прячутся, когда она во весь экран.
 * - Карта под развёрнутой шторкой слегка затемняется.
 */
export function MapSheet({
  ref,
  snaps,
  initial = 1,
  header,
  above,
  children,
  bottomInset = 0,
  onSnap,
  refreshControl,
  style,
}: {
  ref?: React.Ref<MapSheetHandle>;
  /** Видимые высоты шторки снизу вверх, px. */
  snaps: number[];
  initial?: number;
  header?: React.ReactNode;
  above?: React.ReactNode;
  children?: React.ReactNode;
  /** Место под нижнюю панель вкладок. */
  bottomInset?: number;
  onSnap?: (height: number, index: number) => void;
  refreshControl?: React.ReactElement<any>;
  style?: StyleProp<ViewStyle>;
}) {
  const max = Math.max(...snaps);
  const offsets = useMemo(() => snaps.map((s) => max - s), [snaps, max]);
  const top = offsets.length - 1;
  const y = useRef(new Animated.Value(offsets[initial] ?? 0)).current;
  const cur = useRef(offsets[initial] ?? 0);
  const [index, setIndex] = useState(initial);
  const indexRef = useRef(initial);
  const scrollY = useRef(0);
  const onSnapRef = useRef(onSnap);
  onSnapRef.current = onSnap;

  const snapTo = (i: number, velocity = 0) => {
    const k = Math.max(0, Math.min(offsets.length - 1, i));
    if (k !== indexRef.current) tap();
    cur.current = offsets[k];
    indexRef.current = k;
    setIndex(k);
    onSnapRef.current?.(snaps[k], k);
    Animated.spring(y, { toValue: offsets[k], velocity, useNativeDriver: true, ...SPRING }).start();
  };
  const snapRef = useRef(snapTo);
  snapRef.current = snapTo;

  useImperativeHandle(ref, () => ({ snapTo: (i) => snapRef.current(i) }));

  // Высоты поменялись (например, повернули экран) — встаём на ту же ступень.
  useEffect(() => {
    snapRef.current(indexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsets.join(',')]);

  const pan = useMemo(() => {
    const vertical = (g: { dx: number; dy: number }) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2;
    // кто ведёт жест: шторка или список внутри
    const sheetOwns = (g: { dx: number; dy: number }) => vertical(g) && (indexRef.current !== top || (scrollY.current <= 0 && g.dy > 0));
    // PanResponder обнуляет dy в момент перехвата — запоминаем, сколько палец уже прошёл,
    // иначе шторка «отстаёт» от пальца (а на медленном устройстве жест теряется целиком)
    let lead = 0;
    const capture = (g: { dx: number; dy: number }) => {
      const own = sheetOwns(g);
      if (own) lead = g.dy;
      return own;
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => capture(g),
      onMoveShouldSetPanResponder: (_, g) => capture(g),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        y.stopAnimation((v) => (cur.current = v));
      },
      onPanResponderMove: (_, g) => {
        const lo = offsets[top];
        const hi = offsets[0];
        let v = cur.current + lead + g.dy;
        // мягкое сопротивление за краями
        if (v < lo) v = lo - Math.sqrt(lo - v) * 2.4;
        if (v > hi) v = hi + Math.sqrt(v - hi) * 2.4;
        y.setValue(v);
      },
      onPanResponderRelease: (_, g) => {
        const v = cur.current + lead + g.dy;
        // куда «долетит» шторка с такой скоростью
        const projected = v + g.vy * 220;
        let best = 0;
        offsets.forEach((o, i) => {
          if (Math.abs(o - projected) < Math.abs(offsets[best] - projected)) best = i;
        });
        // уверенный бросок переключает хотя бы на одну ступень
        const at = indexRef.current;
        if (best === at && Math.abs(g.vy) > 0.6) best = g.vy < 0 ? Math.min(top, at + 1) : Math.max(0, at - 1);
        snapRef.current(best, -g.vy);
      },
      onPanResponderTerminate: () => snapRef.current(indexRef.current),
    });
  }, [offsets, top, y]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  // Плавающие кнопки и затемнение считаются от положения шторки — на нативном драйвере.
  const lo = offsets[top];
  const mid = offsets.length > 1 ? offsets[Math.max(0, top - 1)] : lo + 1;
  const aboveOpacity = y.interpolate({ inputRange: [lo, lo + (mid - lo) * 0.5, mid], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const dim = y.interpolate({ inputRange: [lo, mid], outputRange: [0.28, 0], extrapolate: 'clamp' });
  const hidden = offsets[index] ?? 0;

  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]} />
      {/* отдельный слой, а не ребёнок шторки: на Android касания вне границ родителя не доходят */}
      {!!above && (
        <Animated.View
          pointerEvents={index === top ? 'none' : 'box-none'}
          style={[styles.above, { bottom: max + bottomInset, opacity: aboveOpacity, transform: [{ translateY: y }] }]}
        >
          {above}
        </Animated.View>
      )}
      <Animated.View style={[styles.sheet, { height: max + bottomInset, transform: [{ translateY: y }] }, style]} {...pan.panHandlers}>
        <Pressable
          style={styles.grabZone}
          onPress={() => snapRef.current(index === top ? 1 : index + 1)}
          accessibilityLabel="Развернуть или свернуть"
          hitSlop={8}
        >
          <View style={styles.grabber} />
        </Pressable>
        {header}
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: hidden + bottomInset + space.xl }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={index === top}
          onScroll={onScroll}
          scrollEventThrottle={16}
          overScrollMode="never"
          bounces={false}
        >
          {children}
        </Animated.ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#1B2A1E' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.oatMilk,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...shadows.float,
  },
  above: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.md, paddingBottom: space.md },
  grabZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(38,66,43,0.2)' },
});
