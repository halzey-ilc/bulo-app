import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ApiError, errorMessage } from '../src/api';
import { Icon } from '../src/components/Icon';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { ProgressBar } from '../src/components/motion';
import { Button, Field, hapticSuccess, T, Touchable } from '../src/components/ui';
import { changePassword, passwordStrength } from '../src/lib/account';
import { useAuth } from '../src/store/auth';
import { usePrefs } from '../src/store/prefs';
import { toast } from '../src/store/ui';
import { colors, fonts, radius, space } from '../src/theme';

const STRENGTH_COLORS = [colors.danger, colors.danger, '#D99A00', colors.success, colors.success];

/** Смена пароля: текущий (если был), новый и повтор. После смены другие устройства выходят из аккаунта. */
export default function ChangePassword() {
  const user = useAuth((s) => s.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const repeatRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const strength = passwordStrength(next);
  const mismatch = repeat.length > 0 && repeat !== next;
  const canSubmit = next.length >= 6 && repeat === next && !loading;

  const submit = async () => {
    setError(null);
    if (next.length < 6) return setError('Пароль — минимум 6 символов');
    if (next !== repeat) return setError('Пароли не совпадают');
    setLoading(true);
    try {
      const r = await changePassword({ currentPassword: current || undefined, newPassword: next });
      await useAuth.getState().signIn(r);
      if (r.user.login) usePrefs.getState().setLastLogin(r.user.login);
      hapticSuccess();
      toast.success('Пароль изменён. На других устройствах нужно войти заново');
      router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 && !current ? 'Укажите текущий пароль' : errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const eye = (
    <Touchable hitSlop={10} onPress={() => setShow(!show)} accessibilityLabel={show ? 'Скрыть пароли' : 'Показать пароли'} style={styles.eye}>
      <Icon name={show ? 'eyeOff' : 'eye'} size={20} color={show ? colors.mango : colors.textSoft} />
    </Touchable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <Header title="Смена пароля" subtitle={user?.login ? `Логин: ${user.login}` : undefined} />
      <Screen contentStyle={{ gap: space.lg, paddingBottom: 140 }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="lock" size={26} color={colors.mango} />
          </View>
          <T v="body" color={colors.textMuted} style={{ flex: 1 }}>
            Придумайте пароль от 6 символов. После смены на других устройствах нужно будет войти заново.
          </T>
        </View>
        {user?.hasPassword !== false && <Field
          label="Текущий пароль"
          value={current}
          onChangeText={(v) => {
            setCurrent(v);
            setError(null);
          }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          left={<Icon name="key" size={20} color={colors.textSoft} />}
          right={eye}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => nextRef.current?.focus()}
        />}
        <View style={{ gap: space.sm }}>
          <Field
            inputRef={nextRef}
            label="Новый пароль"
            value={next}
            onChangeText={(v) => {
              setNext(v);
              setError(null);
            }}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            left={<Icon name="lock" size={20} color={colors.textSoft} />}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => repeatRef.current?.focus()}
          />
          {next.length > 0 && (
            <View style={{ gap: 6 }}>
              <ProgressBar value={(strength.score + 1) / 5} color={STRENGTH_COLORS[strength.score]} track="rgba(38,66,43,0.08)" height={6} />
              <T v="small" color={STRENGTH_COLORS[strength.score]} style={{ fontFamily: fonts.bold }}>
                {strength.label}
              </T>
            </View>
          )}
        </View>
        <Field
          inputRef={repeatRef}
          label="Повторите новый пароль"
          value={repeat}
          onChangeText={(v) => {
            setRepeat(v);
            setError(null);
          }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          left={<Icon name={repeat && !mismatch ? 'check' : 'lock'} size={20} color={repeat && !mismatch ? colors.success : colors.textSoft} />}
          error={mismatch ? 'Пароли не совпадают' : null}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Screen>
      <BottomBar>
        {error && (
          <View style={styles.error}>
            <Icon name="info" size={18} color={colors.danger} />
            <T v="small" color={colors.danger} style={{ flex: 1, fontFamily: fonts.semibold }}>
              {error}
            </T>
          </View>
        )}
        <Button title="Сохранить пароль" icon="check" onPress={submit} loading={loading} disabled={!canSubmit} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  eye: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  error: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    padding: space.md,
    borderRadius: radius.md,
  },
});
