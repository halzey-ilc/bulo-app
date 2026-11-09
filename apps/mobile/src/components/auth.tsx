import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { formatPhoneLocal, phoneDigits } from '../lib/format';
import { colors, fonts, radius, space } from '../theme';
import { T } from './ui';

/** Поле телефона с маской: +996 XXX XX XX XX. */
export function PhoneField({
  digits,
  onChange,
  autoFocus,
  onSubmit,
  error,
}: {
  digits: string;
  onChange: (d: string) => void;
  autoFocus?: boolean;
  onSubmit?: () => void;
  error?: string | null;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.phone, focused && styles.focused, !!error && { borderColor: colors.danger }]}>
        <View style={styles.flag}>
          <T style={{ fontSize: 18 }}>🇰🇬</T>
          <T v="h3" style={{ fontFamily: fonts.bold }}>
            +996
          </T>
        </View>
        <View style={styles.sep} />
        <TextInput
          value={formatPhoneLocal(digits)}
          onChangeText={(t) => onChange(phoneDigits(t))}
          placeholder="700 12 34 56"
          placeholderTextColor={colors.textSoft}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus={autoFocus}
          maxLength={12}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmit}
          returnKeyType="next"
          style={styles.phoneInput}
        />
      </View>
      {!!error && (
        <T v="small" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

/** Ячейка кода: цифра «впрыгивает» при вводе. */
function CodeCell({ ch, active, error, success }: { ch?: string; active: boolean; error?: boolean; success?: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!ch) return;
    pop.setValue(0.7);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 14 }).start();
  }, [ch, pop]);
  return (
    <Animated.View
      style={[
        styles.cell,
        ch ? styles.cellFilled : null,
        active && styles.cellActive,
        error && { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
        success && { borderColor: colors.success, backgroundColor: colors.greenSoft },
        { transform: [{ scale: pop }] },
      ]}
    >
      <T style={[styles.cellText, success && { color: colors.success }]}>{ch ?? ''}</T>
      {active && !ch && <Caret />}
    </Animated.View>
  );
}

/** Мигающий курсор в активной ячейке. */
function Caret() {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[styles.caret, { opacity: o }]} />;
}

/** Ввод кода из SMS: N ячеек поверх одного скрытого поля. Ошибка — ряд «встряхивается». */
export function CodeInput({
  length = 4,
  value,
  onChange,
  error,
  success,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  success?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [autoFocus]);
  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -10, 8, -8, 4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true })),
    ).start();
  }, [error, shake]);
  return (
    <Pressable onPress={() => ref.current?.focus()}>
      <Animated.View style={[styles.codeRow, { transform: [{ translateX: shake }] }]}>
      {Array.from({ length }, (_, i) => (
        <CodeCell key={i} ch={value[i]} active={focused && i === Math.min(value.length, length - 1) && !success} error={error} success={success} />
      ))}
      </Animated.View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
  );
}

/** Подсказка с кодом в режиме разработки (SMS не отправляется). */
export function DevCodeHint({ code, onUse }: { code?: string; onUse?: () => void }) {
  if (!code) return null;
  return (
    <Pressable onPress={onUse} style={styles.dev}>
      <T v="caption" color={colors.blueberry} style={{ fontFamily: fonts.bold }}>
        ТЕСТОВЫЙ РЕЖИМ
      </T>
      <T v="small" color={colors.blueberry}>
        Код: <T v="small" color={colors.blueberry} style={{ fontFamily: fonts.extrabold, letterSpacing: 2 }}>{code}</T> · нажмите, чтобы подставить
      </T>
    </Pressable>
  );
}

/** Таймер повторной отправки (сервер разрешает раз в 60 секунд). */
export function useResendTimer(seconds = 60) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, restart: () => setLeft(seconds) };
}

const styles = StyleSheet.create({
  phone: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space.lg,
  },
  focused: { borderColor: colors.mango },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sep: { width: 1.5, height: 22, backgroundColor: colors.border, marginHorizontal: space.md },
  phoneInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
    letterSpacing: 0.5,
    paddingVertical: 8,
    outlineStyle: 'none',
  } as object,
  codeRow: { flexDirection: 'row', gap: space.md, justifyContent: 'center' },
  cell: {
    width: 50,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: colors.cambodia },
  cellActive: { borderColor: colors.mango, borderWidth: 2 },
  cellText: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.text },
  caret: { position: 'absolute', width: 2, height: 24, borderRadius: 1, backgroundColor: colors.mango },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  dev: {
    backgroundColor: colors.iceCube,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
    alignItems: 'center',
  },
});
