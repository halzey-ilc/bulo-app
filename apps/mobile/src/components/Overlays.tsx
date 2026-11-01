import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '../api';
import { useUi } from '../store/ui';
import { colors, fonts, radius, shadows, space } from '../theme';
import { Icon } from './Icon';
import { Button, Field, T } from './ui';

/** Всплывающее сообщение сверху. */
export function ToastHost() {
  const t = useUi((s) => s.toast);
  const hide = useUi((s) => s.hideToast);
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-120)).current;
  const [shown, setShown] = useState(t);

  useEffect(() => {
    if (!t) return;
    setShown(t);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: -140, duration: 220, useNativeDriver: true }).start(() => hide());
    }, t.kind === 'error' ? 3800 : 2200);
    return () => clearTimeout(timer);
  }, [t, y, hide]);

  if (!shown) return null;
  const palette = {
    success: { bg: colors.cambodia, icon: 'check' as const, fg: colors.oatMilk },
    error: { bg: colors.coffee, icon: 'info' as const, fg: colors.white },
    info: { bg: colors.cambodia, icon: 'info' as const, fg: colors.oatMilk },
  }[shown.kind];
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.toastWrap, { top: insets.top + 8, transform: [{ translateY: y }] }]}
    >
      <Pressable onPress={hide} style={[styles.toast, { backgroundColor: palette.bg }]}>
        <View style={styles.toastIcon}>
          <Icon name={palette.icon} size={18} color={palette.bg} strokeWidth={2.2} />
        </View>
        <T v="bodyStrong" color={palette.fg} style={{ flex: 1 }}>
          {shown.text}
        </T>
      </Pressable>
    </Animated.View>
  );
}

/** Диалог подтверждения (с полем ввода — для причины отклонения и т.п.). Работает на iOS, Android и в вебе. */
export function DialogHost() {
  const d = useUi((s) => s.dialog);
  const close = useUi((s) => s.closeDialog);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(d?.input?.initial ?? '');
    setErr(null);
    setBusy(false);
  }, [d]);

  if (!d) return null;
  const submit = async () => {
    if (d.input?.required && !value.trim()) {
      setErr('Заполните поле');
      return;
    }
    setBusy(true);
    try {
      await d.onConfirm(value.trim());
      close();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : close} />
        <View style={styles.dialog}>
          <T v="h2">{d.title}</T>
          {d.message && (
            <T v="body" color={colors.textMuted}>
              {d.message}
            </T>
          )}
          {d.input && (
            <Field
              autoFocus
              placeholder={d.input.placeholder}
              value={value}
              onChangeText={(v) => {
                setValue(v);
                setErr(null);
              }}
              multiline
              error={err}
            />
          )}
          {!d.input && err && (
            <T v="small" color={colors.danger}>
              {err}
            </T>
          )}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button title={d.cancelText ?? 'Отмена'} kind="ghost" onPress={close} style={{ flex: 1 }} disabled={busy} />
            <Button
              title={d.confirmText ?? 'Да'}
              kind={d.destructive ? 'danger' : 'primary'}
              onPress={submit}
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 16, right: 16, zIndex: 1000, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 480,
    ...shadows.float,
  },
  toastIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.oatMilk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: {
    backgroundColor: colors.oatMilk,
    borderRadius: radius.xxl,
    padding: space.xxl,
    gap: space.md,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    ...shadows.float,
  },
});

export { fonts };
