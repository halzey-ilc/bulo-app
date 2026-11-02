import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../src/api';
import { Admin } from '../../src/api/admin';
import { AIcon } from '../../src/components/admin/icons';
import { Group, Note } from '../../src/components/admin/kit';
import { generatePassword } from '../../src/components/admin/UserSheet';
import { BottomBar, Header, Screen } from '../../src/components/layout';
import { Button, Field, T, Touchable } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth';
import { toast } from '../../src/store/ui';
import { colors, fonts, space } from '../../src/theme';

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/\d/.test(p) && /[a-zа-я]/i.test(p)) s++;
  if (/[^a-z0-9]/i.test(p)) s++;
  return Math.min(s, 3);
}
const LABELS = ['Слабый', 'Нормальный', 'Хороший', 'Надёжный'];
const COLORS = [colors.danger, '#C98A00', colors.success, colors.success];

/** Смена своего пароля. Сервер выдаёт новый токен — сохраняем его, чтобы не выкинуло. */
export default function PasswordScreen() {
  const user = useAuth((s) => s.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const st = strength(next);
  const valid = next.length >= 6 && next === repeat;

  const submit = async () => {
    if (next.length < 6) return setErr('Минимум 6 символов');
    if (next !== repeat) return setErr('Пароли не совпадают');
    setBusy(true);
    setErr(null);
    try {
      const r = await Admin.changePassword(next, current);
      await useAuth.getState().signIn(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success('Пароль изменён. На других устройствах нужно войти заново');
      router.back();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Смена пароля" subtitle={user?.login ? `Логин: ${user.login}` : undefined} />
      <Screen contentStyle={{ paddingBottom: 140 }}>
        <Group>
          <Field label="Текущий пароль" secureTextEntry={!show} value={current} onChangeText={setCurrent} autoCapitalize="none" placeholder="Если пароля ещё не было — оставьте пустым" />
          <Field label="Новый пароль" secureTextEntry={!show} value={next} onChangeText={(v) => { setNext(v); setErr(null); }} autoCapitalize="none" />
          {next.length > 0 && (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= st ? COLORS[st] : 'rgba(38,66,43,0.1)' }} />
                ))}
              </View>
              <T v="small" color={COLORS[st]} style={{ fontFamily: fonts.bold }}>
                {LABELS[st]}
              </T>
            </View>
          )}
          <Field label="Повторите" secureTextEntry={!show} value={repeat} onChangeText={(v) => { setRepeat(v); setErr(null); }} autoCapitalize="none" error={err ?? (repeat && next !== repeat ? 'Пароли не совпадают' : null)} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Touchable
              haptic
              onPress={() => {
                const p = generatePassword();
                setNext(p);
                setRepeat(p);
                setShow(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <AIcon name="dice" size={18} color={colors.mango} />
              <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                Придумать за меня
              </T>
            </Touchable>
            <View style={{ flex: 1 }} />
            <Touchable haptic onPress={() => setShow(!show)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AIcon name={show ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
              <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
                {show ? 'Скрыть' : 'Показать'}
              </T>
            </Touchable>
          </View>
        </Group>
        <Note text="После смены пароля вход на других устройствах закроется. На этом устройстве вы останетесь в приложении." />
      </Screen>
      <BottomBar>
        <Button title="Сменить пароль" icon="check" onPress={submit} loading={busy} disabled={!valid} />
      </BottomBar>
    </View>
  );
}
