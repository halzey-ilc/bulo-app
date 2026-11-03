import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, shadows, space } from '../../theme';
import { hapticImpact } from '../ui';

export interface MapSheetHandle {
  snapTo: (index: number) => void;
}

/**
 * Шторка поверх карты (как в приложениях доставки): тянется за «ручку» и шапку,
 * прилипает к ближайшей высоте. Содержимое под шапкой прокручивается.
 */
export function MapSheet({
  ref,
  snaps,
  initial = 1,
  header,
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
  children?: React.ReactNode;
  /** Место под нижнюю панель вкладок. */
  bottomInset?: number;
  onSnap?: (height: number, index: number) => void;
  refreshControl?: React.ReactElement<any>;
  style?: StyleProp<ViewStyle>;
}) {
  const max = Math.max(...snaps);
  const offsets = useMemo(() => snaps.map((s) => max - s), [snaps, max]);
  const y = useRef(new Animated.Value(offsets[initial] ?? 0)).current;
  const cur = useRef(offsets[initial] ?? 0);
  const [index, setIndex] = useState(initial);
  const onSnapRef = useRef(onSnap);
  onSnapRef.current = onSnap;

  const snapTo = (i: number, velocity = 0) => {
    const k = Math.max(0, Math.min(offsets.length - 1, i));
    cur.current = offsets[k];
    setIndex(k);
    onSnapRef.current?.(snaps[k], k);
    Animated.spring(y, { toValue: offsets[k], velocity, useNativeDriver: true, speed: 16, bounciness: 3 }).start();
  };
  const snapRef = useRef(snapTo);
  snapRef.current = snapTo;

  useImperativeHandle(ref, () => ({ snapTo: (i) => snapRef.current(i) }));

  // Высоты поменялись (например, повернули экран) — встаём на ту же ступень.
  useEffect(() => {
    snapRef.current(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsets.join(',')]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          y.stopAnimation((v) => (cur.current = v));
        },
        onPanResponderMove: (_, g) => {
          const lo = Math.min(...offsets);
          const hi = Math.max(...offsets);
          let v = cur.current + g.dy;
          // мягкое сопротивление за краями
          if (v < lo) v = lo - Math.sqrt(lo - v) * 2;
          if (v > hi) v = hi + Math.sqrt(v - hi) * 2;
          y.setValue(v);
        },
        onPanResponderRelease: (_, g) => {
          const v = cur.current + g.dy;
          const projected = v + g.vy * 180;
          let best = 0;
          offsets.forEach((o, i) => {
            if (Math.abs(o - projected) < Math.abs(offsets[best] - projected)) best = i;
          });
          hapticImpact();
          snapRef.current(best, -g.vy);
        },
        onPanResponderTerminate: () => snapRef.current(offsets.indexOf(cur.current) >= 0 ? offsets.indexOf(cur.current) : 0),
      }),
    [offsets, y],
  );

  const hidden = offsets[index] ?? 0;
  return (
    <Animated.View style={[styles.sheet, { height: max + bottomInset, transform: [{ translateY: y }] }, style]} pointerEvents="box-none">
      <View {...pan.panHandlers}>
        <Pressable
          style={styles.grabZone}
          onPress={() => snapRef.current((index + 1) % offsets.length)}
          accessibilityLabel="Развернуть или свернуть"
          hitSlop={8}
        >
          <View style={styles.grabber} />
        </Pressable>
        {header}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: hidden + bottomInset + space.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  grabZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(38,66,43,0.2)' },
});
