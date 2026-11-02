/**
 * Общие блоки офисных экранов: шторка, сегменты, KPI-карточки, переключатель, графики…
 * Собраны поверх базового UI-кита (ui.tsx), чтобы не трогать общие компоненты.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { errorMessage } from '../../api';
import { shareFile } from '../../api/admin';
import { toast } from '../../store/ui';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { Field, Skeleton, T, tap, Touchable } from '../ui';
import { AIcon, AIconName } from './icons';

/* ───────── Форматирование ───────── */

/** 12 500 → «12,5 тыс», 1 250 000 → «1,25 млн». */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${trim(n / 1_000_000, 2)} млн`;
  if (a >= 10_000) return `${trim(n / 1000, 1)} тыс`;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
const trim = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');

/** «5 мин назад», «3 ч назад», «вчера». */
export function ago(ts: string | null | undefined): string {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 60000;
  if (diff < 1) return 'только что';
  if (diff < 60) return `${Math.floor(diff)} мин назад`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)} ч назад`;
  const d = Math.floor(diff / 1440);
  if (d === 1) return 'вчера';
  return `${d} дн назад`;
}

export function initials(name: string | null | undefined) {
  return (name || '?')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/* ───────── Шапка вкладки ───────── */

export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <T v="display">{title}</T>
        {!!subtitle && (
          <T v="body" color={colors.textMuted}>
            {subtitle}
          </T>
        )}
      </View>
      {right}
    </View>
  );
}

/** Круглая кнопка с иконкой из офисного набора. */
export function RoundButton({
  icon,
  onPress,
  bg = colors.white,
  color = colors.text,
  size = 44,
  label,
  loading,
}: {
  icon: AIconName;
  onPress?: () => void;
  bg?: string;
  color?: string;
  size?: number;
  label?: string;
  loading?: boolean;
}) {
  return (
    <Touchable
      haptic
      onPress={loading ? undefined : onPress}
      accessibilityLabel={label}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, bg !== 'transparent' && shadows.soft]}
    >
      {loading ? <ActivityIndicator color={color} /> : <AIcon name={icon} size={Math.round(size * 0.48)} color={color} />}
    </Touchable>
  );
}

/* ───────── Сегменты ───────── */

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  count?: number;
  dot?: boolean;
}

