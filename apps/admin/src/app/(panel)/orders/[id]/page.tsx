'use client';

import { ORDER_FLOW, ORDER_STATUS_LABELS, ROLE_LABELS } from '@bulo/shared';
import type { OrderStatus } from '@bulo/shared';
import { ArrowLeft, Check, CircleAlert, Info, Minus, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ReasonModal } from '@/components/common';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  Field,
  Input,
  Loading,
  Modal,
  Note,
  SectionTitle,
  Select,
  StatusChip,
  Table,
  Td,
  Textarea,
  Th,
  cx,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtPhone, fmtQty } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { ACTION_LABELS, NEGATIVE } from '@/lib/orders';
import type { Order, Product } from '@/lib/types';

interface EditLine {
  productId: string;
  name: string;
  unit: string;
  multiplicity: number;
  price: number;
  qty: number;
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const toast = useToast();
  const { data: order, loading, error, reload } = useLoad(() => api.get<Order>(`/orders/${id}`), [id]);

  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [reasonFor, setReasonFor] = useState<OrderStatus | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const canEdit = order && ['NEW', 'APPROVED', 'PAID'].includes(order.status) && ['ADMIN', 'MANAGER'].includes(me.role);
  /** Оплата отмечается отдельно от статуса: цех готовит, не дожидаясь её */
  const canMarkPaid =
    !!order && !order.paidAt && !['REJECTED', 'CANCELLED'].includes(order.status) && ['ADMIN', 'ACCOUNTANT'].includes(me.role);

