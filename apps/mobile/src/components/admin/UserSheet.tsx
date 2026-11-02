import React, { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../api';
import { Admin, AdminPartner, AdminUser, CreateUserInput } from '../../api/admin';
import { addDaysIso, dateLong, formatPhone, formatPhoneLocal, phoneDigits, todayIso } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { toast } from '../../store/ui';
import { Role } from '../../shared';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { Button, Chip, Field, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { Label, Note, Segmented, Sheet, ToggleRow } from './kit';
import { CLIENT_ORDER, ROLE_META, STAFF_ORDER } from './roles';

/* ───────── Помощники для учётных данных ───────── */

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ө: 'o', ү: 'u', ң: 'n',
};

/** «Айгуль Маратова» → «aigul.m» */
export function suggestLogin(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tr = (w: string) => [...w].map((c) => TR[c] ?? c).join('').replace(/[^a-z0-9]/g, '');
  if (!words.length) return '';
  const first = tr(words[0]);
  const last = words[1] ? tr(words[1]).slice(0, 1) : '';
  const base = last ? `${first}.${last}` : first;
  return base.length >= 3 ? base.slice(0, 32) : base ? `${base}.bulo` : '';
}

function rand(n: number) {
  const c = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] % n;
  }
  return Math.floor(Math.random() * n);
}

/** Легко продиктовать по телефону: «kemo-ratu-48». */
export function generatePassword(): string {
  const cons = 'bdfgkmnprstvz';
  const vow = 'aeiou';
  const syl = () => cons[rand(cons.length)] + vow[rand(vow.length)];
  return `${syl()}${syl()}-${syl()}${syl()}-${rand(90) + 10}`;
}

export const LOGIN_RE = /^[a-z0-9._-]{3,32}$/i;

export function credentialsText(o: { name: string; role: Role; phone?: string | null; login?: string | null; password?: string; expires?: string | null }) {
  const lines = [`BULO — доступ в приложение`, `${o.name} · ${ROLE_META[o.role].label}`];
  if (o.phone) lines.push(`Вход по номеру: ${formatPhone(o.phone)} (код придёт в СМС)`);
  if (o.login) lines.push(`Логин: ${o.login}`);
  if (o.password) lines.push(`Пароль: ${o.password}`);
  if (o.expires) lines.push(`Доступ до: ${dateLong(o.expires.slice(0, 10))}`);
  lines.push('', 'Приложение BULO → Профиль → «Войти по логину и паролю».');
  return lines.join('\n');
}

