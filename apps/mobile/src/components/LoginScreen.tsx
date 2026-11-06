import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ApiError, Auth, errorMessage } from '../api';
import { completeLogin } from '../lib/session';
import { usePrefs } from '../store/prefs';
import { colors, fonts, radius, space } from '../theme';
import { PhoneField } from './auth';
import { AuthScaffold } from './AuthScaffold';
import { Icon } from './Icon';
import { FadeIn, Segmented } from './motion';
import { Button, Field, T, Touchable } from './ui';

type Tab = 'phone' | 'password';

/**
 * Единый вход для всех ролей: «По номеру» (код из SMS) или «Логин и пароль»,
 * выданные администратором BULO. После входа — «домашняя» вкладка своей роли.
 */
export function LoginScreen({ initialTab }: { initialTab?: Tab }) {
  const savedTab = usePrefs((s) => s.loginTab);
  const [tab, setTabState] = useState<Tab>(initialTab ?? savedTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    usePrefs.getState().setLoginTab(t);
  };

  return (
    <AuthScaffold
      title="Вход в BULO"
      subtitle="По номеру телефона или по логину и паролю."
    >
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'phone', label: 'По номеру', icon: 'phone' },
          { key: 'password', label: 'Логин и пароль', icon: 'key' },
        ]}
      />
      {tab === 'phone' ? (
        <FadeIn key="phone" offset={8}>
          <PhoneForm />
        </FadeIn>
      ) : (
        <FadeIn key="password" offset={8}>
          <PasswordForm />
        </FadeIn>
      )}
      <View style={{ flex: 1 }} />
      <PartnerCta />
    </AuthScaffold>
  );
}

function PhoneForm() {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const valid = digits.length === 9;
  const phone = `+996${digits}`;

  const submit = async () => {
    if (!valid) return setError('Введите 9 цифр номера');
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const r = await Auth.requestOtp(phone, 'LOGIN');
      router.push({ pathname: '/login/code', params: { phone: r.phone || phone, devCode: r.devCode ?? '' } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else if (e instanceof ApiError && e.status === 429) {
        // код уже отправлен недавно — можно ввести его
        router.push({ pathname: '/login/code', params: { phone, devCode: '', recent: '1' } });
      } else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <PhoneField
        digits={digits}
        onChange={(d) => {
          setDigits(d);
          setError(null);
          setNotFound(false);
        }}
        onSubmit={submit}
        error={error}
      />
      <Button title="Получить код" icon="arrowRight" onPress={submit} loading={loading} disabled={!valid} />
      {notFound && (
        <FadeIn>
          <View style={styles.notFound}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name="shop" size={22} color={colors.mango} />
              <T v="h3" style={{ flex: 1 }}>
                Номер не зарегистрирован
              </T>
            </View>
            <T v="small" color={colors.textMuted}>
              Если вам выдали логин и пароль — войдите на соседней вкладке. Если вы кофейня или магазин — подайте заявку,
              и мы откроем оптовые цены.
            </T>
            <Button
              title="Стать партнёром"
              small
              icon="arrowRight"
              onPress={() => router.replace({ pathname: '/register', params: { phone: digits } })}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            />
          </View>
        </FadeIn>
      )}
      <T v="small" color={colors.textSoft}>
        Пришлём одноразовый код в SMS. Нажимая «Получить код», вы соглашаетесь на обработку номера для входа.
      </T>
    </View>
  );
}

function PasswordForm() {
  const lastLogin = usePrefs((s) => s.lastLogin);
  const [login, setLogin] = useState(lastLogin);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwdRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    if (!login.trim() || !password) return setError('Введите логин и пароль');
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.loginPassword(login.trim(), password);
      usePrefs.getState().setLastLogin(login.trim());
      await completeLogin(r);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Неверный логин или пароль' : errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <Field
        label="Логин"
        placeholder="Например, anna.bulo"
        value={login}
        onChangeText={(v) => {
          setLogin(v);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        importantForAutofill="yes"
        left={<Icon name="user" size={20} color={colors.textSoft} />}
        right={
          login ? (
            <Touchable hitSlop={10} onPress={() => setLogin('')} accessibilityLabel="Очистить логин">
              <Icon name="close" size={18} color={colors.textSoft} />
            </Touchable>
          ) : null
        }
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => pwdRef.current?.focus()}
      />
      <Field
        inputRef={pwdRef}
        label="Пароль"
        placeholder="••••••"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setError(null);
        }}
        autoFocus={!!lastLogin}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        textContentType="password"
        left={<Icon name="lock" size={20} color={colors.textSoft} />}
        right={
          <Touchable
            hitSlop={10}
            onPress={() => setShow(!show)}
            accessibilityRole="button"
            accessibilityLabel={show ? 'Скрыть пароль' : 'Показать пароль'}
            style={styles.eye}
          >
            <Icon name={show ? 'eyeOff' : 'eye'} size={20} color={show ? colors.mango : colors.textSoft} />
          </Touchable>
        }
        onSubmitEditing={submit}
        returnKeyType="go"
        error={error}
      />
      <Button title="Войти" icon="login" onPress={submit} loading={loading} disabled={!login.trim() || !password} />
      <View style={styles.hint}>
        <Icon name="info" size={18} color={colors.blueberry} />
        <T v="small" color={colors.blueberry} style={{ flex: 1, fontFamily: fonts.semibold }}>
          Логин и пароль выдаёт администратор BULO — для сотрудников, клиентов и гостей. Забыли пароль? Позвоните менеджеру.
        </T>
      </View>
    </View>
  );
}

function PartnerCta() {
  return (
    <Touchable onPress={() => router.push('/register')} style={styles.partner} scaleTo={0.98} haptic>
      <View style={styles.partnerIcon}>
        <Icon name="shop" size={20} color={colors.mango} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">Стать партнёром</T>
        <T v="small" color={colors.textMuted}>
          Для кофеен и магазинов — оптовые цены
        </T>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textSoft} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  notFound: { gap: space.sm, backgroundColor: colors.softYellow, borderRadius: radius.xl, padding: space.lg },
  eye: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hint: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    backgroundColor: colors.iceCube,
    padding: space.md,
    borderRadius: radius.lg,
  },
  partner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: colors.primarySoft,
  },
  partnerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
