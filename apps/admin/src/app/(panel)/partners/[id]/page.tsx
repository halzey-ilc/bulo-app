'use client';

import { ROLE_LABELS } from '@bulo/shared';
import { ArrowLeft, Ban, CircleCheck, Link2, Pencil, ShieldCheck, Unlock, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReasonModal } from '@/components/common';
import { CounterpartyPicker, PriceTypeSelect, usePriceTypes } from '@/components/partner-forms';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  Loading,
  Modal,
  Note,
  PartnerChip,
  SectionTitle,
  StatusChip,
  Table,
  Td,
  Textarea,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtPhone } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { PartnerDetail } from '@/lib/types';

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const toast = useToast();
  const canEdit = me.role === 'ADMIN' || me.role === 'MANAGER';
  const { data: p, loading, error, reload } = useLoad(() => api.get<PartnerDetail>(`/admin/partners/${id}`), [id]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reasonMode, setReasonMode] = useState<'reject' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !p) return <Loading />;
  if (error || !p)
    return (
      <>
        <Back />
        <Note tone="red">{error ?? 'Партнёр не найден'}</Note>
      </>
    );

  const unblock = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/partners/${p.id}/unblock`);
      toast.success('Партнёр разблокирован');
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Back />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold md:text-3xl">{p.name}</h1>
            <PartnerChip status={p.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Зарегистрирован {fmtDate(p.createdAt)}
            {p.approvedAt && ` · доступ открыт ${fmtDate(p.approvedAt)}`}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {(p.status === 'PENDING' || p.status === 'REJECTED') && (
              <Button onClick={() => setApproveOpen(true)}>
                <CircleCheck className="h-4 w-4" /> Одобрить
              </Button>
            )}
            {p.status === 'PENDING' && (
              <Button variant="danger" onClick={() => setReasonMode('reject')}>
                <X className="h-4 w-4" /> Отклонить
              </Button>
            )}
            {p.status === 'APPROVED' && (
              <Button variant="danger" onClick={() => setReasonMode('block')}>
                <Ban className="h-4 w-4" /> Заблокировать
              </Button>
            )}
            {p.status === 'BLOCKED' && (
              <Button variant="dark" onClick={unblock} loading={busy}>
                <Unlock className="h-4 w-4" /> Разблокировать
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Редактировать
            </Button>
          </div>
        )}
      </div>

      {p.rejectReason && (p.status === 'REJECTED' || p.status === 'BLOCKED') && (
        <Note tone="red" className="mb-5">
          Причина: <b>{p.rejectReason}</b>
        </Note>
      )}
      {p.status === 'PENDING' && (
        <Note tone="yellow" className="mb-5">
          Новая заявка. Проверьте реквизиты, выберите тип цен и при необходимости свяжите с контрагентом в 1С, затем
          одобрите — партнёр получит доступ к заказам в приложении.
        </Note>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <SectionTitle>Последние заказы</SectionTitle>
            {!p.orders.length ? (
              <p className="text-sm text-muted">Заказов пока нет.</p>
            ) : (
              <Table className="-mx-2">
                <thead>
                  <tr>
                    <Th>№</Th>
                    <Th>Доставка</Th>
                    <Th className="text-right">Сумма</Th>
                    <Th>Статус</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.orders.map((o) => (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`/orders/${o.id}`} className="font-bold hover:text-mango">
                          №{o.number}
                        </Link>
                      </Td>
                      <Td>{fmtDate(o.deliveryDate)}</Td>
                      <Td className="text-right tabular-nums">{fmtMoney(o.total)}</Td>
                      <Td>
                        <StatusChip status={o.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Link href={`/orders?partnerId=${p.id}`} className="mt-3 inline-block text-sm font-semibold text-mango">
              Все заказы партнёра →
            </Link>
          </Card>

          <Card>
            <SectionTitle>Пользователи партнёра</SectionTitle>
            {!p.users.length ? (
              <p className="text-sm text-muted">Нет пользователей.</p>
            ) : (
              <div className="divide-y divide-line/60">
                {p.users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-xs text-muted">
                        {u.phone ? fmtPhone(u.phone) : u.login} · последний вход {fmtDateTime(u.lastLoginAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Chip>{ROLE_LABELS[u.role]}</Chip>
                      {u.status === 'BLOCKED' && <Chip className="bg-coffee-soft text-coffee">заблокирован</Chip>}
                      {u.role === 'GUEST' && u.accessExpiresAt && <Chip className="bg-butter">до {fmtDate(u.accessExpiresAt)}</Chip>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Реквизиты</SectionTitle>
            <dl className="space-y-2.5 text-sm">
              <Row label="ИНН">{p.inn ?? '—'}</Row>
              <Row label="Контакт">{p.contactName ?? '—'}</Row>
              <Row label="Телефон">{fmtPhone(p.phone)}</Row>
              <Row label="Email">{p.email ?? '—'}</Row>
              <Row label="Тип цен">{p.priceType?.name ?? 'по умолчанию'}</Row>
            </dl>
            {p.note && <div className="mt-4 rounded-2xl bg-oat px-4 py-3 text-sm">{p.note}</div>}
          </Card>
          <Card>
            <SectionTitle>Адреса доставки</SectionTitle>
            {!p.addresses?.length ? (
              <p className="text-sm text-muted">Адресов нет.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.addresses.map((a) => (
                  <li key={a.id} className="rounded-2xl bg-oat px-3.5 py-2.5">
                    {a.label && <b>{a.label}: </b>}
                    {a.address}
                    {a.isDefault && <span className="ml-2 text-xs text-mango">основной</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <SectionTitle>Связь с 1С</SectionTitle>
            {p.oneCId ? (
              <div className="flex items-start gap-3 text-sm">
                <Link2 className="mt-0.5 h-4 w-4 text-mango" />
                <div>
                  {p.counterparty ? (
                    <>
                      <div className="font-semibold">{p.counterparty.name}</div>
                      <div className="text-xs text-muted">ИНН {p.counterparty.inn ?? '—'}</div>
                    </>
                  ) : (
                    <div className="text-muted">Контрагент не найден в справочнике (ещё не пришёл из 1С)</div>
                  )}
                  <div className="text-xs text-muted">код 1С: {p.oneCId}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Не связан. Документы уйдут в 1С по ИНН и названию.</p>
            )}
          </Card>
        </div>
      </div>

      <ApproveModal partner={p} open={approveOpen} onClose={() => setApproveOpen(false)} onDone={reload} />
      <EditModal partner={p} open={editOpen} onClose={() => setEditOpen(false)} onDone={reload} />
      <ReasonModal
        open={!!reasonMode}
        title={reasonMode === 'reject' ? 'Отклонить заявку' : 'Заблокировать партнёра'}
        description={
          reasonMode === 'block'
            ? 'Пользователи партнёра потеряют доступ к заказам в приложении.'
            : 'Партнёр увидит причину отказа в приложении.'
        }
        confirmLabel={reasonMode === 'reject' ? 'Отклонить' : 'Заблокировать'}
        onClose={() => setReasonMode(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/partners/${p.id}/${reasonMode}`, { reason });
          toast.success(reasonMode === 'reject' ? 'Заявка отклонена' : 'Партнёр заблокирован');
          reload();
        }}
      />
    </>
  );
}

