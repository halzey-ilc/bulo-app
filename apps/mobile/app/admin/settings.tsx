import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../src/api';
import { Admin, Settings } from '../../src/api/admin';
import { OneCCard } from '../../src/components/admin/Dashboard';
import { ActionItem, Group, Label, Note } from '../../src/components/admin/kit';
import { BottomBar, Header, Screen } from '../../src/components/layout';
import { Button, Chip, ErrorState, Field, Skeleton, T } from '../../src/components/ui';
import { money } from '../../src/lib/format';
import { useLoad } from '../../src/lib/useLoad';
import { usePersona } from '../../src/store/auth';
import { toast } from '../../src/store/ui';
import { colors, radius, space } from '../../src/theme';

type Form = Record<'cutoffTime' | 'minOrderSum' | 'companyName' | 'phone' | 'email' | 'address' | 'workHours' | 'instagram' | 'whatsapp' | 'telegram', string>;
const KEYS: (keyof Form)[] = ['cutoffTime', 'minOrderSum', 'companyName', 'phone', 'email', 'address', 'workHours', 'instagram', 'whatsapp', 'telegram'];
const toForm = (s: Settings): Form => Object.fromEntries(KEYS.map((k) => [k, s[k] == null ? '' : String(s[k])])) as Form;
const TIMES = ['12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export default function SettingsScreen() {
  const persona = usePersona();
  const isAdmin = persona === 'admin';
  const s = useLoad(() => Admin.settings(), [], { refetchOnFocus: false });
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s.data && !f) setF(toForm(s.data));
  }, [s.data, f]);

  if (!s.data || !f) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Настройки" />
        {s.error ? <ErrorState message={s.error} onRetry={s.refresh} /> : <View style={{ padding: space.lg, gap: space.md }}><Skeleton style={{ height: 180, borderRadius: radius.xl }} /><Skeleton style={{ height: 300, borderRadius: radius.xl }} /></View>}
      </View>
    );
  }

  const base = toForm(s.data);
  const dirty = KEYS.some((k) => f[k] !== base[k]);
  const set = (k: keyof Form) => (v: string) => setF({ ...f, [k]: v });
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(f.cutoffTime);
  const sum = Number(f.minOrderSum.replace(/\s/g, '').replace(',', '.'));

  const save = async () => {
    if (!timeOk) return toast.error('Время в формате ЧЧ:ММ');
    if (!(sum >= 0)) return toast.error('Минимальная сумма — число');
    const dto: Partial<Settings> = {};
    for (const k of KEYS) if (f[k] !== base[k]) (dto as Record<string, unknown>)[k] = k === 'minOrderSum' ? sum : f[k].trim();
    setBusy(true);
    try {
      const saved = await Admin.saveSettings(dto);
      s.setData(saved);
      setF(toForm(saved));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ro = !isAdmin;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Настройки" subtitle={ro ? 'Только просмотр' : undefined} />
      <Screen refreshing={s.refreshing} onRefresh={s.refresh} contentStyle={{ paddingBottom: dirty ? 140 : 48 }}>
        {ro && <Note text="Менять настройки может администратор." />}

        <Label>Приём заказов</Label>
        <Group>
          <Field label="Приём заказов на завтра до" value={f.cutoffTime} onChangeText={set('cutoffTime')} editable={!ro} maxLength={5} placeholder="16:00" error={f.cutoffTime && !timeOk ? 'ЧЧ:ММ' : null} />
          {!ro && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {TIMES.map((t) => (
                <Chip key={t} label={t} active={f.cutoffTime === t} onPress={() => set('cutoffTime')(t)} />
              ))}
            </View>
          )}
          <T v="small" color={colors.textMuted}>
            После {timeOk ? f.cutoffTime : '…'} заказ уходит на послезавтра.
          </T>
          <Field label="Минимальная сумма заказа, сом" value={f.minOrderSum} onChangeText={(v) => set('minOrderSum')(v.replace(/[^\d.,]/g, ''))} editable={!ro} keyboardType="decimal-pad" hint={sum >= 0 ? `Сейчас: ${money(sum) || '0 сом'}` : undefined} />
        </Group>

        <Label>Компания и контакты</Label>
        <Group>
          <Field label="Название" value={f.companyName} onChangeText={set('companyName')} editable={!ro} />
          <Field label="Телефон" value={f.phone} onChangeText={set('phone')} editable={!ro} keyboardType="phone-pad" />
          <Field label="Почта" value={f.email} onChangeText={set('email')} editable={!ro} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Адрес" value={f.address} onChangeText={set('address')} editable={!ro} />
          <Field label="Часы работы" value={f.workHours} onChangeText={set('workHours')} editable={!ro} placeholder="Пн–Сб 8:00–20:00" />
        </Group>

        <Label>Соцсети</Label>
        <Group>
          <Field label="Instagram" value={f.instagram} onChangeText={set('instagram')} editable={!ro} autoCapitalize="none" placeholder="@bulo.kg" />
          <Field label="WhatsApp" value={f.whatsapp} onChangeText={set('whatsapp')} editable={!ro} keyboardType="phone-pad" />
          <Field label="Telegram" value={f.telegram} onChangeText={set('telegram')} editable={!ro} autoCapitalize="none" />
        </Group>

        {isAdmin && (
          <>
            <Label>Обмен с 1С</Label>
            <OneCCard />
          </>
        )}

        <Label>Ещё</Label>
        <View style={{ gap: space.sm }}>
          <ActionItem icon="tag" title="Каталог и цены" subtitle="Видимость, новинки, фото" onPress={() => router.push('/admin/catalog')} />
          <ActionItem icon="lock" title="Сменить свой пароль" onPress={() => router.push('/admin/password')} />
        </View>
      </Screen>
      {dirty && (
        <BottomBar>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Отменить" kind="ghost" onPress={() => setF(toForm(s.data!))} style={{ flex: 1 }} />
            <Button title="Сохранить" icon="check" onPress={save} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </BottomBar>
      )}
    </View>
  );
}
