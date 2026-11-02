import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../api';
import { Admin, AdminPartner, Counterparty, PriceType } from '../../api/admin';
import { formatPhone, formatPhoneLocal, phoneDigits } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { toast } from '../../store/ui';
import { colors, fonts, radius, space } from '../../theme';
import { Button, Field, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { Label, Note, Sheet, ToggleRow } from './kit';

/** Выбор типа цен — плитками. */
export function PriceTypePicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const types = useLoad(() => Admin.priceTypes(), []);
  if (types.loading) return <ActivityIndicator color={colors.mango} />;
  if (types.error)
    return (
      <T v="small" color={colors.danger}>
        {types.error}
      </T>
    );
  return (
    <View style={{ gap: space.sm }}>
      {(types.data ?? []).map((t: PriceType) => {
        const active = value === t.id || (!value && t.isDefault);
        return (
          <Touchable
            key={t.id}
            haptic
            onPress={() => onChange(t.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: active ? colors.white : colors.surfaceWarm, borderWidth: 1.5, borderColor: active ? colors.mango : colors.border }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? colors.mango : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
              {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mango }} />}
            </View>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{t.name}</T>
              <T v="small" color={colors.textMuted}>
                {t.isDefault ? 'По умолчанию · ' : ''}
                {t._count?.partners ?? 0} партнёров
              </T>
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}

/** Поиск контрагента в справочнике 1С. */
export function CounterpartyPicker({ value, onChange, hint }: { value: Counterparty | null; onChange: (c: Counterparty | null) => void; hint?: string }) {
  const [q, setQ] = useState(hint ?? '');
  const [items, setItems] = useState<Counterparty[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value) return;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setItems(await Admin.counterparties(q.trim() || undefined));
      } catch {
        setItems([]);
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.success }}>
        <AIcon name="sync" size={20} color={colors.success} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{value.name}</T>
          <T v="small" color={colors.textMuted}>
            Код 1С {value.oneCId}
            {value.inn ? ` · ИНН ${value.inn}` : ''}
          </T>
        </View>
        <Touchable haptic onPress={() => onChange(null)}>
          <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
            Убрать
          </T>
        </Touchable>
      </View>
    );
  return (
    <View style={{ gap: space.sm }}>
      <Field placeholder="Название или ИНН в 1С" value={q} onChangeText={setQ} left={<AIcon name="search" size={18} color={colors.textSoft} />} autoCorrect={false} />
      {busy && !items && <ActivityIndicator color={colors.mango} />}
      {items?.slice(0, 5).map((c) => (
        <Touchable key={c.oneCId} haptic onPress={() => onChange(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surfaceWarm }}>
          <AIcon name="doc" size={18} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong" numberOfLines={1}>
              {c.name}
            </T>
            <T v="small" color={colors.textMuted} numberOfLines={1}>
              {c.inn ? `ИНН ${c.inn}` : 'Без ИНН'}
              {c.address ? ` · ${c.address}` : ''}
            </T>
          </View>
        </Touchable>
      ))}
      {items && items.length === 0 && (
        <T v="small" color={colors.textMuted}>
          В справочнике 1С ничего не нашли — можно связать позже.
        </T>
      )}
    </View>
  );
}

/** Одобрение заявки: тип цен и (по желанию) контрагент 1С. */
export function ApproveSheet({ partner, onClose, onDone }: { partner: AdminPartner | null; onClose: () => void; onDone: (p: AdminPartner) => void }) {
  const [priceTypeId, setPriceTypeId] = useState<string | null>(null);
  const [cp, setCp] = useState<Counterparty | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPriceTypeId(partner?.priceTypeId ?? null);
    setCp(null);
    setBusy(false);
  }, [partner]);

  const submit = async () => {
    if (!partner) return;
    setBusy(true);
    try {
      const p = await Admin.approvePartner(partner.id, { priceTypeId: priceTypeId ?? undefined, oneCId: cp?.oneCId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`${partner.name}: доступ открыт`);
      onDone({ ...partner, ...p });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!partner}
      onClose={onClose}
      title="Одобрить заявку"
      subtitle={partner ? `${partner.name} · ${partner.contactName}` : ''}
      footer={<Button title="Открыть доступ" icon="check" onPress={submit} loading={busy} />}
    >
      {partner && (
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md, gap: 4 }}>
          <T v="small" color={colors.textMuted}>
            {formatPhone(partner.phone)}
            {partner.inn ? ` · ИНН ${partner.inn}` : ''}
          </T>
          {partner.addresses[0] && <T v="small">{partner.addresses[0].address}</T>}
        </View>
      )}
      <Label>Тип цен</Label>
      <PriceTypePicker value={priceTypeId} onChange={setPriceTypeId} />
      <Label>Контрагент в 1С (необязательно)</Label>
      <CounterpartyPicker value={cp} onChange={setCp} hint={partner?.inn ?? undefined} />
      <Note text="Партнёр получит уведомление и сразу увидит свои цены." />
    </Sheet>
  );
}

