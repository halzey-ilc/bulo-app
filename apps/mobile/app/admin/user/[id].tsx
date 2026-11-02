import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../../src/api';
import { Admin, AdminUser, UpdateUserInput } from '../../../src/api/admin';
import { AIcon } from '../../../src/components/admin/icons';
import { ActionItem, ago, Avatar, Group, Label, Note, Pill, Sheet, ToggleRow } from '../../../src/components/admin/kit';
import { CLIENT_ORDER, ROLE_META, STAFF_ORDER } from '../../../src/components/admin/roles';
import { credentialsText, CredentialsCard, generatePassword, LOGIN_RE, PartnerPicker } from '../../../src/components/admin/UserSheet';
import { BottomBar, Header, Screen } from '../../../src/components/layout';
import { Button, Chip, ErrorState, Field, Skeleton, T, Touchable } from '../../../src/components/ui';
import { addDaysIso, dateLong, formatPhoneLocal, phoneDigits, todayIso } from '../../../src/lib/format';
import { useLoad } from '../../../src/lib/useLoad';
import { useAuth } from '../../../src/store/auth';
import { confirmDialog, toast } from '../../../src/store/ui';
import { Role } from '../../../src/shared';
import { colors, fonts, radius, shadows, space } from '../../../src/theme';

/** Карточка пользователя: роль, вход, пароль, срок доступа, блокировка. */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth((s) => s.user?.id);
  // Отдельного GET /admin/users/:id нет — берём из списка.
  const users = useLoad(() => Admin.users(), []);
  const u = users.data?.find((x) => x.id === id);

  const [form, setForm] = useState<{ name: string; role: Role; phone: string; login: string; email: string; canOrder: boolean; partnerId: string | null; expires: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [creds, setCreds] = useState<{ password: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (u && !form)
      setForm({ name: u.name, role: u.role, phone: u.phone ? phoneDigits(u.phone) : '', login: u.login ?? '', email: u.email ?? '', canOrder: u.canOrder, partnerId: u.partnerId, expires: u.accessExpiresAt });
  }, [u, form]);

  if (!u || !form) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Пользователь" />
        {users.error ? (
          <ErrorState message={users.error} onRetry={users.refresh} />
        ) : users.data && !u ? (
          <ErrorState message="Пользователь не найден" />
        ) : (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <Skeleton style={{ height: 140, borderRadius: radius.xxl }} />
            <Skeleton style={{ height: 260, borderRadius: radius.xl }} />
          </View>
        )}
      </View>
    );
  }

  const self = u.id === me;
  const m = ROLE_META[form.role];
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm({ ...form, [k]: v });
    setErrors((e) => ({ ...e, [k]: null }));
  };
  const replace = (nu: AdminUser) => users.setData((cur) => cur?.map((x) => (x.id === nu.id ? nu : x)));

  // Изменения относительно сохранённого
  const dto: UpdateUserInput = {};
  if (form.name.trim() !== u.name) dto.name = form.name.trim();
  if (form.role !== u.role) dto.role = form.role;
  const ph = form.phone ? `+996${phoneDigits(form.phone)}` : null;
  if ((ph ?? null) !== (u.phone ?? null)) dto.phone = ph;
  if ((form.login.trim().toLowerCase() || null) !== (u.login ?? null)) dto.login = form.login.trim().toLowerCase() || null;
  if (form.email.trim() && form.email.trim() !== (u.email ?? '')) dto.email = form.email.trim();
  if (form.canOrder !== u.canOrder) dto.canOrder = form.canOrder;
  if (form.partnerId !== u.partnerId) dto.partnerId = form.partnerId;
  if ((form.expires ?? null) !== (u.accessExpiresAt ?? null)) dto.accessExpiresAt = form.expires;
  const dirty = Object.keys(dto).length > 0;

  const save = async () => {
    const e: Record<string, string | null> = {};
    if (form.name.trim().length < 2) e.name = 'Минимум 2 символа';
    if (form.phone && phoneDigits(form.phone).length !== 9) e.phone = '9 цифр после +996';
    if (form.login && !LOGIN_RE.test(form.login)) e.login = '3–32 символа: латиница, цифры, . _ -';
    if (!form.phone && !form.login) e.login = 'Нужен телефон или логин';
    if ((form.role === 'PARTNER' || (form.role === 'GUEST' && form.canOrder)) && !form.partnerId) e.partner = 'Выберите контрагента';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const nu = await Admin.updateUser(u.id, dto);
      replace(nu);
      setForm(null); // перечитаем форму из ответа
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(dto.role ? 'Роль изменена — старые сессии закрыты' : 'Сохранено');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = () => {
    if (!u.login && !form.login) {
      toast.error('Сначала задайте логин и сохраните');
      return;
    }
    const pwd = generatePassword();
    confirmDialog({
      title: 'Сбросить пароль?',
      message: `Новый пароль: ${pwd}\nСтарый перестанет работать, сессии на других устройствах закроются.`,
      confirmText: 'Сбросить',
      onConfirm: async () => {
        const nu = await Admin.updateUser(u.id, { password: pwd });
        replace(nu);
        setCreds({ password: pwd });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      },
    });
  };

  const toggleBlock = () => {
    const blocking = u.status === 'ACTIVE';
    confirmDialog({
      title: blocking ? `Заблокировать ${u.name}?` : `Разблокировать ${u.name}?`,
      message: blocking ? 'Человек сразу выйдет из приложения и не сможет войти.' : 'Доступ восстановится с прежней ролью.',
      confirmText: blocking ? 'Заблокировать' : 'Разблокировать',
      destructive: blocking,
      onConfirm: async () => {
        const nu = await Admin.updateUser(u.id, { status: blocking ? 'BLOCKED' : 'ACTIVE' });
        replace(nu);
        toast.success(blocking ? 'Заблокирован' : 'Доступ восстановлен');
      },
    });
  };

  const expired = !!u.accessExpiresAt && new Date(u.accessExpiresAt) < new Date();
  const EXP = [
    { label: 'Бессрочно', v: null as string | null },
    { label: '+1 день', v: `${addDaysIso(todayIso(), 1)}T23:59:59.000Z` },
    { label: '+7 дней', v: `${addDaysIso(todayIso(), 7)}T23:59:59.000Z` },
    { label: '+30 дней', v: `${addDaysIso(todayIso(), 30)}T23:59:59.000Z` },
    { label: '+90 дней', v: `${addDaysIso(todayIso(), 90)}T23:59:59.000Z` },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={u.name} subtitle={ROLE_META[u.role].label} />
      <Screen refreshing={users.refreshing} onRefresh={users.refresh} contentStyle={{ paddingBottom: dirty ? 150 : 48 }}>
        <View style={[st.hero, { backgroundColor: m.bg }]}>
          <Avatar name={form.name} size={60} bg={colors.white} fg={m.fg} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="h2" color={m.fg === colors.oatMilk ? colors.oatMilk : colors.cambodia} numberOfLines={1}>
              {form.name || 'Без имени'}
            </T>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={m.label.toUpperCase()} bg={colors.white} fg={m.fg === colors.oatMilk ? colors.cambodia : m.fg} icon={m.icon} />
              {u.status === 'BLOCKED' && <Pill label="ЗАБЛОКИРОВАН" bg={colors.dangerSoft} fg={colors.danger} icon="lock" />}
              {expired && <Pill label="ДОСТУП ИСТЁК" bg="#ECE8DC" fg={colors.textMuted} icon="clock" />}
              {self && <Pill label="ЭТО ВЫ" bg={colors.lime} fg={colors.cambodia} />}
            </View>
            <T v="caption" color={m.fg === colors.oatMilk ? 'rgba(249,245,230,0.7)' : colors.textMuted}>
              {u.lastLoginAt ? `Заходил ${ago(u.lastLoginAt)}` : 'Ещё не входил'} · создан {dateLong(u.createdAt.slice(0, 10))}
            </T>
          </View>
        </View>

        {creds && (
          <CredentialsCard
            login={u.login}
            password={creds.password}
            text={credentialsText({ name: u.name, role: u.role, phone: u.phone, login: u.login, password: creds.password, expires: u.accessExpiresAt })}
          />
        )}

        <Group>
          <Field label="Имя" value={form.name} onChangeText={(v) => set('name', v)} error={errors.name} />
          <Touchable haptic onPress={() => !self && setRoleOpen(true)} style={st.roleRow}>
            <View style={[st.roleIcon, { backgroundColor: m.bg }]}>
              <AIcon name={m.icon} size={20} color={m.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="small" color={colors.textMuted}>
                Роль
              </T>
              <T v="bodyStrong">{m.label}</T>
            </View>
            {!self ? (
              <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                Сменить
              </T>
            ) : (
              <T v="small" color={colors.textSoft}>
                свою нельзя
              </T>
            )}
          </Touchable>
        </Group>

        <Label>Вход</Label>
        <Group>
          <Field
            label="Телефон (вход по СМС)"
            placeholder="Не задан"
            keyboardType="phone-pad"
            value={formatPhoneLocal(phoneDigits(form.phone))}
            onChangeText={(v) => set('phone', phoneDigits(v))}
            error={errors.phone}
            left={<T v="bodyStrong" color={colors.textMuted}>+996</T>}
          />
          <Field label="Логин" placeholder="Не задан" autoCapitalize="none" autoCorrect={false} value={form.login} onChangeText={(v) => set('login', v.toLowerCase().replace(/\s/g, ''))} error={errors.login} />
          <Field label="Почта" placeholder="Необязательно" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(v) => set('email', v)} />
          <Button kind="secondary" small icon="key" title="Сбросить пароль" onPress={resetPassword} />
        </Group>

        {(form.role === 'PARTNER' || form.role === 'GUEST' || form.role === 'CLIENT') && (
          <>
            <Label>Контрагент</Label>
            <Group>
              {form.role === 'GUEST' && <ToggleRow icon="bag" title="Может оформлять заказы" value={form.canOrder} onChange={(v) => set('canOrder', v)} />}
              <PartnerPicker value={form.partnerId} onChange={(p) => set('partnerId', p?.id ?? null)} />
              {!!errors.partner && (
                <T v="small" color={colors.danger}>
                  {errors.partner}
                </T>
              )}
            </Group>
          </>
        )}

        <Label>Срок доступа</Label>
        <Group>
          <T v="bodyStrong">{form.expires ? `До ${dateLong(form.expires.slice(0, 10))}` : 'Бессрочно'}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {EXP.map((x) => (
              <Chip key={x.label} label={x.label} active={(form.expires?.slice(0, 10) ?? null) === (x.v?.slice(0, 10) ?? null)} onPress={() => set('expires', x.v)} />
            ))}
          </View>
        </Group>

        {!self && (
          <ActionItem
            icon={u.status === 'ACTIVE' ? 'lock' : 'unlock'}
            danger={u.status === 'ACTIVE'}
            tone="green"
            title={u.status === 'ACTIVE' ? 'Заблокировать' : 'Разблокировать'}
            subtitle={u.status === 'ACTIVE' ? 'Мгновенно закрывает доступ на всех устройствах' : 'Вернуть доступ'}
            onPress={toggleBlock}
          />
        )}
        {self && <Note text="Это ваша учётная запись: роль и блокировку изменить нельзя." />}
      </Screen>

      {dirty && (
        <BottomBar>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Отменить" kind="ghost" onPress={() => setForm(null)} style={{ flex: 1 }} />
            <Button title="Сохранить" icon="check" onPress={save} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </BottomBar>
      )}

      <Sheet visible={roleOpen} onClose={() => setRoleOpen(false)} title="Новая роль" subtitle="Старые сессии закроются после сохранения">
        {[...STAFF_ORDER, ...CLIENT_ORDER].map((r) => {
          const rm = ROLE_META[r];
          return (
            <ActionItem
              key={r}
              icon={rm.icon}
              title={rm.label}
              subtitle={rm.about}
              onPress={() => {
                set('role', r);
                setRoleOpen(false);
              }}
              right={form.role === r ? <AIcon name="check" size={20} color={colors.mango} strokeWidth={2.4} /> : <View />}
            />
          );
        })}
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.xxl, padding: space.xl, ...shadows.card },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surfaceWarm, borderRadius: radius.lg, padding: space.md },
  roleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