  const changeStatus = async (status: OrderStatus, extra: { comment?: string } = {}) => {
    setBusy(status);
    try {
      await api.post(`/orders/${id}/status`, { status, ...extra });
      toast.success(`Статус: ${ORDER_STATUS_LABELS[status]}`);
      await reload();
    } catch (e) {
      toast.error(e);
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const markPaid = async (paymentMethod: string, comment: string) => {
    try {
      await api.post(`/orders/${id}/payment`, { paymentMethod: paymentMethod || undefined, comment: comment || undefined });
      toast.success('Оплата отмечена');
      await reload();
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  const onAction = (s: OrderStatus) => {
    if (NEGATIVE.includes(s)) setReasonFor(s);
    else changeStatus(s).catch(() => {});
  };

  if (loading && !order) return <Loading />;
  if (error || !order)
    return (
      <>
        <BackLink />
        <Note tone="red">{error ?? 'Заказ не найден'}</Note>
      </>
    );

  const actions = order.actions ?? [];
  const positive = actions.filter((a) => !NEGATIVE.includes(a));
  const negative = actions.filter((a) => NEGATIVE.includes(a));
  const flowIndex = ORDER_FLOW.indexOf(order.status);

  return (
    <>
      <BackLink />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold md:text-3xl">Заказ №{order.number}</h1>
            <StatusChip status={order.status} className="text-sm" />
          </div>
          <p className="mt-1 text-sm text-muted">
            Создан {fmtDateTime(order.createdAt)}
            {order.createdBy && ` · ${order.createdBy.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {positive.map((a) => (
            <Button key={a} onClick={() => onAction(a)} loading={busy === a}>
              <Check className="h-4 w-4" />
              {ACTION_LABELS[a]}
            </Button>
          ))}
          {canMarkPaid && (
            <Button variant="dark" onClick={() => setPayOpen(true)}>
              <Wallet className="h-4 w-4" /> Отметить оплату
            </Button>
          )}
          {negative.map((a) => (
            <Button key={a} variant="danger" onClick={() => onAction(a)}>
              {ACTION_LABELS[a]}
            </Button>
          ))}
        </div>
      </div>

      {/* Шкала статусов */}
      <Card className="mb-5 overflow-x-auto">
        {flowIndex >= 0 ? (
          <ol className="flex min-w-[640px] items-center">
            {ORDER_FLOW.map((s, i) => {
              const done = i <= flowIndex;
              return (
                <li key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className={cx(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                        i === flowIndex ? 'bg-mango text-white ring-4 ring-mango/15' : done ? 'bg-cambodia text-oat' : 'bg-oat text-muted',
                      )}
                    >
                      {done && i !== flowIndex ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={cx('w-24 text-center text-[11px] leading-tight', done ? 'font-semibold' : 'text-muted')}>
                      {ORDER_STATUS_LABELS[s]}
                    </span>
                  </div>
                  {i < ORDER_FLOW.length - 1 && (
                    <div className={cx('mx-1 mb-6 h-0.5 flex-1 rounded', i < flowIndex ? 'bg-cambodia' : 'bg-line')} />
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <Note tone="red" icon={<CircleAlert className="h-4 w-4" />}>
            Заказ {order.status === 'REJECTED' ? 'отклонён' : 'отменён'}
            {order.rejectReason && (
              <>
                : <b>{order.rejectReason}</b>
              </>
            )}
          </Note>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <SectionTitle
              right={
                canEdit &&
                !editing && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Изменить состав
                  </Button>
                )
              }
            >
              Состав заказа
            </SectionTitle>
            {editing ? (
              <ItemsEditor
                order={order}
                onCancel={() => setEditing(false)}
                onSaved={async () => {
                  setEditing(false);
                  await reload();
                }}
              />
            ) : (
              <Table className="-mx-2">
                <thead>
                  <tr>
                    <Th>Товар</Th>
                    <Th className="text-right">Кол-во</Th>
                    <Th className="text-right">Цена</Th>
                    <Th className="text-right">Сумма</Th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((it) => (
                    <tr key={it.id}>
                      <Td>
                        <div className="font-semibold">{it.name}</div>
                        <div className="text-xs text-muted">{it.category}</div>
                      </Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {fmtQty(it.qty)} {it.unit}
                      </Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">{fmtMoney(it.price)}</Td>
                      <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{fmtMoney(it.sum)}</Td>
                    </tr>
                  ))}
                  <tr>
                    <Td colSpan={3} className="border-none text-right font-semibold">
                      Итого
                    </Td>
                    <Td className="border-none text-right text-lg font-bold whitespace-nowrap tabular-nums">
                      {fmtMoney(order.total)}
                    </Td>
                  </tr>
                </tbody>
              </Table>
            )}
            {order.comment && (
              <div className="mt-4 rounded-2xl bg-oat px-4 py-3 text-sm">
                <span className="font-semibold">Комментарий: </span>
                {order.comment}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>История</SectionTitle>
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {[...(order.history ?? [])].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-mango" />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={h.to} />
                    <span className="text-xs text-muted">{fmtDateTime(h.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    {h.user ? (
                      <>
                        {h.user.name} <span className="text-muted">· {ROLE_LABELS[h.user.role]}</span>
                      </>
                    ) : (
                      <span className="text-muted">Система</span>
                    )}
                  </div>
                  {h.comment && <div className="mt-1 text-sm text-cambodia/80">«{h.comment}»</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Партнёр</SectionTitle>
            <Link href={`/partners/${order.partnerId}`} className="text-lg font-bold hover:text-mango">
              {order.partner?.name}
            </Link>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="ИНН">{order.partner?.inn ?? '—'}</Row>
              <Row label="Контакт">{order.partner?.contactName ?? '—'}</Row>
              <Row label="Телефон">{fmtPhone(order.partner?.phone)}</Row>
              <Row label="Тип цен">{order.partner?.priceType?.name ?? 'Базовая'}</Row>
            </dl>
          </Card>
          <Card>
            <SectionTitle>Доставка</SectionTitle>
            <dl className="space-y-2 text-sm">
              <Row label="Дата">{fmtDate(order.deliveryDate)}</Row>
              <Row label="Адрес">{order.deliveryAddress ?? '—'}</Row>
              <Row label="Курьер">{order.courier ? `${order.courier.name}` : '—'}</Row>
              {order.shippedAt && <Row label="Передан">{fmtDateTime(order.shippedAt)}</Row>}
              {order.deliveredAt && <Row label="Доставлен">{fmtDateTime(order.deliveredAt)}</Row>}
            </dl>
          </Card>
          <Card>
            <SectionTitle>Оплата</SectionTitle>
            <dl className="space-y-2 text-sm">
              <Row label="Сумма">
                <b>{fmtMoney(order.total)}</b>
              </Row>
              <Row label="Оплачен">{order.paidAt ? fmtDateTime(order.paidAt) : <span className="font-semibold text-coffee">ещё нет</span>}</Row>
              <Row label="Способ">{order.paymentMethod || '—'}</Row>
            </dl>
            <Note tone="yellow" icon={<Info className="h-4 w-4" />} className="mt-4 text-xs">
              Способ оплаты уточняется — пока указывается свободным текстом.
            </Note>
          </Card>
        </div>
      </div>

      <PayModal
        open={payOpen}
        order={order}
        onClose={() => setPayOpen(false)}
        onConfirm={async (paymentMethod, comment) => {
          await markPaid(paymentMethod, comment);
          setPayOpen(false);
        }}
      />
      <ReasonModal
        open={!!reasonFor}
        title={reasonFor === 'REJECTED' ? `Отклонить заказ №${order.number}` : `Отменить заказ №${order.number}`}
        description="Партнёр получит уведомление с указанной причиной."
        confirmLabel={reasonFor === 'REJECTED' ? 'Отклонить' : 'Отменить заказ'}
        onClose={() => setReasonFor(null)}
        onConfirm={async (reason) => {
          if (reasonFor) await changeStatus(reasonFor, { comment: reason });
        }}
      />
    </>
  );
}

function BackLink() {
  return (
    <Link href="/orders" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-cambodia">
      <ArrowLeft className="h-4 w-4" /> Все заказы
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function PayModal({
  open,
  order,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: Order;
  onClose: () => void;
  onConfirm: (method: string, comment: string) => Promise<void>;
}) {
  const [method, setMethod] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Оплата заказа №${order.number}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="dark"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(method.trim(), comment.trim());
              } catch {
                /* toast уже показан */
              } finally {
                setBusy(false);
              }
            }}
          >
            <Wallet className="h-4 w-4" /> Отметить оплату
          </Button>
        </>
      }
    >
      <div className="mb-5 rounded-2xl bg-oat p-4 text-center">
        <div className="text-sm text-muted">{order.partner?.name}</div>
        <div className="text-3xl font-bold">{fmtMoney(order.total)}</div>
      </div>
      <Note tone="yellow" icon={<Info className="h-4 w-4" />} className="mb-4">
        Способ оплаты уточняется. Пока можно указать его свободным текстом — например, «перевод», «наличные», «Мбанк».
      </Note>
      <div className="space-y-4">
        <Field label="Способ оплаты (необязательно)">
          <Input value={method} maxLength={60} onChange={(e) => setMethod(e.target.value)} placeholder="перевод" />
        </Field>
        <Field label="Комментарий (необязательно)">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ItemsEditor({ order, onCancel, onSaved }: { order: Order; onCancel: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const products = useLoad(() => api.get<Product[]>('/admin/catalog/products'), []);
  const [lines, setLines] = useState<EditLine[]>(() =>
    (order.items ?? []).map((i) => ({
      productId: i.productId,
      name: i.name,
      unit: i.unit,
      multiplicity: i.multiplicity || 1,
      price: i.price,
      qty: i.qty,
    })),
  );
  const [comment, setComment] = useState('');
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const priceFor = (p: Product) => {
    const own = p.prices.find((x) => x.priceTypeId === order.partner?.priceTypeId);
    const def = p.prices.find((x) => x.priceType?.isDefault);
    return (own ?? def ?? p.prices[0])?.price ?? 0;
  };

  const available = useMemo(
    () => (products.data ?? []).filter((p) => !lines.some((l) => l.productId === p.id)),
    [products.data, lines],
  );

  const invalid = lines.filter((l) => !(l.qty > 0) || Math.abs(l.qty / l.multiplicity - Math.round(l.qty / l.multiplicity)) > 1e-6);
  const total = lines.reduce((a, l) => a + l.qty * l.price, 0);

  const setQty = (pid: string, qty: number) =>
    setLines((ls) => ls.map((l) => (l.productId === pid ? { ...l, qty: Math.max(0, Math.round(qty * 1000) / 1000) } : l)));

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/orders/${order.id}/items`, {
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        comment: comment.trim() || undefined,
      });
      toast.success('Состав заказа обновлён, партнёр получит уведомление');
      await onSaved();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {lines.map((l) => {
          const bad = invalid.includes(l);
          return (
            <div
              key={l.productId}
              className={cx('flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5', bad ? 'border-coffee/40 bg-coffee-soft/40' : 'border-line')}
            >
              <div className="min-w-[160px] flex-1">
                <div className="font-semibold">{l.name}</div>
                <div className="text-xs text-muted">
                  кратность {fmtQty(l.multiplicity)} {l.unit} · {fmtMoney(l.price)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="rounded-full border border-line p-1.5 hover:bg-oat"
                  onClick={() => setQty(l.productId, l.qty - l.multiplicity)}
                  aria-label="Меньше"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <Input
                  type="number"
                  step={l.multiplicity}
                  min={0}
                  value={l.qty}
                  onChange={(e) => setQty(l.productId, Number(e.target.value))}
                  className="h-9 w-20 text-center"
                />
                <button
                  className="rounded-full border border-line p-1.5 hover:bg-oat"
                  onClick={() => setQty(l.productId, l.qty + l.multiplicity)}
                  aria-label="Больше"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="w-28 text-right font-semibold tabular-nums">{fmtMoney(l.qty * l.price)}</div>
              <button
                className="rounded-full p-1.5 text-coffee/70 hover:bg-coffee-soft"
                onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}
                aria-label="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={adding} onChange={(e) => setAdding(e.target.value)} className="max-w-sm flex-1">
          <option value="">{products.loading ? 'Загрузка товаров…' : 'Добавить товар…'}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — кратность {p.multiplicity} {p.unit}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={!adding}
          onClick={() => {
            const p = products.data?.find((x) => x.id === adding);
            if (!p) return;
            setLines((ls) => [
              ...ls,
              { productId: p.id, name: p.name, unit: p.unit, multiplicity: p.multiplicity || 1, price: priceFor(p), qty: p.multiplicity || 1 },
            ]);
            setAdding('');
          }}
        >
          <Plus className="h-4 w-4" /> Добавить
        </Button>
      </div>

      {invalid.length > 0 && (
        <Note tone="red">Количество должно быть больше нуля и кратно кратности товара.</Note>
      )}

      <Field label="Комментарий к изменению (увидит партнёр)">
        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: заменили позицию по согласованию" />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          <div className="text-xs text-muted">Итого (предварительно, сервер пересчитает по ценам партнёра)</div>
          <div className="text-xl font-bold">{fmtMoney(total)}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={save} loading={busy} disabled={!lines.length || invalid.length > 0}>
            Сохранить состав
          </Button>
        </div>
      </div>
    </div>
  );
}