/** Сегментированный переключатель. Если пунктов много — прокручивается по горизонтали. */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  style,
  scroll,
}: {
  items: SegmentItem<K>[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const body = items.map((it) => {
    const active = it.key === value;
    return (
      <Touchable
        key={it.key}
        haptic
        scaleTo={0.95}
        onPress={() => onChange(it.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={[s.seg, !scroll && { flex: 1 }, active && s.segActive]}
      >
        <T v="small" numberOfLines={1} style={{ fontFamily: active ? fonts.extrabold : fonts.semibold }} color={active ? colors.text : colors.textMuted}>
          {it.label}
        </T>
        {!!it.count && (
          <View style={[s.segCount, { backgroundColor: active ? colors.mango : 'rgba(38,66,43,0.1)' }]}>
            <T v="caption" color={active ? colors.white : colors.textMuted} style={{ fontFamily: fonts.extrabold, fontSize: 10 }}>
              {it.count > 99 ? '99+' : it.count}
            </T>
          </View>
        )}
        {it.dot && !it.count && <View style={s.segDot} />}
      </Touchable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -space.lg, flexGrow: 0 }, style]} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <View style={s.segWrap}>{body}</View>
      </ScrollView>
    );
  }
  return <View style={[s.segWrap, style]}>{body}</View>;
}

/* ───────── KPI ───────── */

export type Tone = 'mango' | 'yellow' | 'ice' | 'green' | 'pink' | 'dark' | 'danger' | 'white';

export const TONES: Record<Tone, { bg: string; fg: string; icon: string; iconBg: string }> = {
  mango: { bg: colors.mango, fg: colors.white, icon: colors.mango, iconBg: colors.white },
  yellow: { bg: colors.softYellow, fg: colors.cambodia, icon: '#8A5A00', iconBg: 'rgba(255,255,255,0.7)' },
  ice: { bg: colors.iceCube, fg: colors.cambodia, icon: colors.blueberry, iconBg: 'rgba(255,255,255,0.7)' },
  green: { bg: '#DDEFD9', fg: colors.cambodia, icon: colors.success, iconBg: 'rgba(255,255,255,0.7)' },
  pink: { bg: '#FBD9E8', fg: colors.coffee, icon: colors.coffee, iconBg: 'rgba(255,255,255,0.7)' },
  dark: { bg: colors.cambodia, fg: colors.oatMilk, icon: colors.cambodia, iconBg: colors.lime },
  danger: { bg: colors.dangerSoft, fg: colors.coffee, icon: colors.danger, iconBg: 'rgba(255,255,255,0.75)' },
  white: { bg: colors.white, fg: colors.cambodia, icon: colors.mango, iconBg: colors.primarySoft },
};

export function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = 'white',
  onPress,
  pulse,
  style,
}: {
  icon: AIconName;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  onPress?: () => void;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];
  return (
    <Touchable onPress={onPress} haptic scaleTo={0.96} style={[s.kpi, { backgroundColor: t.bg }, tone === 'white' && shadows.soft, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[s.kpiIcon, { backgroundColor: t.iconBg }]}>
          <AIcon name={icon} size={20} color={t.icon} strokeWidth={1.9} />
        </View>
        {pulse ? <PulseDot color={tone === 'mango' ? colors.white : colors.mango} /> : onPress ? <AIcon name="chevronRight" size={16} color={t.fg} /> : null}
      </View>
      <T style={{ fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, marginTop: space.md }} color={t.fg} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T v="small" color={t.fg} style={{ fontFamily: fonts.bold, opacity: 0.92 }} numberOfLines={1}>
        {label}
      </T>
      {!!sub && (
        <T v="caption" color={t.fg} style={{ opacity: 0.7, marginTop: 1 }} numberOfLines={1}>
          {sub}
        </T>
      )}
    </Touchable>
  );
}

/** Пульсирующая точка «требует внимания». */
export function PulseDot({ color = colors.mango, size = 10 }: { color?: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size * 2.4, height: size * 2.4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/* ───────── Шторка ───────── */

/**
 * Нижняя шторка поверх экрана: заголовок, прокручиваемое содержимое и «липкий» низ.
 * Работает одинаково на iOS, Android и в вебе.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
  dismissable = true,
  headerLeft,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  dismissable?: boolean;
  headerLeft?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
    } else if (mounted) {
      Animated.timing(y, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;
  const h = Dimensions.get('window').height;
  const close = dismissable ? onClose : undefined;
  return (
    <Modal transparent visible animationType="none" onRequestClose={() => close?.()} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Закрыть" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <Animated.View
          style={[
            s.sheet,
            { maxHeight: h * 0.92, paddingBottom: footer ? 0 : insets.bottom + space.lg, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) }] },
          ]}
        >
          <View style={s.grabber} />
          {(title || headerLeft) && (
            <View style={s.sheetHead}>
              {headerLeft}
              <View style={{ flex: 1 }}>
                {!!title && <T v="h2">{title}</T>}
                {!!subtitle && (
                  <T v="small" color={colors.textMuted}>
                    {subtitle}
                  </T>
                )}
              </View>
              {dismissable && <RoundButton icon="close" size={36} onPress={onClose} label="Закрыть" bg={colors.white} />}
            </View>
          )}
          {scroll ? (
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md, flexShrink: 1 }}>{children}</View>
          )}
          {footer && <View style={[s.sheetFoot, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Пункт меню действий в шторке. */
export function ActionItem({
  icon,
  title,
  subtitle,
  onPress,
  tone = 'white',
  danger,
  right,
}: {
  icon: AIconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  tone?: Tone;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  const t = TONES[danger ? 'danger' : tone];
  return (
    <Touchable haptic onPress={onPress} scaleTo={0.98} style={s.action}>
      <View style={[s.actionIcon, { backgroundColor: danger ? colors.dangerSoft : tone === 'white' ? colors.oatMilk : t.bg }]}>
        <AIcon name={icon} size={22} color={danger ? colors.danger : tone === 'white' ? colors.text : t.icon} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" color={danger ? colors.danger : colors.text}>
          {title}
        </T>
        {!!subtitle && (
          <T v="small" color={colors.textMuted}>
            {subtitle}
          </T>
        )}
      </View>
      {right ?? <AIcon name="chevronRight" size={18} color={colors.textSoft} />}
    </Touchable>
  );
}

/* ───────── Переключатель ───────── */

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const a = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 24, bounciness: 6 }).start();
  }, [value, a]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View
        style={[s.toggle, { opacity: disabled ? 0.5 : 1, backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: ['rgba(38,66,43,0.16)', colors.mango] }) }]}
      >
        <Animated.View style={[s.knob, { transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }]} />
      </Animated.View>
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, value, onChange, icon, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: AIconName; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      {icon && (
        <View style={s.rowIcon}>
          <AIcon name={icon} size={20} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        {!!subtitle && (
          <T v="small" color={colors.textMuted}>
            {subtitle}
          </T>
        )}
      </View>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </View>
  );
}

