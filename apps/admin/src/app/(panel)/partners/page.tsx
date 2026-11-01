'use client';

import type { PartnerStatus } from '@bulo/shared';
import { Plus, Search, Store } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PriceTypeSelect, usePriceTypes } from '@/components/partner-forms';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  Note,
  PageHeader,
  PartnerChip,
  Table,
  Tabs,
  Td,
  Th,
  Toggle,
  cx,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtPhone } from '@/lib/format';
import { useDebounced, useLoad } from '@/lib/hooks';
import type { Partner } from '@/lib/types';

const TABS: { value: PartnerStatus; label: string }[] = [
  { value: 'PENDING', label: 'Заявки' },
  { value: 'APPROVED', label: 'Активные' },
  { value: 'REJECTED', label: 'Отклонённые' },
  { value: 'BLOCKED', label: 'Заблокированные' },
];

function PartnersInner() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = (sp.get('status') as PartnerStatus) || 'APPROVED';
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const canEdit = me.role === 'ADMIN' || me.role === 'MANAGER';

  const { data, loading, error, reload } = useLoad(
    () => api.get<Partner[]>('/admin/partners', { status, search: q.trim() || undefined }),
    [status, q],
  );
  const pending = useLoad(() => api.get<Partner[]>('/admin/partners', { status: 'PENDING' }), []);

  return (
    <>
      <PageHeader
        title="Партнёры"
        subtitle="Кофейни, магазины и другие клиенты, которые заказывают через приложение"
        actions={
          canEdit && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Добавить партнёра
            </Button>
          )
        }
      />
      {me.role === 'ACCOUNTANT' && (
        <Note tone="blue" className="mb-4">
          Режим просмотра: бухгалтер видит партнёров, но не меняет их.
        </Note>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={(v) => router.replace(`${pathname}?status=${v}`)}
          items={TABS.map((t) => ({ ...t, count: t.value === 'PENDING' ? pending.data?.length : undefined }))}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Название, ИНН, телефон" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="p-0 sm:p-0">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <div className="p-5">
            <Note tone="red">{error}</Note>
          </div>
        ) : !data?.length ? (
          <Empty title={status === 'PENDING' ? 'Новых заявок нет' : 'Партнёров не найдено'} icon={<Store className="h-6 w-6" />}>
            {status === 'PENDING' && 'Заявки появятся, когда партнёры зарегистрируются в мобильном приложении.'}
          </Empty>
        ) : (
          <Table className={cx(loading && 'opacity-60')}>
            <thead>
              <tr>
                <Th className="pl-5">Партнёр</Th>
                <Th>Контакт</Th>
                <Th>Адрес</Th>
                <Th>Тип цен</Th>
                <Th>1С</Th>
                <Th>{status === 'PENDING' ? 'Заявка от' : 'Заказов'}</Th>
                <Th>Статус</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-oat/60" onClick={() => router.push(`/partners/${p.id}`)}>
                  <Td className="pl-5">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">ИНН {p.inn ?? '—'}</div>
                  </Td>
                  <Td>
                    <div>{p.contactName ?? '—'}</div>
                    <div className="text-xs whitespace-nowrap text-muted">{fmtPhone(p.phone)}</div>
                  </Td>
                  <Td className="max-w-[240px] truncate text-muted">{p.addresses?.[0]?.address ?? '—'}</Td>
                  <Td>{p.priceType?.name ?? <span className="text-muted">по умолчанию</span>}</Td>
                  <Td>{p.oneCId ? <span className="text-cambodia">связан</span> : <span className="text-muted">—</span>}</Td>
                  <Td className="whitespace-nowrap">{status === 'PENDING' ? fmtDate(p.createdAt) : p._count?.orders ?? 0}</Td>
                  <Td>
                    <PartnerChip status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <CreatePartnerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          reload();
          router.push(`/partners/${id}`);
        }}
      />
    </>
  );
}

function CreatePartnerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const priceTypes = usePriceTypes();
  const [f, setF] = useState({ name: '', inn: '', contactName: '', phone: '+996', email: '', address: '', priceTypeId: '' });
  const [createUser, setCreateUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<Partner>('/admin/partners', {
        name: f.name.trim(),
        inn: f.inn.trim() || undefined,
        contactName: f.contactName.trim(),
        phone: f.phone.replace(/[^\d+]/g, ''),
        email: f.email.trim() || undefined,
        address: f.address.trim() || undefined,
        priceTypeId: f.priceTypeId || undefined,
        createUser,
      });
      toast.success('Партнёр добавлен');
      setF({ name: '', inn: '', contactName: '', phone: '+996', email: '', address: '', priceTypeId: '' });
      onCreated(res.id);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый партнёр"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={busy} disabled={f.name.trim().length < 2 || f.contactName.trim().length < 2 || f.phone.length < 10}>
            Создать
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название *" className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} placeholder="Кофейня «Утро»" />
        </Field>
        <Field label="ИНН">
          <Input value={f.inn} onChange={set('inn')} inputMode="numeric" />
        </Field>
        <Field label="Тип цен">
          <PriceTypeSelect value={f.priceTypeId} onChange={(v) => setF({ ...f, priceTypeId: v })} priceTypes={priceTypes.data ?? []} />
        </Field>
        <Field label="Контактное лицо *">
          <Input value={f.contactName} onChange={set('contactName')} />
        </Field>
        <Field label="Телефон *">
          <Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="+996700123456" />
        </Field>
        <Field label="Email">
          <Input value={f.email} onChange={set('email')} type="email" />
        </Field>
        <Field label="Адрес доставки">
          <Input value={f.address} onChange={set('address')} placeholder="г. Бишкек, ул. …" />
        </Field>
        <div className="sm:col-span-2">
          <Toggle
            checked={createUser}
            onChange={setCreateUser}
            label="Сразу открыть вход в приложение по этому телефону (СМС)"
          />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">Партнёр, созданный вручную, сразу получает статус «Доступ открыт».</p>
    </Modal>
  );
}

export default function PartnersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PartnersInner />
    </Suspense>
  );
}
