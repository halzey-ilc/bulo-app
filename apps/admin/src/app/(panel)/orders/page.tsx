'use client';

import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@bulo/shared';
import type { OrderStatus, Role } from '@bulo/shared';
import { ClipboardList, RotateCcw, Search, Truck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Input, Loading, Note, PageHeader, Select, StatusChip, Table, Td, Th, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtMoney, plural } from '@/lib/format';
import { useDebounced, useLoad } from '@/lib/hooks';
import { ACTION_LABELS } from '@/lib/orders';
import type { Order, Partner } from '@/lib/types';

/** Статусы, которые видит роль (по правилам API) */
const ROLE_STATUSES: Partial<Record<Role, OrderStatus[]>> = {
  WORKSHOP: ['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY'],
  COURIER: ['READY', 'SHIPPED', 'DELIVERED'],
};

/** Быстрые действия прямо в списке для цеха и курьера */
const QUICK: Partial<Record<Role, Partial<Record<OrderStatus, OrderStatus>>>> = {
  WORKSHOP: { NEW: 'IN_PRODUCTION', IN_PRODUCTION: 'READY' },
  COURIER: { READY: 'SHIPPED', SHIPPED: 'DELIVERED' },
};

function OrdersInner() {
  const me = useMe();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const statuses = (sp.get('status') ?? '').split(',').filter(Boolean) as OrderStatus[];
  const dateFrom = sp.get('dateFrom') ?? '';
  const dateTo = sp.get('dateTo') ?? '';
  const partnerId = sp.get('partnerId') ?? '';
  const paid = sp.get('paid') ?? '';
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const debounced = useDebounced(search, 350);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  const available = ROLE_STATUSES[me.role] ?? [...ORDER_STATUSES];
  const canSeePartners = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(me.role);

  const { data, loading, error, reload } = useLoad(
    () =>
      api.get<Order[]>('/orders', {
        status: statuses.join(',') || undefined,
        dateFrom,
        dateTo,
        partnerId,
        search: debounced.trim() || undefined,
        paid: paid || undefined,
      }),
    [statuses.join(','), dateFrom, dateTo, partnerId, debounced, paid],
  );
  const partners = useLoad(
    () => (canSeePartners ? api.get<Partner[]>('/admin/partners', { status: 'APPROVED' }) : Promise.resolve([])),
    [],
  );

  const toggleStatus = (s: OrderStatus) => {
    const set = new Set(statuses);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    setParam({ status: [...set].join(',') });
  };

  const totals = useMemo(() => {
    const list = data ?? [];
    return { count: list.length, sum: list.reduce((a, o) => a + (o.total || 0), 0) };
  }, [data]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const quick = async (o: Order, to: OrderStatus) => {
    setBusyId(o.id);
    try {
      await api.post(`/orders/${o.id}/status`, { status: to });
      toast.success(`Заказ №${o.number}: ${ORDER_STATUS_LABELS[to]}`);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };
  const quickMap = QUICK[me.role];
  const hasFilters = statuses.length || dateFrom || dateTo || partnerId || search;

  return (
    <>
      <PageHeader
        title="Заказы"
        subtitle={
          data
            ? `${totals.count} ${plural(totals.count, 'заказ', 'заказа', 'заказов')} на сумму ${fmtMoney(totals.sum)}${
                totals.count >= 300 ? ' · показаны последние 300' : ''
              }`
            : ' '
        }
      />

      {me.role === 'COURIER' && (
        <Note tone="blue" icon={<Truck className="h-4 w-4" />} className="mb-4">
          Процесс работы курьера дорабатывается. Пока отмечайте здесь «Передан курьеру» и «Доставлен» — в будущем это
          будет удобнее делать с телефона.
        </Note>
      )}

      <Card className="mb-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {available.map((s) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  on ? 'border-mango bg-mango text-white' : 'border-line bg-white text-cambodia/80 hover:border-cambodia/30',
                )}
              >
                {ORDER_STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.3fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="№ заказа или партнёр"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            с
            <Input type="date" value={dateFrom} onChange={(e) => setParam({ dateFrom: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            по
            <Input type="date" value={dateTo} onChange={(e) => setParam({ dateTo: e.target.value })} />
          </label>
          {canSeePartners ? (
            <Select value={partnerId} onChange={(e) => setParam({ partnerId: e.target.value })}>
              <option value="">Все партнёры</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : (
            <div />
          )}
          <Button
            variant="ghost"
            disabled={!hasFilters}
            onClick={() => {
              setSearch('');
              router.replace(pathname);
            }}
          >
            <RotateCcw className="h-4 w-4" /> Сбросить
          </Button>
        </div>
        <p className="text-xs text-muted">Даты — по дате доставки.</p>
      </Card>

      <Card className="p-0 sm:p-0">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <div className="p-5">
            <Note tone="red">{error}</Note>
          </div>
        ) : !data?.length ? (
          <Empty title="Заказов не найдено" icon={<ClipboardList className="h-6 w-6" />}>
            Измените фильтры или дождитесь новых заказов от партнёров.
          </Empty>
        ) : (
          <Table className={cx(loading && 'opacity-60')}>
            <thead>
              <tr>
                <Th className="pl-5">№</Th>
                <Th>Партнёр</Th>
                <Th>Доставка</Th>
                <Th>Адрес</Th>
                <Th className="text-right">Сумма</Th>
                <Th>Статус</Th>
                {quickMap && <Th />}
              </tr>
            </thead>
            <tbody>
              {data.map((o) => {
                const q = quickMap?.[o.status];
                return (
                  <tr key={o.id} className="cursor-pointer transition hover:bg-oat/60" onClick={() => router.push(`/orders/${o.id}`)}>
                    <Td className="pl-5 font-bold">
                      <Link href={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-mango">
                        №{o.number}
                      </Link>
                    </Td>
                    <Td>
                      <div className="font-semibold">{o.partner?.name}</div>
                      <div className="text-xs text-muted">{o.items?.length ?? 0} поз.</div>
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(o.deliveryDate)}</Td>
                    <Td className="max-w-[260px] truncate text-muted">{o.deliveryAddress ?? '—'}</Td>
                    <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{fmtMoney(o.total)}</Td>
                    <Td>
                      <StatusChip status={o.status} />
                    </Td>
                    {quickMap && (
                      <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                        {q && (
                          <Button size="sm" loading={busyId === o.id} onClick={() => quick(o, q)}>
                            {ACTION_LABELS[q]}
                          </Button>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersInner />
    </Suspense>
  );
}
