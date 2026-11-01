import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Auth, errorMessage } from '../src/api';
import { CodeInput, DevCodeHint, PhoneField, useResendTimer } from '../src/components/auth';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { Button, T, Touchable } from '../src/components/ui';
import { formatPhone } from '../src/lib/format';
import { useAuth } from '../src/store/auth';
import { toast } from '../src/store/ui';
import { colors, fonts, space } from '../src/theme';

export default function ChangePhone() {
  const current = useAuth((s) => s.user?.phone);
  const [digits, setDigits] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useResendTimer(60);
  const phone = `+996${digits}`;
  const len = devCode?.length ?? 4;

  const send = async () => {
    if (digits.length !== 9) return setError('Введите 9 цифр номера');
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.requestOtp(phone, 'CHANGE_PHONE');
      setDevCode(r.devCode || undefined);
      timer.restart();
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await Auth.changePhone(phone, code);
      await useAuth.getState().refresh();
      toast.success('Номер телефона изменён');
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Смена телефона" onBack={step === 'code' ? () => setStep('phone') : undefined} />
      <Screen>
        {step === 'phone' ? (
          <>
            <T v="body" color={colors.textMuted}>
              {current ? `Сейчас: ${formatPhone(current)}. ` : ''}Введите новый номер — отправим на него код подтверждения.
            </T>
            <PhoneField digits={digits} onChange={(d) => { setDigits(d); setError(null); }} autoFocus onSubmit={send} error={error} />
          </>
        ) : (
          <View style={{ gap: space.lg }}>
            <T v="body" color={colors.textMuted}>
              Код отправлен на <T v="bodyStrong">{formatPhone(phone)}</T>
            </T>
            <CodeInput length={len} value={code} onChange={(v) => { setCode(v); setError(null); }} error={!!error} />
            {error && (
              <T v="small" center color={colors.danger} style={{ fontFamily: fonts.semibold }}>
                {error}
              </T>
            )}
            <DevCodeHint code={devCode} onUse={() => setCode(devCode ?? '')} />
            <View style={{ alignItems: 'center' }}>
              {timer.left > 0 ? (
                <T v="small" color={colors.textSoft}>
                  Повторно через 0:{String(timer.left).padStart(2, '0')}
                </T>
              ) : (
                <Touchable onPress={send}>
                  <T v="bodyStrong" color={colors.mango}>
                    Отправить код ещё раз
                  </T>
                </Touchable>
              )}
            </View>
          </View>
        )}
      </Screen>
      <BottomBar>
        {step === 'phone' ? (
          <Button title="Получить код" onPress={send} loading={loading} disabled={digits.length !== 9} />
        ) : (
          <Button title="Подтвердить" onPress={confirm} loading={loading} disabled={code.length < len} />
        )}
      </BottomBar>
    </View>
  );
}