function Back() {
  return (
    <Link href="/partners" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-cambodia">
      <ArrowLeft className="h-4 w-4" /> Все партнёры
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function ApproveModal({ partner, open, onClose, onDone }: { partner: PartnerDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const priceTypes = usePriceTypes();
  const [priceTypeId, setPriceTypeId] = useState(partner.priceTypeId ?? '');
  const [oneCId, setOneCId] = useState(partner.oneCId ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Одобрить: ${partner.name}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/admin/partners/${partner.id}/approve`, {
                  priceTypeId: priceTypeId || undefined,
                  oneCId: oneCId || undefined,
                });
                toast.success('Партнёр одобрен — доступ открыт');
                onClose();
                onDone();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ShieldCheck className="h-4 w-4" /> Одобрить и открыть доступ
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl bg-oat p-4 text-sm">
            <div className="font-bold">{partner.name}</div>
            <div className="text-muted">ИНН {partner.inn ?? '—'}</div>
            <div className="text-muted">
              {partner.contactName} · {fmtPhone(partner.phone)}
            </div>
          </div>
          <Field label="Тип цен" hint="Определяет, по каким ценам партнёр видит каталог">
            <PriceTypeSelect value={priceTypeId} onChange={setPriceTypeId} priceTypes={priceTypes.data ?? []} />
          </Field>
        </div>
        <CounterpartyPicker value={oneCId} onChange={setOneCId} initialSearch={partner.inn ?? ''} />
      </div>
    </Modal>
  );
}

function EditModal({ partner, open, onClose, onDone }: { partner: PartnerDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const priceTypes = usePriceTypes();
  const [f, setF] = useState({
    name: partner.name,
    inn: partner.inn ?? '',
    contactName: partner.contactName ?? '',
    phone: partner.phone ?? '',
    email: partner.email ?? '',
    note: partner.note ?? '',
  });
  const [priceTypeId, setPriceTypeId] = useState(partner.priceTypeId ?? '');
  const [oneCId, setOneCId] = useState(partner.oneCId ?? '');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Редактировать партнёра"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.patch(`/admin/partners/${partner.id}`, {
                  name: f.name.trim(),
                  inn: f.inn.trim(),
                  contactName: f.contactName.trim(),
                  phone: f.phone.trim(),
                  email: f.email.trim() || undefined,
                  note: f.note,
                  priceTypeId: priceTypeId || null,
                  oneCId: oneCId || null,
                });
                toast.success('Сохранено');
                onClose();
                onDone();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Название">
            <Input value={f.name} onChange={set('name')} />
          </Field>
          <Field label="ИНН">
            <Input value={f.inn} onChange={set('inn')} />
          </Field>
          <Field label="Контактное лицо">
            <Input value={f.contactName} onChange={set('contactName')} />
          </Field>
          <Field label="Телефон">
            <Input value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <Input value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Тип цен">
            <PriceTypeSelect value={priceTypeId} onChange={setPriceTypeId} priceTypes={priceTypes.data ?? []} />
          </Field>
          <Field label="Заметка (внутренняя)">
            <Textarea value={f.note} onChange={set('note')} />
          </Field>
        </div>
        <CounterpartyPicker value={oneCId} onChange={setOneCId} />
      </div>
    </Modal>
  );
}