/* ───────── Поиск ───────── */

/** Поле поиска с задержкой: onDebounced вызывается через 300 мс после ввода. */
export function SearchBar({ placeholder, onDebounced, initial = '' }: { placeholder: string; onDebounced: (q: string) => void; initial?: string }) {
  const [v, setV] = useState(initial);
  const cb = useRef(onDebounced);
  cb.current = onDebounced;
  useEffect(() => {
    const t = setTimeout(() => cb.current(v.trim()), 300);
    return () => clearTimeout(t);
  }, [v]);
  return (
    <Field
      placeholder={placeholder}
      value={v}
      onChangeText={setV}
      autoCorrect={false}
      returnKeyType="search"
      left={<AIcon name="search" size={20} color={colors.textSoft} />}
      style={{ paddingRight: 0 }}
    />
  );
}

/* ───────── Мелочи ───────── */

export function Pill({ label, bg, fg, icon, style }: { label: string; bg: string; fg: string; icon?: AIconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }, style]}>
      {icon && <AIcon name={icon} size={12} color={fg} strokeWidth={2.2} />}
      <T v="caption" color={fg} style={{ fontFamily: fonts.extrabold }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

export function Avatar({ name, bg = colors.mango, fg = colors.white, size = 44, icon }: { name?: string | null; bg?: string; fg?: string; size?: number; icon?: AIconName }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {icon ? (
        <AIcon name={icon} size={size * 0.5} color={fg} />
      ) : (
        <T style={{ fontFamily: fonts.extrabold, fontSize: size * 0.36, color: fg }}>{initials(name)}</T>
      )}
    </View>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <T v="caption" color={colors.textSoft} style={{ fontFamily: fonts.extrabold, textTransform: 'uppercase', letterSpacing: 1 }}>
        {children}
      </T>
    </View>
  );
}

export function Note({ icon = 'info', text, tone = 'ice', style }: { icon?: AIconName; text: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View style={[{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', backgroundColor: t.bg, padding: space.md, borderRadius: radius.lg }, style]}>
      <AIcon name={icon} size={18} color={t.icon} />
      <T v="small" color={tone === 'ice' ? colors.blueberry : t.fg} style={{ flex: 1, fontFamily: fonts.semibold }}>
        {text}
      </T>
    </View>
  );
}

export function ListSkeleton({ rows = 4, height = 76 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: space.md }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} style={{ height, borderRadius: radius.xl }} />
      ))}
    </View>
  );
}

/** Карточка-группа с белым фоном. */
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.group, style]}>{children}</View>;
}

/** Кнопка «Выгрузить Excel»: качает файл и открывает «Поделиться». */
export function ExcelRow({ title, subtitle, file, icon = 'doc', disabled }: { title: string; subtitle?: string; file: () => { path: string; filename: string }; icon?: AIconName; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await shareFile(file());
      toast.success('Файл готов');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ActionItem
      icon={icon}
      tone="green"
      title={title}
      subtitle={subtitle}
      onPress={run}
      right={busy ? <ActivityIndicator color={colors.mango} /> : <AIcon name="share" size={18} color={colors.textSoft} />}
    />
  );
}

