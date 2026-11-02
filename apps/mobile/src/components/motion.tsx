import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, PanResponder, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, fonts, radius } from '../theme';
import { Icon, IconName } from './Icon';
import { hapticImpact, T, Touchable } from './ui';

/** Мягкое появление снизу (с задержкой для «каскада»). Анимация — только при первом показе. */
export function FadeIn({
  children,
  delay = 0,
  style,
  offset = 12,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  offset?: number;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 360,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Пульсирующее кольцо — «живой» текущий этап. */
export function Pulse({ size = 26, color = colors.mango }: { size?: number; color?: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
      }}
    />
  );
}

/** Плавная полоса прогресса (0…1). */
export function ProgressBar({
  value,
  color = colors.mango,
  track = 'rgba(255,255,255,0.7)',
  height = 8,
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  const [w, setW] = useState(0);
  const v = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: Math.max(0, Math.min(1, value)), useNativeDriver: false, speed: 14, bounciness: 4 }).start();
  }, [v, value]);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: v.interpolate({ inputRange: [0, 1], outputRange: [0, w] }),
        }}
      />
    </View>
  );
}

/** Переключатель-сегменты с «едущей» подложкой. */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: K; label: string; icon?: IconName }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, items.findIndex((i) => i.key === value));
  const x = useRef(new Animated.Value(idx)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: idx, useNativeDriver: true, speed: 18, bounciness: 5 }).start();
  }, [x, idx]);
  const itemW = w ? (w - 8) / items.length : 0;
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {itemW > 0 && (
        <Animated.View
          style={[
            styles.segThumb,
            { width: itemW, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, itemW] }) }] },
          ]}
        />
      )}
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Touchable
            key={it.key}
            haptic
            scaleTo={0.97}
            onPress={() => onChange(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.segItem}
          >
            {it.icon && <Icon name={it.icon} size={18} color={active ? colors.text : colors.textSoft} />}
            <T v="bodyStrong" color={active ? colors.text : colors.textMuted} style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 14 }}>
              {it.label}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}

/**
 * Свайп влево — удалить. Работает без сторонних библиотек (PanResponder + Animated),
 * не мешает вертикальной прокрутке: перехватываем только явно горизонтальный жест.
 */
export function SwipeToDelete({
  children,
  onDelete,
  label = 'Удалить',
}: {
  children: React.ReactNode;
  onDelete: () => void;
  label?: string;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  const armed = useRef(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const THRESHOLD = 110;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const dx = Math.min(0, g.dx);
        x.setValue(dx);
        const nowArmed = -dx > THRESHOLD;
        if (nowArmed !== armed.current) {
          armed.current = nowArmed;
          hapticImpact();
        }
      },
      onPanResponderRelease: (_, g) => {
        if (-g.dx > THRESHOLD || g.vx < -1.1) {
          Animated.timing(x, { toValue: -(width.current || 500), duration: 180, useNativeDriver: true }).start(() => {
            onDeleteRef.current();
          });
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
        }
        armed.current = false;
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const bgOpacity = x.interpolate({ inputRange: [-THRESHOLD, -20, 0], outputRange: [1, 0.6, 0], extrapolate: 'clamp' });
  const iconScale = x.interpolate({ inputRange: [-THRESHOLD - 20, -THRESHOLD, -40], outputRange: [1.15, 1, 0.7], extrapolate: 'clamp' });

  return (
    <View onLayout={(e) => (width.current = e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.swipeBg, { opacity: bgOpacity }]}>
        <Animated.View style={{ alignItems: 'center', gap: 2, transform: [{ scale: iconScale }] }}>
          <Icon name="trash" size={22} color={colors.white} />
          <T v="caption" color={colors.white} style={{ fontFamily: fonts.bold }}>
            {label}
          </T>
        </Animated.View>
      </Animated.View>
      <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: 'row',
    backgroundColor: 'rgba(38,66,43,0.07)',
    borderRadius: radius.lg,
    padding: 4,
    height: 52,
  },
  segThumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    shadowColor: '#5A3B1E',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  swipeBg: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.danger,
    borderRadius: radius.xl,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 24,
  },
});