/** Карточка «выдать доступ»: показать, скопировать, поделиться. */
export function CredentialsCard({ text, login, password }: { text: string; login?: string | null; password?: string }) {
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.success('Данные для входа скопированы');
  };
  const share = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      await copy();
    }
  };
  return (
    <View style={st.cred}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <AIcon name="key" size={18} color={colors.lime} />
        <T v="caption" color={colors.lime} style={{ fontFamily: fonts.extrabold, letterSpacing: 0.8 }}>
          ДАННЫЕ ДЛЯ ВХОДА
        </T>
      </View>
      {!!login && <CredLine label="Логин" value={login} />}
      {!!password && <CredLine label="Пароль" value={password} />}
      {!login && !password && (
        <T v="body" color={colors.oatMilk}>
          Вход по номеру телефона — код придёт в СМС.
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
        <Button small kind="light" title="Скопировать" icon="copy" onPress={copy} style={{ flex: 1 }} />
        <Button small kind="primary" title="Поделиться" icon="send" onPress={share} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function CredLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(249,245,230,0.08)', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 }}>
      <T v="small" color="rgba(249,245,230,0.7)">
        {label}
      </T>
      <T style={{ fontFamily: fonts.extrabold, fontSize: 18, letterSpacing: 0.5 }} color={colors.oatMilk} selectable>
        {value}
      </T>
    </View>
  );
}

/* ───────── Выбор партнёра ───────── */

export function PartnerPicker({ value, onChange, optional }: { value: string | null; onChange: (p: AdminPartner | null) => void; optional?: string }) {
  const [q, setQ] = useState('');
  const list = useLoad(() => Admin.partners({ status: 'APPROVED' }), []);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data ?? []).filter((p) => !s || p.name.toLowerCase().includes(s) || p.phone?.includes(s) || p.inn?.includes(s)).slice(0, 6);
  }, [list.data, q]);
  const picked = list.data?.find((p) => p.id === value);
  if (picked)
    return (
      <View style={[st.partner, { borderColor: colors.mango, backgroundColor: colors.white }]}>
        <AIcon name="shop" size={20} color={colors.mango} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{picked.name}</T>
          <T v="small" color={colors.textMuted}>
            {picked.contactName} · {picked.priceType?.name ?? 'цены по умолчанию'}
          </T>
        </View>
        <Touchable haptic onPress={() => onChange(null)} hitSlop={8}>
          <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
            Сменить
          </T>
        </Touchable>
      </View>
    );
  return (
    <View style={{ gap: space.sm }}>
      <Field placeholder="Найти партнёра по названию, ИНН, телефону" value={q} onChangeText={setQ} left={<AIcon name="search" size={18} color={colors.textSoft} />} autoCorrect={false} />
      {optional && (
        <T v="small" color={colors.textMuted}>
          {optional}
        </T>
      )}
      {items.map((p) => (
        <Touchable key={p.id} haptic onPress={() => onChange(p)} style={st.partner}>
          <AIcon name="shop" size={18} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong" numberOfLines={1}>
              {p.name}
            </T>
            <T v="small" color={colors.textMuted} numberOfLines={1}>
              {p.contactName}
              {p.phone ? ` · ${formatPhone(p.phone)}` : ''}
            </T>
          </View>
        </Touchable>
      ))}
      {list.data && !items.length && (
        <T v="small" color={colors.textMuted}>
          Нет одобренных партнёров по запросу
        </T>
      )}
    </View>
  );
}

/* ───────── Создание пользователя (шаги) ───────── */

type Access = 'phone' | 'login' | 'both';
const EXPIRY = [
  { key: 'none', label: 'Бессрочно', days: 0 },
  { key: '1', label: '1 день', days: 1 },
  { key: '7', label: 'Неделя', days: 7 },
  { key: '30', label: 'Месяц', days: 30 },
  { key: '90', label: '3 месяца', days: 90 },
];