/** Автообновление, пока экран в фокусе. */
export function useAutoRefresh(fn: () => void, ms = 60000) {
  const ref = useRef(fn);
  ref.current = fn;
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => ref.current(), ms);
      return () => clearInterval(t);
    }, [ms]),
  );
}

/* ───────── Графики ───────── */

/** Столбики по дням: подписи снизу, подсветка последнего/выбранного дня. */
export function BarChart({
  data,
  height = 150,
  color = colors.mango,
  muted = colors.primarySoft,
  highlight,
  onSelect,
  valueLabel,
  dark,
}: {
  data: { key: string; label: string; value: number }[];
  height?: number;
  color?: string;
  muted?: string;
  highlight?: string;
  onSelect?: (key: string) => void;
  valueLabel?: (v: number) => string;
  dark?: boolean;
}) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length || 1;
  const gap = n > 20 ? 2 : n > 10 ? 4 : 8;
  const bw = w ? Math.max(3, (w - gap * (n - 1)) / n) : 0;
  const chartH = height - 22;
  const sel = highlight ?? data[data.length - 1]?.key;
  const step = n > 14 ? Math.ceil(n / 7) : 1;
  const empty = data.every((d) => !d.value);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {empty && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 30, alignItems: 'center', justifyContent: 'center' }}>
          <T v="small" color={dark ? 'rgba(249,245,230,0.7)' : colors.textSoft}>
            Продаж за этот период нет
          </T>
        </View>
      )}
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={1} />
              <Stop offset="1" stopColor={color} stopOpacity={0.75} />
            </LinearGradient>
          </Defs>
          {data.map((d, i) => {
            const bh = d.value > 0 ? Math.max(4, (d.value / max) * (chartH - 18)) : 3;
            const x = i * (bw + gap);
            const active = d.key === sel;
            return (
              <React.Fragment key={d.key}>
                <Rect
                  x={x}
                  y={chartH - bh}
                  width={bw}
                  height={bh}
                  rx={Math.min(8, bw / 2)}
                  fill={active ? 'url(#bar)' : muted}
                />
                {active && d.value > 0 && valueLabel && (
                  <SvgText x={Math.min(Math.max(x + bw / 2, 24), w - 24)} y={chartH - bh - 6} fontSize={11} fontWeight="800" fontFamily={fonts.extrabold} fill={dark ? colors.oatMilk : colors.cambodia} textAnchor="middle">
                    {valueLabel(d.value)}
                  </SvgText>
                )}
                {(i % step === 0 || active) && (
                  <SvgText x={x + bw / 2} y={height - 4} fontSize={10} fontWeight={active ? '800' : '600'} fontFamily={active ? fonts.extrabold : fonts.semibold} fill={dark ? 'rgba(249,245,230,0.7)' : colors.textSoft} textAnchor="middle">
                    {d.label}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      {w > 0 && onSelect && (
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', gap }]}>
          {data.map((d) => (
            <Pressable key={d.key} style={{ flex: 1 }} onPress={() => { tap(); onSelect(d.key); }} accessibilityLabel={d.label} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Горизонтальная полоса-доля (для топов). */
export function ShareBar({ value, max, color = colors.mango }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(38,66,43,0.07)', overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/** Плавная линия-спарклайн. */
export function Sparkline({ values, width = 120, height = 36, color = colors.mango }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - (v / max) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={`${d} L${width} ${height} L0 ${height} Z`} fill={color} opacity={0.12} />
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  segWrap: { flexDirection: 'row', backgroundColor: 'rgba(38,66,43,0.07)', borderRadius: radius.pill, padding: 4, gap: 2 },
  seg: { height: 38, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segActive: { backgroundColor: colors.white, ...shadows.soft },
  segCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  segDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mango },
  kpi: { borderRadius: radius.xl, padding: space.lg, minHeight: 132 },
  kpiIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.oatMilk, borderTopLeftRadius: 30, borderTopRightRadius: 30, width: '100%', maxWidth: 640, alignSelf: 'center', ...shadows.float },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(38,66,43,0.18)', alignSelf: 'center', marginTop: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md },
  sheetFoot: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.oatMilk },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.white, borderRadius: radius.lg },
  actionIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, ...shadows.soft },
  rowIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  group: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
});
