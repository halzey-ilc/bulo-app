'use client';

import { ROLE_LABELS } from '@bulo/shared';
import type { Role } from '@bulo/shared';
import { Ban, Clock, KeyRound, Pencil, Search, Smartphone, Unlock, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  Note,
  PageHeader,
  Select,
  Table,
  Tabs,
  Td,
  Th,
  Toggle,
  cx,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtPhone } from '@/lib/format';
import { useDebounced, useLoad } from '@/lib/hooks';
import type { Partner, User } from '@/lib/types';

const ROLE_INFO: { role: Role; text: string; soon?: boolean }[] = [
  { role: 'ADMIN', text: 'Полный доступ, управление пользователями и настройками' },
  { role: 'MANAGER', text: 'Следит за заказами партнёров и правит их, одобряет партнёров, ведёт каталог' },
  { role: 'ACCOUNTANT', text: 'Отмечает оплату, накладные, отчёты, обмен с 1С' },
  { role: 'WORKSHOP', text: 'Сводка на производство, печать накладной, «Готово»' },
  { role: 'COURIER', text: 'Накладные на отгрузку, «Передан» и «Доставлен»' },
  { role: 'CASHIER', text: 'Добавляет и убирает товары, меняет фото и розничные цены' },
  { role: 'PARTNER', text: 'Сотрудник партнёра: заказы в мобильном приложении' },
  { role: 'GUEST', text: 'Временный доступ: смотреть каталог, по желанию — заказывать' },
  { role: 'CLIENT', text: 'Розничный покупатель', soon: true },
];

const ROLE_CHIP: Partial<Record<Role, string>> = {
  ADMIN: 'bg-cambodia text-oat',
  MANAGER: 'bg-mango-soft text-mango-dark',
  ACCOUNTANT: 'bg-butter text-[#6b5300]',
  WORKSHOP: 'bg-cambodia-soft text-cambodia',
  COURIER: 'bg-[#e9e2f6] text-[#4b3a7a]',
  CASHIER: 'bg-[#fde7d9] text-[#8a3b12]',
  PARTNER: 'bg-ice text-[#0b4a7d]',
  GUEST: 'bg-oat-dark text-cambodia',
};

type TabValue = 'ALL' | 'STAFF' | 'PARTNER' | 'GUEST';
const STAFF: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'WORKSHOP', 'COURIER', 'CASHIER'];

function expired(u: User) {
  return !!u.accessExpiresAt && new Date(u.accessExpiresAt) < new Date();
}