/** Новый партнёр, заведённый офисом (сразу одобрен). */
export function AddPartnerSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (p: AdminPartner) => void }) {
  const [f, setF] = useState({ name: '', contactName: '', phone: '', inn: '', email: '', address: '' });
  const [priceTypeId, setPriceTypeId] = useState<string | null>(null);
  const [createUser, setCreateUser] = useState(true);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setF({ name: '', contactName: '', phone: '', inn: '', email: '', address: '' });
      setPriceTypeId(null);
      setCreateUser(true);
      setErrors({});
    }
  }, [visible]);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: null }));
  };

  const submit = async () => {
    const e: Record<string, string | null> = {};
    if (f.name.trim().length < 2) e.name = 'Название — минимум 2 символа';
    if (f.contactName.trim().length < 2) e.contactName = 'Укажите контактное лицо';
    if (phoneDigits(f.phone).length !== 9) e.phone = 'Номер из 9 цифр после +996';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Проверьте почту';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const p = await Admin.createPartner({
        name: f.name.trim(),
        contactName: f.contactName.trim(),
        phone: `+996${phoneDigits(f.phone)}`,
        inn: f.inn.trim() || undefined,
        email: f.email.trim() || undefined,
        address: f.address.trim() || undefined,
        priceTypeId: priceTypeId ?? undefined,
        createUser,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`Партнёр «${p.name}» добавлен`);
      onCreated(p);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Новый партнёр" subtitle="Кофейня, магазин или ресторан" dismissable={!busy} footer={<Button title="Добавить партнёра" icon="plus" onPress={submit} loading={busy} />}>
      <Field label="Название" placeholder="Кофейня «Утро»" value={f.name} onChangeText={set('name')} error={errors.name} autoFocus />
      <Field label="Контактное лицо" placeholder="Имя" value={f.contactName} onChangeText={set('contactName')} error={errors.contactName} autoCapitalize="words" />
      <Field
        label="Телефон"
        placeholder="700 12 34 56"
        keyboardType="phone-pad"
        value={formatPhoneLocal(phoneDigits(f.phone))}
        onChangeText={(v) => set('phone')(phoneDigits(v))}
        error={errors.phone}
        left={<T v="bodyStrong" color={colors.textMuted}>+996</T>}
      />
      <Field label="Адрес доставки" placeholder="ул. Киевская, 95" value={f.address} onChangeText={set('address')} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field style={{ minWidth: 0 }} label="ИНН" placeholder="Необязательно" keyboardType="number-pad" value={f.inn} onChangeText={set('inn')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field style={{ minWidth: 0 }} label="Почта" placeholder="Необязательно" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={set('email')} error={errors.email} />
        </View>
      </View>
      <Label>Тип цен</Label>
      <PriceTypePicker value={priceTypeId} onChange={setPriceTypeId} />
      <ToggleRow icon="phone" title="Сразу открыть вход" subtitle="Партнёр войдёт по этому номеру с кодом из СМС" value={createUser} onChange={setCreateUser} />
    </Sheet>
  );
}
