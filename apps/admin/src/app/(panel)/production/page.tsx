'use client';

import { CalendarDays, ClipboardList, Factory, FilePlus2, Printer, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, Chip, Empty, Input, Loading, Modal, Note, PageHeader, SectionTitle, StatusChip, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, isoDay, plural } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { ProductionSummary, SheetDetail, SheetShort } from '@/lib/types';

export default function ProductionPage() {
  const me = useMe();
  const toast = useToast();
  const router = useRouter();
  const [date, setDate] = useState(isoDay(1));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const canCreate = ['ADMIN', 'MANAGER', 'WORKSHOP'].includes(me.role);

  const { data, loading, error, reload } = useLoad(() => api.get<ProductionSummary>('/production/summary', { date }), [date]);
  const history = useLoad(
    () => api.get<SheetShort[]>('/production/sheets', { dateFrom: isoDay(-14), dateTo: isoDay(14) }),
    [],
  );

  const pendingOrders = data?.pending.orders ?? [];
  const isSupplement = (data?.sheets.length ?? 0) > 0;
  const totalPositions = data?.pending.groups.reduce((a, g) => a + g.items.length, 0) ?? 0;

  const create = async () => {
    setCreating(true);
    try {
      const sheet = await api.post<SheetDetail>('/production/sheets', { date });
      toast.success(`Сводная накладная №${sheet.number} сформирована`);
      setConfirmOpen(false);
      reload();
      history.reload();
      router.push(`/production/sheets/${sheet.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Производство"
        subtitle="Что нужно испечь на дату доставки — по оплаченным заказам"
        actions={
          <div className="flex items-center gap-2">
            <Button variant={date === isoDay(0) ? 'dark' : 'secondary'} size="sm" onClick={() => setDate(isoDay(0))}>
              Сегодня
            </Button>
            <Button variant={date === isoDay(1) ? 'dark' : 'secondary'} size="sm" onClick={() => setDate(isoDay(1))}>
              Завтра
            </Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
          </div>
        }
      />

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Note tone="red">{error}</Note>
      ) : data ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <Card className={cx(loading && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-muted">Доставка {fmtDate(data.date)}</div>
                  <h2 className="text-xl font-bold">
                    {isSupplement ? 'Дозаказ — ещё не в производстве' : 'К производству'}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {pendingOrders.length} {plural(pendingOrders.length, 'оплаченный заказ', 'оплаченных заказа', 'оплаченных заказов')} ·{' '}
                    {totalPositions} {plural(totalPositions, 'позиция', 'позиции', 'позиций')}
                  </p>
                </div>
                {canCreate && (
                  <Button onClick={() => setConfirmOpen(true)} disabled={!pendingOrders.length}>
                    <FilePlus2 className="h-4 w-4" />
                    {isSupplement ? 'Сформировать дозаказ' : 'Сформировать сводную накладную'}
                  </Button>
                )}
              </div>

              {isSupplement && pendingOrders.length > 0 && (
                <Note tone="yellow" className="mt-4">
                  На эту дату уже есть сводная накладная. Новая будет <b>дозаказом</b> — только по заказам, оплаченным после неё.
                </Note>
              )}
              {data.awaitingPayment > 0 && (
                <Note tone="blue" icon={<Wallet className="h-4 w-4" />} className="mt-4">
                  Ещё {data.awaitingPayment} {plural(data.awaitingPayment, 'заказ ждёт', 'заказа ждут', 'заказов ждут')} оплаты на эту
                  дату — в производство заказ попадает после оплаты.{' '}
                  {me.role !== 'WORKSHOP' && (
                    <Link href={`/orders?status=APPROVED&dateFrom=${date}&dateTo=${date}`} className="font-semibold underline">
                      Посмотреть
                    </Link>
                  )}
                </Note>
              )}

              {!data.pending.groups.length ? (
                <Empty title="Нечего производить" icon={<Factory className="h-6 w-6" />}>
                  {isSupplement ? 'Все оплаченные заказы уже в сводной накладной.' : 'На эту дату пока нет оплаченных заказов.'}
                </Empty>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {data.pending.groups.map((g) => (
                    <div key={g.area} className="rounded-2xl border border-line">
                      <div className="flex items-center justify-between rounded-t-2xl bg-oat px-4 py-2.5">
                        <span className="font-bold">{g.area}</span>
                        <span className="text-xs text-muted">{g.items.length} поз.</span>
                      </div>
                      <ul className="divide-y divide-line/60">
                        {g.items.map((it) => (
                          <li key={it.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <span>{it.name}</span>
                            <span className="text-xl font-bold whitespace-nowrap tabular-nums">
                              {fmtQty(it.qty)} <span className="text-sm font-semibold text-muted">{it.unit}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {pendingOrders.length > 0 && (
              <Card>
                <SectionTitle>Заказы в эту партию</SectionTitle>
                <div className="divide-y divide-line/60">
                  {pendingOrders.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <Link href={`/orders/${o.id}`} className="font-bold hover:text-mango">
                          №{o.number}
                        </Link>{' '}
                        {o.partner}
                        <div className="text-xs text-muted">{o.deliveryAddress}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums">{fmtMoney(o.total)}</span>
                        <StatusChip status={o.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card>
              <SectionTitle>Накладные на {fmtDate(data.date)}</SectionTitle>
              {!data.sheets.length ? (
                <p className="text-sm text-muted">Ещё не сформированы.</p>
              ) : (
                <SheetList sheets={data.sheets} />
              )}
            </Card>
            <Card>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" /> Все накладные ±14 дней
                </span>
              </SectionTitle>
              {history.loading && !history.data ? (
                <Loading />
              ) : !history.data?.length ? (
                <p className="text-sm text-muted">Пусто.</p>
              ) : (
                <SheetList sheets={history.data} showDate />
              )}
            </Card>
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={isSupplement ? 'Сформировать дозаказ?' : 'Сформировать сводную накладную?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button onClick={create} loading={creating}>
              <ClipboardList className="h-4 w-4" /> Сформировать
            </Button>
          </>
        }
      >
        <p className="text-sm">
          В накладную на <b>{fmtDate(date)}</b> войдут {pendingOrders.length}{' '}
          {plural(pendingOrders.length, 'заказ', 'заказа', 'заказов')}. Они получат статус «В производстве», а в 1С уйдёт «Заказ на
          производство».
        </p>
      </Modal>
    </>
  );
}

function SheetList({ sheets, showDate }: { sheets: SheetShort[]; showDate?: boolean }) {
  return (
    <ul className="space-y-2">
      {sheets.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line px-3.5 py-2.5">
          <Link href={`/production/sheets/${s.id}`} className="min-w-0 flex-1 hover:text-mango">
            <div className="flex items-center gap-2 font-bold">
              №{s.number}
              {s.isSupplement && <Chip className="bg-mango text-white">дозаказ</Chip>}
            </div>
            <div className="text-xs text-muted">
              {showDate ? `на ${fmtDate(s.date)} · ` : ''}
              {s.ordersCount} {plural(s.ordersCount, 'заказ', 'заказа', 'заказов')} · {fmtDateTime(s.createdAt)}
            </div>
          </Link>
          <div className="flex shrink-0 gap-1">
            <Link
              href={`/production/sheets/${s.id}?print=1`}
              className="rounded-full p-2 text-muted hover:bg-oat hover:text-cambodia"
              title="Печать"
            >
              <Printer className="h-4 w-4" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