export function UserCreateSheet({
  visible,
  onClose,
  onCreated,
  kind = 'staff',
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (u: AdminUser) => void;
  kind?: 'staff' | 'clients';
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<Access>('login');
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [loginTouched, setLoginTouched] = useState(false);
  const [password, setPassword] = useState(generatePassword());
  const [showPass, setShowPass] = useState(true);
  const [email, setEmail] = useState('');
  const [expiry, setExpiry] = useState('none');
  const [canOrder, setCanOrder] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [created, setCreated] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (visible) {
      setStep(0);
      setRole(null);
      setName('');
      setAccess('login');
      setPhone('');
      setLogin('');
      setLoginTouched(false);
      setPassword(generatePassword());
      setShowPass(true);
      setEmail('');
      setExpiry('none');
      setCanOrder(false);
      setPartnerId(null);
      setErrors({});
      setCreated(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!loginTouched) setLogin(suggestLogin(name));
  }, [name, loginTouched]);

  const pickRole = (r: Role) => {
    setRole(r);
    // Партнёрам и клиентам удобнее вход по СМС, сотрудникам — по логину
    setAccess(r === 'PARTNER' || r === 'CLIENT' ? 'phone' : 'login');
    if (r === 'GUEST') setExpiry('30');
    setStep(1);
  };

  const needPartner = role === 'PARTNER' || (role === 'GUEST' && canOrder);
  const usePhone = access !== 'login';
  const useLogin = access !== 'phone';
  const exp = EXPIRY.find((e) => e.key === expiry)!;
  const expIso = exp.days ? `${addDaysIso(todayIso(), exp.days)}T23:59:59` : undefined;

  const submit = async () => {
    const e: Record<string, string | null> = {};
    if (name.trim().length < 2) e.name = 'Минимум 2 символа';
    if (usePhone && phoneDigits(phone).length !== 9) e.phone = 'Номер из 9 цифр после +996';
    if (useLogin && !LOGIN_RE.test(login)) e.login = '3–32 символа: латиница, цифры, . _ -';
    if (useLogin && password.length < 6) e.password = 'Минимум 6 символов';
    if (email && !/^\S+@\S+\.\S+$/.test(email)) e.email = 'Проверьте почту';
    if (needPartner && !partnerId) e.partner = 'Выберите контрагента';
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    const dto: CreateUserInput = {
      name: name.trim(),
      role: role!,
      phone: usePhone ? `+996${phoneDigits(phone)}` : undefined,
      login: useLogin ? login.trim().toLowerCase() : undefined,
      password: useLogin ? password : undefined,
      email: email.trim() || undefined,
      accessExpiresAt: expIso,
      canOrder: role === 'GUEST' ? canOrder : undefined,
      partnerId: partnerId ?? undefined,
    };
    setBusy(true);
    try {
      const u = await Admin.createUser(dto);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCreated(u);
      setStep(2);
      onCreated(u);
    } catch (err) {
      const msg = errorMessage(err);
      if (/логин/i.test(msg)) setErrors({ login: msg });
      else if (/телефон/i.test(msg)) setErrors({ phone: msg });
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const meta = role ? ROLE_META[role] : null;
  const order = kind === 'clients' ? [...CLIENT_ORDER, ...STAFF_ORDER] : [...STAFF_ORDER, ...CLIENT_ORDER];

  const titles = ['Кого добавляем?', meta ? `Новый: ${meta.label.toLowerCase()}` : '', 'Готово!'];
  const subtitles = ['Роль определяет, что человек увидит в приложении', meta?.about ?? '', 'Передайте данные для входа'];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={titles[step]}
      subtitle={subtitles[step]}
      dismissable={!busy}
      headerLeft={
        step === 1 ? (
          <Touchable haptic onPress={() => setStep(0)} style={st.back} accessibilityLabel="Назад">
            <AIcon name="chevronLeft" size={20} />
          </Touchable>
        ) : undefined
      }
      footer={
        step === 1 ? (
          <Button title="Создать доступ" icon="check" onPress={submit} loading={busy} />
        ) : step === 2 ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Ещё одного" kind="ghost" onPress={() => { setStep(0); setRole(null); setName(''); setPhone(''); setLogin(''); setLoginTouched(false); setPassword(generatePassword()); setPartnerId(null); setCreated(null); }} style={{ flex: 1 }} />
            <Button title="Готово" onPress={onClose} style={{ flex: 1 }} />
          </View>
        ) : undefined
      }
    >
      <Steps step={step} />

      {step === 0 && (
        <View style={st.roleGrid}>
          {order.map((r) => {
            const m = ROLE_META[r];
            return (
              <Touchable key={r} haptic scaleTo={0.95} onPress={() => pickRole(r)} style={st.roleCard}>
                <View style={[st.roleIcon, { backgroundColor: m.bg }]}>
                  <AIcon name={m.icon} size={22} color={m.fg} strokeWidth={1.9} />
                </View>
                <T v="bodyStrong">{m.label}</T>
                <T v="small" color={colors.textMuted} numberOfLines={2}>
                  {m.about}
                </T>
              </Touchable>
            );
          })}
        </View>
      )}

      {step === 1 && meta && (
        <>
          <Field label="Имя" placeholder={meta.staff ? 'Имя и фамилия' : 'Как к нему обращаться'} value={name} onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: null })); }} error={errors.name} autoFocus autoCapitalize="words" />

          <Label>Как будет входить</Label>
          <Segmented
            items={[
              { key: 'phone', label: 'СМС' },
              { key: 'login', label: 'Логин' },
              { key: 'both', label: 'Оба' },
            ]}
            value={access}
            onChange={setAccess}
          />
          {usePhone && (
            <Field
              label="Телефон"
              placeholder="700 12 34 56"
              keyboardType="phone-pad"
              value={formatPhoneLocal(phoneDigits(phone))}
              onChangeText={(v) => { setPhone(phoneDigits(v)); setErrors((e) => ({ ...e, phone: null })); }}
              error={errors.phone}
              hint="Код для входа придёт в СМС"
              left={<T v="bodyStrong" color={colors.textMuted}>+996</T>}
            />
          )}
          {useLogin && (
            <>
              <Field
                label="Логин"
                placeholder="aigul.m"
                autoCapitalize="none"
                autoCorrect={false}
                value={login}
                onChangeText={(v) => { setLoginTouched(true); setLogin(v.toLowerCase().replace(/\s/g, '')); setErrors((e) => ({ ...e, login: null })); }}
                error={errors.login}
                hint={!loginTouched && login ? 'Предложили по имени — можно изменить' : undefined}
                left={<AIcon name="user" size={18} color={colors.textSoft} />}
              />
              <Field
                label="Пароль"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPass}
                value={password}
                onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: null })); }}
                error={errors.password}
                left={<AIcon name="lock" size={18} color={colors.textSoft} />}
                hint="Скопируйте или отправьте после создания"
              />
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: -space.xs }}>
                <Button small kind="secondary" icon="repeat" title="Сгенерировать" onPress={() => { setPassword(generatePassword()); setShowPass(true); }} style={{ flex: 1 }} />
                <Button small kind="ghost" title={showPass ? 'Скрыть' : 'Показать'} onPress={() => setShowPass(!showPass)} style={{ flex: 1 }} />
              </View>
            </>
          )}

          {(role === 'PARTNER' || role === 'GUEST' || role === 'CLIENT') && (
            <>
              {role === 'GUEST' && (
                <ToggleRow icon="bag" title="Может оформлять заказы" subtitle="Иначе — только смотрит каталог и цены" value={canOrder} onChange={setCanOrder} />
              )}
              {(role !== 'GUEST' || canOrder) && (
                <>
                  <Label>{role === 'CLIENT' ? 'Контрагент (необязательно)' : 'Контрагент'}</Label>
                  <PartnerPicker
                    value={partnerId}
                    onChange={(p) => { setPartnerId(p?.id ?? null); setErrors((e) => ({ ...e, partner: null })); }}
                    optional={role === 'CLIENT' ? 'Если не выбрать — создадим личный кабинет с розничными ценами.' : undefined}
                  />
                  {!!errors.partner && (
                    <T v="small" color={colors.danger}>
                      {errors.partner}
                    </T>
                  )}
                </>
              )}
            </>
          )}

          <Label>Срок доступа</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {EXPIRY.map((x) => (
              <Chip key={x.key} label={x.label} active={expiry === x.key} onPress={() => setExpiry(x.key)} />
            ))}
          </View>
          {!!expIso && (
            <T v="small" color={colors.textMuted}>
              Доступ закроется после {dateLong(expIso.slice(0, 10))}
            </T>
          )}

          <Field label="Почта (необязательно)" placeholder="name@mail.kg" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} error={errors.email} />
          {meta.role === 'ADMIN' && <Note icon="alert" tone="yellow" text="Администратор получит полный доступ, включая управление ролями." />}
        </>
      )}

      {step === 2 && created && (
        <>
          <View style={st.done}>
            <View style={[st.roleIcon, { width: 56, height: 56, borderRadius: 20, backgroundColor: ROLE_META[created.role].bg }]}>
              <AIcon name={ROLE_META[created.role].icon} size={28} color={ROLE_META[created.role].fg} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h3">{created.name}</T>
              <T v="small" color={colors.textMuted}>
                {ROLE_META[created.role].label}
                {created.partner ? ` · ${created.partner.name}` : ''}
              </T>
            </View>
            <AIcon name="check" size={26} color={colors.success} strokeWidth={2.4} />
          </View>
          <CredentialsCard
            login={created.login}
            password={useLogin ? password : undefined}
            text={credentialsText({ name: created.name, role: created.role, phone: created.phone, login: created.login, password: useLogin ? password : undefined, expires: created.accessExpiresAt })}
          />
          <Note text="Пароль больше нигде не показывается. Если забудут — сбросьте его в карточке пользователя." />
        </>
      )}
    </Sheet>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.mango : 'rgba(38,66,43,0.1)' }} />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  roleCard: { width: '48.5%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md, gap: 4, ...shadows.soft },
  roleIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cred: { backgroundColor: colors.cambodia, borderRadius: radius.xl, padding: space.lg, gap: space.sm },
  done: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg },
  partner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceWarm },
});
