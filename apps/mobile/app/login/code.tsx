import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Auth, errorMessage } from '../../src/api';
import { CodeInput, DevCodeHint, useResendTimer } from '../../src/components/auth';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { Icon } from '../../src/components/Icon';
import { FadeIn } from '../../src/components/motion';
import { Button, Field, hapticImpact, T, Touchable } from '../../src/components/ui';
import { formatPhone } from '../../src/lib/format';
import { completeLogin } from '../../src/lib/session';
import { colors, fonts, space } from '../../src/theme';

/**
 * Код из SMS. Новый номер — тут же спрашиваем имя и создаём аккаунт гостя (без заявок и ожидания).
 * Код подставляется сам (SMS-автозаполнение на Android и iOS), вход — как только введены все цифры.
 */
export default function LoginCode() {
  const params = useLocalSearchParams<{ phone: string; devCode?: string; recent?: string; isNew?: string; name?: string }>();
  const phone = params.phone;
  const isNew = params.isNew === '1';
  const [devCode, setDevCode] = useState(params.devCode || undefined);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const timer = useResendTimer(60);
  const length = devCode?.length ?? 4;
  const nameRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const nameOk = !isNew || name.trim().length >= 2;

  const verify = async (c = code) => {
    if (c.length < length) return;
    if (!nameOk) {
      setError('Как вас зовут? Напишите имя — так бариста узнает ваш заказ');
      nameRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.loginOtp(phone, c, isNew ? name : undefined);
      setOk(true);
      await new Promise((res) => setTimeout(res, 350));
      await completeLogin(r);
    } catch (e) {
      hapticImpact(true);
      setError(errorMessage(e));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code.length === length && nameOk) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    setError(null);
    try {
      const r = await Auth.requestOtp(phone, 'LOGIN');
      setDevCode(r.devCode || undefined);
      timer.restart();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const hello = params.name ? `С возвращением, ${params.name.split(/\s+/)[0]}!` : null;

  return (
    <AuthScaffold
      title={isNew ? 'Добро пожаловать!' : hello ?? 'Код из SMS'}
      subtitle={
        <T v="body" color={colors.textMuted} style={{ fontSize: 16, lineHeight: 23 }}>
          {params.recent && !devCode ? 'Код уже был отправлен на ' : 'Отправили код на '}
          <T v="bodyStrong" style={{ fontSize: 16 }}>
            {formatPhone(phone)}
          </T>
        </T>
      }
      footer={
        <Button
          title={isNew ? 'Создать аккаунт' : 'Войти'}
          icon={ok ? 'check' : undefined}
          onPress={() => verify()}
          loading={loading}
          disabled={code.length < length || !nameOk}
        />
      }
    >
      <View style={{ gap: space.lg }}>
        {isNew && (
          <FadeIn offset={8} style={{ gap: space.sm }}>
            <Field
              inputRef={nameRef}
              label="Как вас зовут?"
              placeholder="Например, Айгерим"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="givenName"
              maxLength={60}
              left={<Icon name="user" size={20} color={colors.textSoft} />}
              returnKeyType="next"
              onSubmitEditing={() => code.length === length && verify()}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="gift" size={16} color={colors.coffee} />
              <T v="small" color={colors.coffee} style={{ flex: 1, fontFamily: fonts.semibold }}>
                После входа заведём карту гостя — каждый 7-й кофе в подарок
              </T>
            </View>
          </FadeIn>
        )}
        <CodeInput
          length={length}
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          error={!!error}
          success={ok}
          autoFocus={!isNew}
        />
        {error && (
          <FadeIn offset={4}>
            <T v="small" center color={colors.danger} style={{ fontFamily: fonts.semibold }}>
              {error}
            </T>
          </FadeIn>
        )}
        <DevCodeHint code={devCode} onUse={() => setCode(devCode ?? '')} />
        <View style={{ alignItems: 'center' }}>
          {timer.left > 0 ? (
            <T v="small" color={colors.textSoft}>
              Отправить код повторно через 0:{String(timer.left).padStart(2, '0')}
            </T>
          ) : (
            <Touchable onPress={resend}>
              <T v="bodyStrong" color={colors.mango}>
                Отправить код ещё раз
              </T>
            </Touchable>
          )}
        </View>
      </View>
    </AuthScaffold>
  );
}
