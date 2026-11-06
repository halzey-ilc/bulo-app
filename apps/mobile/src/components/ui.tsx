import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadows, space, type } from '../theme';
import { Icon, IconName } from './Icon';

/* ───────── Text ───────── */

type Variant = keyof typeof type;

export function T({
  v = 'body',
  color,
  center,
  style,
  ...rest
}: TextProps & { v?: Variant; color?: string; center?: boolean }) {
  return (
    <Text
      {...rest}
      style={[type[v], { color: color ?? colors.text }, center && { textAlign: 'center' }, style]}
    />
  );
}

/* ───────── Haptics ───────── */

export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

/** Успех: заказ оформлен, товар в корзине. */
export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Лёгкий «толчок»: добавление, свайп. */
export function hapticImpact(strong?: boolean) {
  Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/* ───────── Pressable with scale ───────── */

export function Touchable({
  style,
  children,
  scaleTo = 0.97,
  haptic,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: boolean; children?: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <AnimatedPressable
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        to(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) tap();
        rest.onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ───────── Button ───────── */

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger' | 'light';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  right,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}) {
  const palette: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.mango, fg: colors.white },
    secondary: { bg: colors.primarySoft, fg: colors.mango },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
    dark: { bg: colors.cambodia, fg: colors.oatMilk },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    light: { bg: colors.white, fg: colors.mango },
  };
  const p = palette[kind];
  const off = disabled || loading;
  return (
    <Touchable
      onPress={off ? undefined : onPress}
      disabled={off}
      haptic
      hitSlop={small ? 6 : 2}
      accessibilityRole="button"
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: p.bg, borderColor: p.border ?? 'transparent', opacity: disabled ? 0.45 : 1 },
        kind === 'primary' && !disabled && shadows.soft,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={p.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={small ? 16 : 18} color={p.fg} />}
          <Text numberOfLines={1} style={[small ? type.small : type.bodyStrong, { color: p.fg, fontFamily: fonts.bold, flexShrink: 1 }]}>
            {title}
          </Text>
          {right}
        </>
      )}
    </Touchable>
  );
}

/* ───────── Card ───────── */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const s = [styles.card, padded && { padding: space.lg }, style];
  if (onPress) {
    return (
      <Touchable onPress={onPress} style={s} scaleTo={0.98}>
        {children}
      </Touchable>
    );
  }
  return <View style={s}>{children}</View>;
}

/* ───────── Chip ───────── */

export function Chip({
  label,
  active,
  onPress,
  icon,
  count,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number;
}) {
  return (
    <Touchable
      onPress={onPress}
      haptic
      hitSlop={4}
      style={[styles.chip, active ? styles.chipActive : null]}
      accessibilityState={{ selected: !!active }}
    >
      {icon && <Icon name={icon} size={14} color={active ? colors.white : colors.text} />}
      <T v="small" style={{ fontFamily: fonts.bold }} color={active ? colors.white : colors.text}>
        {label}
      </T>
      {count != null && (
        <T v="caption" color={active ? 'rgba(255,255,255,0.8)' : colors.textSoft}>
          {count}
        </T>
      )}
    </Touchable>
  );
}

/* ───────── Badge ───────── */

export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (!count) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

/* ───────── Icon button ───────── */

export function IconButton({
  name,
  onPress,
  badge,
  bg = colors.white,
  color = colors.text,
  size = 40,
  label,
}: {
  name: IconName;
  onPress?: () => void;
  badge?: number;
  bg?: string;
  color?: string;
  size?: number;
  label?: string;
}) {
  return (
    <Touchable
      onPress={onPress}
      haptic
      hitSlop={4}
      accessibilityLabel={label}
      style={[styles.iconBtn, { width: size, height: size, backgroundColor: bg }, bg !== 'transparent' && shadows.soft]}
    >
      <Icon name={name} size={20} color={color} />
      {!!badge && <Badge count={badge} style={{ position: 'absolute', top: -2, right: -2 }} />}
    </Touchable>
  );
}

/* ───────── Input ───────── */

export function Field({
  label,
  hint,
  error,
  left,
  right,
  inputRef,
  style,
  ...rest
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  left?: React.ReactNode;
  /** Правый слот: «показать пароль», «очистить». */
  right?: React.ReactNode;
  inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.semibold }}>
          {label}
        </T>
      )}
      <View
        style={[
          styles.input,
          focused && { borderColor: colors.mango, backgroundColor: colors.white },
          !!error && { borderColor: colors.danger },
          rest.multiline && { minHeight: 96, alignItems: 'flex-start', paddingVertical: 12 },
        ]}
      >
        {left}
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.textSoft}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.inputText, rest.multiline && { textAlignVertical: 'top' }, style as StyleProp<TextStyle>]}
        />
        {right}
      </View>
      {error ? (
        <T v="small" color={colors.danger}>
          {error}
        </T>
      ) : hint ? (
        <T v="small" color={colors.textSoft}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/* ───────── Section header ───────── */

export function SectionTitle({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <T v="h2">{title}</T>
      {action && (
        <Touchable onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
            {action}
          </T>
          <Icon name="chevronRight" size={16} color={colors.mango} />
        </Touchable>
      )}
    </View>
  );
}

/* ───────── Skeleton ───────── */

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ backgroundColor: 'rgba(38,66,43,0.08)', borderRadius: radius.md, opacity: v }, style]} />;
}

/* ───────── Empty / error states ───────── */

export function EmptyState({
  icon = 'bag',
  title,
  text,
  action,
  onAction,
  tint = colors.softYellow,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
  tint?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyBlob, { backgroundColor: tint }]}>
        <Icon name={icon} size={34} color={colors.mango} strokeWidth={1.5} />
      </View>
      <T v="h3" center>
        {title}
      </T>
      {text && (
        <T v="body" center color={colors.textMuted} style={{ maxWidth: 300 }}>
          {text}
        </T>
      )}
      {action && <Button title={action} onPress={onAction} style={{ marginTop: space.sm, alignSelf: 'center' }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="info"
      tint={colors.dangerSoft}
      title="Не получилось загрузить"
      text={message}
      action={onRetry ? 'Повторить' : undefined}
      onAction={onRetry}
    />
  );
}

/* ───────── Row (list item) ───────── */

export function Row({
  icon,
  title,
  subtitle,
  onPress,
  right,
  tint = colors.oatMilk,
  iconColor = colors.text,
  danger,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  right?: React.ReactNode;
  tint?: string;
  iconColor?: string;
  danger?: boolean;
}) {
  const content = (
    <>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerSoft : tint }]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : iconColor} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <T v="bodyStrong" color={danger ? colors.danger : colors.text}>
          {title}
        </T>
        {!!subtitle && (
          <T v="small" color={colors.textMuted}>
            {subtitle}
          </T>
        )}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={18} color={colors.textSoft} /> : null)}
    </>
  );
  if (onPress)
    return (
      <Touchable onPress={onPress} style={styles.row} scaleTo={0.985}>
        {content}
      </Touchable>
    );
  return <View style={styles.row}>{content}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 46,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
  },
  btnSmall: { minHeight: 36, borderRadius: 12, paddingHorizontal: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    ...shadows.card,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.cambodia, borderColor: colors.cambodia },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: { color: colors.white, fontFamily: fonts.extrabold, fontSize: 10, lineHeight: 13 },
  iconBtn: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  inputText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 8,
    // убираем рамку фокуса браузера в веб-версии
    outlineStyle: 'none',
  } as unknown as TextStyle,
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyBlob: {
    width: 80,
    height: 80,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
    transform: [{ rotate: '-6deg' }],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.lg },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
