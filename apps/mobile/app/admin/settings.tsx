import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../src/api';
import { Admin, Settings } from '../../src/api/admin';
import { OneCCard } from '../../src/components/admin/Dashboard';
import { ActionItem, Group, Label, Note, ToggleRow } from '../../src/components/admin/kit';
import { BottomBar, Header, Screen } from '../../src/components/layout';
import { Button, Chip, ErrorState, Field, Skeleton, T } from '../../src/components/ui';
import { money } from '../../src/lib/format';
import { useLoad } from '../../src/lib/useLoad';
import { usePersona } from '../../src/store/auth';
import { toast } from '../../src/store/ui';
import { colors, radius, space } from '../../src/theme';

const KEYS = [
  'cutoffTime',
  'minOrderSum',
  'companyName',
  'phone',
  'email',
  'address',
  'workHours',
  'instagram',
  'whatsapp',
  'telegram',
  'qrPayload',
  'bankRecipient',
  'bankName',
  'bankAccount',
  'bankBik',
  'bankInn',
  'promoEvery',
  'workshopWarehouseId',
] as const;
type Form = Record<(typeof KEYS)[number], string> & { qrWithAmount: boolean; promoEnabled: boolean };
const toForm = (s: Settings): Form =>
  ({
    ...Object.fromEntries(KEYS.map((k) => [k, s[k] == null ? '' : String(s[k])])),
    qrWithAmount: !!s.qrWithAmount,
    promoEnabled: s.promoEnabled !== false,
  }) as Form;
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
  const dirty = KEYS.some((k) => f[k] !== base[k]) || f.qrWithAmount !== base.qrWithAmount || f.promoEnabled !== base.promoEnabled;
  const set = (k: (typeof KEYS)[number]) => (v: string) => setF({ ...f, [k]: v });
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(f.cutoffTime);
  const sum = Number(f.minOrderSum.replace(/\s/g, '').replace(',', '.'));
  const every = Number(f.promoEvery);

  const save = async () => {
    if (!timeOk) return toast.error('Время в формате ЧЧ:ММ');
    if (!(sum >= 0)) return toast.error('Минимальная сумма — число');
    if (!(every >= 2)) return toast.error('Акция: каждый N-й кофе, N от 2');
    const dto: Partial<Settings> = {};
    for (const k of KEYS)
      if (f[k] !== base[k]) (dto as Record<string, unknown>)[k] = k === 'minOrderSum' ? sum : k === 'promoEvery' ? every : f[k].trim();
    if (f.qrWithAmount !== base.qrWithAmount) dto.qrWithAmount = f.qrWithAmount;
    if (f.promoEnabled !== base.promoEnabled) dto.promoEnabled = f.promoEnabled;
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

  const ro = !(isAdmin || persona === 'manager');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Настройки" subtitle={ro ? 'Только просмотр' : undefined} />
      <Screen refreshing={s.refreshing} onRefresh={s.refresh} contentStyle={{ paddingBottom: dirty ? 140 : 48 }}>
        {ro && <Note text="Менять настройки может администратор или менеджер." />}

        <Label>Оплата</Label>
        <Group>
          <Field
            label="QR для оплаты (строка или ссылка из банка)"
            value={f.qrPayload}
            onChangeText={set('qrPayload')}
            editable={!ro}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            placeholder="https://optimabank.kg/…#000201…"
            hint={f.qrPayload ? 'Гостям и партнёрам показываем этот QR с номером заказа' : 'Без QR оплатить можно наличными или на счёт'}
          />
          <ToggleRow
            title="Подставлять сумму в QR"
            subtitle="Покупателю не нужно вводить сумму. Включите после проверки в приложении банка"
            value={f.qrWithAmount}
            onChange={(v) => setF({ ...f, qrWithAmount: v })}
            disabled={ro}
            icon="qr"
          />
          <Field label="Получатель" value={f.bankRecipient} onChangeText={set('bankRecipient')} editable={!ro} placeholder="ОсОО «…»" />
          <Field label="Банк" value={f.bankName} onChangeText={set('bankName')} editable={!ro} placeholder="ОАО «Оптима Банк»" />
          <Field label="Расчётный счёт" value={f.bankAccount} onChangeText={(v) => set('bankAccount')(v.replace(/[^\d\s]/g, ''))} editable={!ro} keyboardType="number-pad" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Field label="БИК" value={f.bankBik} onChangeText={set('bankBik')} editable={!ro} keyboardType="number-pad" style={{ flex: 1 }} />
            <Field label="ИНН" value={f.bankInn} onChangeText={set('bankInn')} editable={!ro} keyboardType="number-pad" style={{ flex: 1 }} />
          </View>
        </Group>

        <Label>Акция кофейни</Label>
        <Group>
          <ToggleRow
            title={`Каждый ${every >= 2 ? every : 'N'}-й кофе — бесплатно`}
            subtitle="Считаются напитки из категорий «Горячий кофе» и «Холодный кофе»"
            value={f.promoEnabled}
            onChange={(v) => setF({ ...f, promoEnabled: v })}
            disabled={ro}
            icon="gift"
          />
          {f.promoEnabled && (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {['5', '6', '7', '8', '10'].map((n) => (
                <Chip key={n} label={`${n}-й`} active={f.promoEvery === n} onPress={() => !ro && set('promoEvery')(n)} />
              ))}
            </View>
          )}
        </Group>

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
            <Group>
              <Field
                label="Склад цеха в 1С (код)"
                value={f.workshopWarehouseId}
                onChangeText={set('workshopWarehouseId')}
                autoCapitalize="none"
                hint="С этого склада списываются заказы партнёров. Склады филиалов — в «Филиалы и меню»"
              />
            </Group>
          </>
        )}

        <Label>Ещё</Label>
        <View style={{ gap: space.sm }}>
          <ActionItem icon="coffee" title="Филиалы и меню" subtitle="Часы работы, цены, склад 1С" onPress={() => router.push('/admin/branches')} />
          <ActionItem icon="image" title="Истории на главной" subtitle="Акции, новинки, фото" onPress={() => router.push('/admin/stories')} />
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
