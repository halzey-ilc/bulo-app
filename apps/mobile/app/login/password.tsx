import React, { useState } from 'react';
import { router } from 'expo-router';
import { Auth, errorMessage } from '../../src/api';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { Icon } from '../../src/components/Icon';
import { Button, Field, T } from '../../src/components/ui';
import { completeLogin } from '../../src/lib/session';
import { colors } from '../../src/theme';

export default function LoginPassword() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!login.trim() || !password) return setError('Введите логин и пароль');
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.loginPassword(login.trim(), password);
      await completeLogin(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold
      title="Вход по логину"
      subtitle="Для гостевых и служебных учётных записей, выданных администратором BULO."
      footer={
        <>
          <Button title="Войти" onPress={submit} loading={loading} />
          <Button title="Войти по номеру телефона" kind="ghost" icon="phone" onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} />
        </>
      }
    >
      <Field
        label="Логин"
        value={login}
        onChangeText={(v) => { setLogin(v); setError(null); }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        left={<Icon name="user" size={20} color={colors.textSoft} />}
        returnKeyType="next"
      />
      <Field
        label="Пароль"
        value={password}
        onChangeText={(v) => { setPassword(v); setError(null); }}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        left={<Icon name="key" size={20} color={colors.textSoft} />}
        onSubmitEditing={submit}
        returnKeyType="go"
        error={error}
      />
      <T v="small" color={colors.mango} onPress={() => setShow(!show)} style={{ alignSelf: 'flex-start' }}>
        {show ? 'Скрыть пароль' : 'Показать пароль'}
      </T>
    </AuthScaffold>
  );
}
