import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError, Auth, errorMessage } from '../src/api';
import { CodeInput, DevCodeHint, PhoneField, useResendTimer } from '../src/components/auth';
import { AuthScaffold } from '../src/components/AuthScaffold';
import { Icon } from '../src/components/Icon';
import { Button, Field, T, Touchable } from '../src/components/ui';
import { formatPhone } from '../src/lib/format';
import { completeLogin } from '../src/lib/session';
import { toast } from '../src/store/ui';
import { colors, fonts, radius, space } from '../src/theme';

type Step = 'phone' | 'code' | 'form';

export default function Register() {
  const params = useLocalSearchParams<{ phone?: string }>();
  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState(params.phone ?? '');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [form, setForm] = useState({ partnerName: '', contactName: '', address: '', inn: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useResendTimer(60);
  const phone = `+996${digits}`;
  const codeLen = devCode?.length ?? 4;

  const sendCode = async () => {
    if (digits.length !== 9) return setError('Введите 9 цифр номера');
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.requestOtp(phone, 'REGISTER');
      setDevCode(r.devCode || undefined);
      timer.restart();
      setStep('code');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Этот номер уже зарегистрирован — войдите по нему.');
      } else if (e instanceof ApiError && e.status === 429) {
        setStep('code');
      } else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (form.partnerName.trim().length < 2) errs.partnerName = 'Укажите название заведения';
    if (form.contactName.trim().length < 2) errs.contactName = 'Как к вам обращаться?';
    if (form.address.trim().length < 5) errs.address = 'Адрес — хотя бы улица и дом';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Проверьте почту';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError(null);
    try {
      const r = await Auth.register({
        phone,
        code,
        partnerName: form.partnerName.trim(),
        contactName: form.contactName.trim(),
        address: form.address.trim(),
        inn: form.inn.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      await completeLogin(r, false);
      toast.success('Заявка отправлена! Мы скоро свяжемся с вами');
    } catch (e) {
      const msg = errorMessage(e);
      if (/код/i.test(msg)) {
        setStep('code');
        setCode('');
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const back = () => {
    if (step === 'form') setStep('code');
    else if (step === 'code') setStep('phone');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Android «назад» — на предыдущий шаг, а не закрытие экрана.
  useEffect(() => {
    if (step === 'phone') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(step === 'form' ? 'code' : 'phone');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const stepIdx = step === 'phone' ? 0 : step === 'code' ? 1 : 2;

  return (
    <AuthScaffold
      onBack={back}
      title={step === 'form' ? 'О вашем заведении' : 'Стать партнёром'}
      subtitle={
        step === 'phone'
          ? 'Кофейни, магазины и рестораны получают оптовые цены и заказывают выпечку BULO прямо в приложении.'
          : step === 'code'
            ? `Введите код, отправленный на ${formatPhone(phone)}`
            : 'Менеджер проверит данные и откроет доступ к ценам.'
      }
      footer={
        step === 'phone' ? (
          <Button title="Получить код" onPress={sendCode} loading={loading} disabled={digits.length !== 9} />
        ) : step === 'code' ? (
          <Button title="Дальше" disabled={code.length < codeLen} onPress={() => { setError(null); setStep('form'); }} />
        ) : (
          <Button title="Отправить заявку" icon="send" onPress={submit} loading={loading} />
        )
      }
    >
      <View style={styles.steps}>
        {['Телефон', 'Код', 'Заведение'].map((s, i) => (
          <View key={s} style={{ flex: 1, gap: 6 }}>
            <View style={[styles.stepBar, i <= stepIdx && { backgroundColor: colors.mango }]} />
            <T v="caption" color={i <= stepIdx ? colors.text : colors.textSoft} style={{ fontFamily: fonts.bold }}>
              {s}
            </T>
          </View>
        ))}
      </View>

      {step === 'phone' && (
        <>
          <PhoneField digits={digits} onChange={(d) => { setDigits(d); setError(null); }} autoFocus onSubmit={sendCode} error={error} />
          <View style={styles.perks}>
            {[
              { icon: 'card' as const, text: 'Оптовые цены для партнёров' },
              { icon: 'clock' as const, text: 'Заказ до 16:00 — доставка завтра' },
              { icon: 'truck' as const, text: 'Доставка по Бишкеку' },
            ].map((p) => (
              <View key={p.text} style={styles.perk}>
                <View style={styles.perkIcon}>
                  <Icon name={p.icon} size={18} color={colors.mango} />
                </View>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {p.text}
                </T>
              </View>
            ))}
          </View>
          {error?.includes('уже зарегистрирован') && (
            <Button title="Войти" kind="secondary" onPress={() => router.replace('/login')} />
          )}
        </>
      )}

      {step === 'code' && (
        <View style={{ gap: space.lg }}>
          <CodeInput length={codeLen} value={code} onChange={(v) => { setCode(v); setError(null); }} error={!!error} />
          {error && (
            <T v="small" center color={colors.danger} style={{ fontFamily: fonts.semibold }}>
              {error}
            </T>
          )}
          <DevCodeHint code={devCode} onUse={() => setCode(devCode ?? '')} />
          <View style={{ alignItems: 'center' }}>
            {timer.left > 0 ? (
              <T v="small" color={colors.textSoft}>
                Отправить повторно через 0:{String(timer.left).padStart(2, '0')}
              </T>
            ) : (
              <Touchable onPress={sendCode}>
                <T v="bodyStrong" color={colors.mango}>
                  Отправить код ещё раз
                </T>
              </Touchable>
            )}
          </View>
        </View>
      )}

      {step === 'form' && (
        <View style={{ gap: space.lg }}>
          <Field label="Название заведения *" placeholder="Кофейня «Утро»" value={form.partnerName} onChangeText={set('partnerName')} error={errors.partnerName} />
          <Field label="Контактное лицо *" placeholder="Имя" value={form.contactName} onChangeText={set('contactName')} error={errors.contactName} autoComplete="name" />
          <Field label="Адрес доставки *" placeholder="г. Бишкек, ул. Киевская, 95" value={form.address} onChangeText={set('address')} error={errors.address} />
          <Field label="ИНН" placeholder="Необязательно" value={form.inn} onChangeText={set('inn')} keyboardType="number-pad" maxLength={20} />
          <Field label="Эл. почта" placeholder="Необязательно" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          {error && (
            <View style={styles.err}>
              <Icon name="info" size={18} color={colors.danger} />
              <T v="small" color={colors.danger} style={{ flex: 1, fontFamily: fonts.semibold }}>
                {error}
              </T>
            </View>
          )}
        </View>
      )}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: space.sm },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(38,66,43,0.12)' },
  perks: { gap: space.sm },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md },
  perkIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  err: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.dangerSoft, padding: space.md, borderRadius: radius.md },
});