export default function UsersPage() {
  const me = useMe();
  const toast = useToast();
  const [tab, setTab] = useState<TabValue>('STAFF');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const { data, loading, error, reload } = useLoad(
    () => api.get<User[]>('/admin/users', { role: tab === 'PARTNER' || tab === 'GUEST' ? tab : undefined, search: q.trim() || undefined }),
    [tab, q],
  );
  const list = (data ?? []).filter((u) => (tab === 'STAFF' ? STAFF.includes(u.role) : true));

  const [create, setCreate] = useState<'staff' | 'guest' | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleBlock = async (u: User) => {
    setBusyId(u.id);
    try {
      await api.patch(`/admin/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' });
      toast.success(u.status === 'ACTIVE' ? `${u.name}: доступ закрыт` : `${u.name}: доступ открыт`);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Пользователи и роли"
        subtitle="Кто имеет доступ к панели и приложению BULO и что может делать"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreate('guest')}>
              <Clock className="h-4 w-4" /> Гостевой доступ
            </Button>
            <Button onClick={() => setCreate('staff')}>
              <UserPlus className="h-4 w-4" /> Пригласить сотрудника
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {ROLE_INFO.map((r) => (
          <div
            key={r.role}
            className={cx('rounded-2xl border border-line/70 bg-white p-3', r.soon && 'opacity-55')}
            title={r.text}
          >
            <div className="flex flex-wrap items-center gap-1">
              <Chip className={ROLE_CHIP[r.role] ?? 'bg-oat text-muted'}>{ROLE_LABELS[r.role]}</Chip>
              {r.soon && <span className="text-[10px] font-semibold text-muted uppercase">скоро</span>}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">{r.text}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'STAFF', label: 'Сотрудники' },
            { value: 'PARTNER', label: 'Партнёры' },
            { value: 'GUEST', label: 'Гости' },
            { value: 'ALL', label: 'Все' },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Имя, телефон, логин" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="p-0 sm:p-0">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <div className="p-5">
            <Note tone="red">{error}</Note>
          </div>
        ) : !list.length ? (
          <Empty title="Пользователей нет" icon={<Users className="h-6 w-6" />} />
        ) : (
          <Table className={cx(loading && 'opacity-60')}>
            <thead>
              <tr>
                <Th className="pl-5">Имя</Th>
                <Th>Роль</Th>
                <Th>Вход</Th>
                <Th>Партнёр</Th>
                <Th>Доступ</Th>
                <Th>Последний вход</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={cx(u.status === 'BLOCKED' && 'bg-oat/50 text-cambodia/60')}>
                  <Td className="pl-5">
                    <div className="font-semibold">{u.name}</div>
                    {u.email && <div className="text-xs text-muted">{u.email}</div>}
                  </Td>
                  <Td>
                    <Chip className={ROLE_CHIP[u.role]}>{ROLE_LABELS[u.role]}</Chip>
                  </Td>
                  <Td className="text-xs">
                    {u.phone && (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Smartphone className="h-3.5 w-3.5 text-muted" /> {fmtPhone(u.phone)}
                      </div>
                    )}
                    {u.login && (
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-muted" /> {u.login}
                      </div>
                    )}
                  </Td>
                  <Td className="text-sm">
                    {u.partner?.name ?? '—'}
                    {u.role === 'GUEST' && (
                      <div className="text-xs text-muted">{u.canOrder ? 'может заказывать' : 'только просмотр'}</div>
                    )}
                  </Td>
                  <Td>
                    {u.status === 'BLOCKED' ? (
                      <Chip className="bg-coffee-soft text-coffee">заблокирован</Chip>
                    ) : expired(u) ? (
                      <Chip className="bg-coffee-soft text-coffee">истёк {fmtDate(u.accessExpiresAt)}</Chip>
                    ) : u.accessExpiresAt ? (
                      <Chip className="bg-butter text-[#6b5300]">до {fmtDate(u.accessExpiresAt)}</Chip>
                    ) : (
                      <Chip className="bg-cambodia-soft text-cambodia">активен</Chip>
                    )}
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-muted">{fmtDateTime(u.lastLoginAt)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      <Pencil className="h-3.5 w-3.5" /> Изменить
                    </Button>
                    {u.id !== me.id && (
                      <Button
                        size="sm"
                        variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'}
                        loading={busyId === u.id}
                        onClick={() => toggleBlock(u)}
                      >
                        {u.status === 'ACTIVE' ? <Ban className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        {u.status === 'ACTIVE' ? 'Блок' : 'Разблок.'}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {create && (
        <UserModal
          mode={create}
          onClose={() => setCreate(null)}
          onDone={() => {
            setCreate(null);
            if (create === 'guest') setTab('GUEST');
            else setTab('STAFF');
            reload();
          }}
        />
      )}
      {editing && (
        <UserModal
          mode="edit"
          user={editing}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function RolePicker({ value, onChange, roles }: { value: Role; onChange: (r: Role) => void; roles: Role[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLE_INFO.filter((r) => roles.includes(r.role) || r.soon).map((r) => (
        <button
          type="button"
          key={r.role}
          disabled={r.soon}
          onClick={() => onChange(r.role)}
          className={cx(
            'rounded-2xl border px-3.5 py-2.5 text-left transition',
            r.soon
              ? 'cursor-not-allowed border-dashed border-line opacity-50'
              : value === r.role
                ? 'border-mango bg-mango-soft/40 ring-2 ring-mango/15'
                : 'border-line hover:border-cambodia/30',
          )}
        >
          <div className="flex items-center justify-between text-sm font-bold">
            {ROLE_LABELS[r.role]}
            {r.soon && <span className="text-[10px] font-semibold text-muted uppercase">скоро</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted">{r.text}</div>
        </button>
      ))}
    </div>
  );
}

function UserModal({
  mode,
  user,
  isSelf,
  onClose,
  onDone,
}: {
  mode: 'staff' | 'guest' | 'edit';
  user?: User;
  isSelf?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const partners = useLoad(() => api.get<Partner[]>('/admin/partners', { status: 'APPROVED' }), []);
  const [role, setRole] = useState<Role>(user?.role ?? (mode === 'guest' ? 'GUEST' : 'MANAGER'));
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? (mode === 'staff' ? '+996' : ''));
  const [login, setLogin] = useState(user?.login ?? '');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [expires, setExpires] = useState(user?.accessExpiresAt ? user.accessExpiresAt.slice(0, 10) : '');
  const [canOrder, setCanOrder] = useState(user?.canOrder ?? false);
  const [partnerId, setPartnerId] = useState(user?.partnerId ?? '');
  const [status, setStatus] = useState(user?.status ?? 'ACTIVE');
  const [busy, setBusy] = useState(false);

  const isGuest = role === 'GUEST';
  const isPartner = role === 'PARTNER';
  const needsPartner = isPartner || (isGuest && canOrder);
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const hasPhone = cleanPhone.length >= 10;
  const hasLogin = login.trim().length >= 3;

  const problems: string[] = [];
  if (name.trim().length < 2) problems.push('Укажите имя');
  if (mode !== 'edit' && !hasPhone && !hasLogin) problems.push('Нужен телефон (вход по СМС) или логин с паролем');
  if (mode !== 'edit' && hasLogin && password.length < 6) problems.push('Пароль — минимум 6 символов');
  if (mode === 'edit' && password && password.length < 6) problems.push('Пароль — минимум 6 символов');
  if (needsPartner && !partnerId) problems.push('Выберите партнёра (контрагента), от имени которого оформляются заказы');

  const submit = async () => {
    setBusy(true);
    try {
      const expiresIso = expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined;
      if (mode === 'edit' && user) {
        await api.patch(`/admin/users/${user.id}`, {
          name: name.trim(),
          role,
          phone: hasPhone ? cleanPhone : user.phone ? null : undefined,
          login: hasLogin ? login.trim() : user.login ? null : undefined,
          password: password || undefined,
          email: email.trim() || undefined,
          status,
          accessExpiresAt: expiresIso ?? null,
          canOrder: isGuest ? canOrder : undefined,
          partnerId: isPartner || isGuest ? partnerId || null : null,
        });
        toast.success('Изменения сохранены');
      } else {
        await api.post('/admin/users', {
          name: name.trim(),
          role,
          phone: hasPhone ? cleanPhone : undefined,
          login: hasLogin ? login.trim() : undefined,
          password: hasLogin ? password : undefined,
          email: email.trim() || undefined,
          accessExpiresAt: expiresIso,
          canOrder: isGuest ? canOrder : undefined,
          partnerId: partnerId || undefined,
        });
        toast.success(mode === 'guest' ? 'Гостевой доступ создан' : 'Сотрудник приглашён');
      }
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'edit' ? `Пользователь: ${user?.name}` : mode === 'guest' ? 'Гостевой доступ' : 'Пригласить сотрудника';
  const roles: Role[] = mode === 'guest' ? ['GUEST'] : mode === 'staff' ? [...STAFF, 'PARTNER'] : [...STAFF, 'PARTNER', 'GUEST'];

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={title}
      footer={
        <>
          {problems.length > 0 && <span className="mr-auto self-center text-xs text-coffee">{problems[0]}</span>}
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={busy} disabled={problems.length > 0}>
            {mode === 'edit' ? 'Сохранить' : mode === 'guest' ? 'Создать доступ' : 'Пригласить'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mode === 'guest' && (
          <Note tone="blue" icon={<Clock className="h-4 w-4" />}>
            Гость входит по логину и паролю (или по телефону). Доступ автоматически закроется после указанной даты.
          </Note>
        )}
        {mode !== 'guest' && (
          <div>
            <div className="mb-2 text-xs font-semibold text-cambodia/80">Роль</div>
            {isSelf ? (
              <Note tone="yellow">Свою роль изменить нельзя.</Note>
            ) : (
              <RolePicker value={role} onChange={setRole} roles={roles} />
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Айбек, менеджер" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
        </div>

        <div className="rounded-2xl border border-line p-4">
          <div className="mb-3 text-sm font-bold">Способ входа</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Телефон (вход по СМС)" hint={mode === 'staff' ? 'Основной способ для сотрудников' : undefined}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996700123456" inputMode="tel" />
            </Field>
            <Field label="Логин" hint="латиница, цифры, . _ -">
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={mode === 'edit' ? 'Новый пароль' : 'Пароль'} hint={mode === 'edit' ? 'оставьте пустым, чтобы не менять' : 'минимум 6 символов'}>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
            </Field>
          </div>
        </div>

        {(isGuest || isPartner) && (
          <div className="rounded-2xl border border-line p-4">
            <div className="mb-3 text-sm font-bold">{isGuest ? 'Права гостя' : 'Партнёр'}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {isGuest && (
                <Field label="Доступ до (включительно)" hint="Пусто — без ограничения">
                  <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </Field>
              )}
              {isGuest && (
                <div className="flex items-end pb-2">
                  <Toggle checked={canOrder} onChange={setCanOrder} label="Может оформлять заказы" />
                </div>
              )}
              {(needsPartner || isGuest) && (
                <Field
                  label={needsPartner ? 'Партнёр / контрагент *' : 'Партнёр / контрагент'}
                  hint={isGuest ? 'Заказы гостя оформляются от имени этого партнёра и по его ценам' : undefined}
                  className="sm:col-span-2"
                >
                  <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                    <option value="">— выберите —</option>
                    {(partners.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.inn ? `(ИНН ${p.inn})` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </div>
        )}

        {mode === 'edit' && !isSelf && (
          <div className="flex items-center justify-between rounded-2xl bg-oat px-4 py-3">
            <div>
              <div className="text-sm font-bold">Доступ</div>
              <div className="text-xs text-muted">Заблокированный пользователь не сможет войти</div>
            </div>
            <Toggle
              checked={status === 'ACTIVE'}
              onChange={(v) => setStatus(v ? 'ACTIVE' : 'BLOCKED')}
              label={status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
