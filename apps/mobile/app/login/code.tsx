import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Auth, errorMessage } from '../../src/api';
import { CodeInput, DevCodeHint, useResendTimer } from '../../src/components/auth';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { Button, T, Touchable } from '../../src/components/ui';
import { formatPhone } from '../../src/lib/format';
import { completeLogin } from '../../src/lib/session';
import { colors, fonts, space } from '../../src/theme';

export default function LoginCode() {
  const params = useLocalSearchParams<{ phone: string; devCode?: string; recent?: string }>();
  const phone = params.phone;
  const [devCode, setDevCode] = useState(params.devCode || undefined);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useResendTimer(60);
  const length = devCode?.length ?? 4;

  const verify = async (c = code) => {
    if (c.length < length) return;
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.loginOtp(phone, c);
      await completeLogin(r);
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code.length === length) void verify(code);
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

  return (
    <AuthScaffold
      title="Код из SMS"
      subtitle={
        <T v="body" color={colors.textMuted} style={{ fontSize: 16, lineHeight: 23 }}>
          {params.recent && !devCode ?'Код уже был отправлен на ' : 'Отправили код на '}
          <T v="bodyStrong" style={{ fontSize: 16 }}>
            {formatPhone(phone)}
          </T>
        </T>
      }
      footer={<Button title="Войти" onPress={() => verify()} loading={loading} disabled={code.length < length} />}
    >
      <View style={{ gap: space.lg }}>
        <CodeInput length={length} value={code} onChange={(v) => { setCode(v); setError(null); }} error={!!error} />
        {error && (
          <T v="small" center color={colors.danger} style={{ fontFamily: fonts.semibold }}>
            {error}
          </T>
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
