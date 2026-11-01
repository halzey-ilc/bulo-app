import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ApiError, Auth, errorMessage } from '../../src/api';
import { PhoneField } from '../../src/components/auth';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { Icon } from '../../src/components/Icon';
import { Button, Card, T } from '../../src/components/ui';
import { colors, fonts, space } from '../../src/theme';

export default function LoginPhone() {
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
    <AuthScaffold
      title="Вход"
      subtitle="Введите номер телефона — пришлём код в SMS."
      footer={
        <>
          <Button title="Получить код" onPress={submit} loading={loading} disabled={!valid} />
          <Button title="Войти по логину и паролю" kind="ghost" icon="key" onPress={() => router.push('/login/password')} />
        </>
      }
    >
      <PhoneField digits={digits} onChange={(d) => { setDigits(d); setError(null); setNotFound(false); }} autoFocus onSubmit={submit} error={error} />
      {notFound && (
        <Card style={{ gap: space.sm, backgroundColor: colors.softYellow }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="shop" size={22} color={colors.mango} />
            <T v="h3" style={{ flex: 1 }}>
              Номер не зарегистрирован
            </T>
          </View>
          <T v="small" color={colors.textMuted}>
            Если вы представляете кофейню или магазин — подайте заявку, и мы откроем доступ к оптовым ценам.
          </T>
          <Button title="Стать партнёром" small icon="arrowRight" onPress={() => router.replace({ pathname: '/register', params: { phone: digits } })} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        </Card>
      )}
      <T v="small" color={colors.textSoft} style={{ fontFamily: fonts.medium }}>
        Нажимая «Получить код», вы соглашаетесь на обработку номера телефона для входа в приложение.
      </T>
    </AuthScaffold>
  );
}
