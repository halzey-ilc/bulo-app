'use client';

import { ChartColumn } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DownloadButton } from '@/components/common';
import { Button, Card, Empty, Input, Loading, Note, PageHeader, SectionTitle, Table, Tabs, Td, Th, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtQty, isoDay, monthEnd, monthStart } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { SalesReport } from '@/lib/types';

interface Debt {
  orderId: string;
  number: number;
  partnerId: string;
  partner: string;
  phone: string | null;
  deliveryDate: string;
  total: number;
}

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [tab, setTab] = useState<'partners' | 'products'>('partners');
  const { data, loading, error } = useLoad(() => api.get<SalesReport>('/reports/sales', { from, to }), [from, to]);
  const debts = useLoad(() => api.get<Debt[]>('/reports/debts'), []);

  const presets = [
    { label: 'Этот месяц', from: monthStart(), to: monthEnd() },
    { label: '7 дней', from: isoDay(-6), to: isoDay(0) },
    { label: '30 дней', from: isoDay(-29), to: isoDay(0) },
  ];

  return (
    <>
      <PageHeader
        title="Отчёты"
        subtitle="Продажи по дате доставки, задолженность партнёров"
        actions={
          <>
            <DownloadButton path="/reports/sales.xlsx" query={{ from, to }} filename={`prodazhi-${from}-${to}.xlsx`}>
              Продажи, Excel
            </DownloadButton>
            <DownloadButton path="/reports/orders.xlsx" query={{ from, to }} filename={`zakazy-${from}-${to}.xlsx`}>
              Заказы, Excel
            </DownloadButton>
          </>
        }
      />

      <Card className="mb-5 flex flex-wrap items-center gap-3">
        {presets.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={from === p.from && to === p.to ? 'dark' : 'secondary'}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </Button>
        ))}
        <div className="flex items-center gap-2 text-sm text-muted">
          с <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" />
          по <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" />
        </div>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Note tone="red">{error}</Note>
      ) : data ? (
        <div className={cx('space-y-5', loading && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Заказов" value={String(data.totals.orders)} />
            <Stat label="Продажи" value={fmtMoney(data.totals.total)} accent />
            <Stat label="Оплачено" value={fmtMoney(data.totals.paid)} />
            <Stat label="Не оплачено" value={fmtMoney(data.totals.unpaid)} warn={data.totals.unpaid > 0} />
          </div>

          <Card>
            <SectionTitle>Продажи по дням</SectionTitle>
            <DayChart days={data.byDay} from={data.from} to={data.to} />
          </Card>

          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <Card className="p-0 sm:p-0">
              <div className="px-5 pt-5">
                <Tabs
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: 'partners', label: 'По партнёрам' },
                    { value: 'products', label: 'По товарам' },
                  ]}
                />
              </div>
              {tab === 'partners' ? (
                !data.byPartner.length ? (
                  <Empty title="Нет данных за период" />
                ) : (
                  <Table className="mt-3">
                    <thead>
                      <tr>
                        <Th className="pl-5">Партнёр</Th>
                        <Th className="text-right">Заказов</Th>
                        <Th className="text-right">Сумма</Th>
                        <Th className="text-right">Оплачено</Th>
                        <Th className="pr-5 text-right">Долг</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPartner.map((p) => (
                        <tr key={p.partnerId}>
                          <Td className="pl-5 font-semibold">
                            <Link href={`/partners/${p.partnerId}`} className="hover:text-mango">
                              {p.name}
                            </Link>
                          </Td>
                          <Td className="text-right">{p.orders}</Td>
                          <Td className="text-right tabular-nums">{fmtMoney(p.total)}</Td>
                          <Td className="text-right tabular-nums">{fmtMoney(p.paid)}</Td>
                          <Td className={cx('pr-5 text-right font-semibold tabular-nums', p.debt > 0 && 'text-coffee')}>
                            {fmtMoney(p.debt)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )
              ) : !data.byProduct.length ? (
                <Empty title="Нет данных за период" />
              ) : (
                <Table className="mt-3">
                  <thead>
                    <tr>
                      <Th className="pl-5">Товар</Th>
                      <Th className="text-right">Количество</Th>
                      <Th className="pr-5 text-right">Сумма</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byProduct.map((p) => (
                      <tr key={p.productId}>
                        <Td className="pl-5 font-semibold">{p.name}</Td>
                        <Td className="text-right tabular-nums">
                          {fmtQty(p.qty)} {p.unit}
                        </Td>
                        <Td className="pr-5 text-right tabular-nums">{fmtMoney(p.total)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card>
              <SectionTitle>Задолженность сейчас</SectionTitle>
              <p className="-mt-2 mb-3 text-xs text-muted">Одобренные, но не оплаченные заказы — за всё время</p>
              {debts.loading && !debts.data ? (
                <Loading />
              ) : debts.error ? (
                <Note tone="red">{debts.error}</Note>
              ) : !debts.data?.length ? (
                <Empty title="Долгов нет" />
              ) : (
                <>
                  <ul className="divide-y divide-line/60">
                    {debts.data.map((d) => (
                      <li key={d.orderId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div>
                          <Link href={`/orders/${d.orderId}`} className="font-semibold hover:text-mango">
                            №{d.number} · {d.partner}
                          </Link>
                          <div className="text-xs text-muted">доставка {fmtDate(d.deliveryDate)}</div>
                        </div>
                        <span className="font-bold whitespace-nowrap text-coffee tabular-nums">{fmtMoney(d.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-bold">
                    <span>Итого</span>
                    <span className="text-coffee">{fmtMoney(debts.data.reduce((a, d) => a + d.total, 0))}</span>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <Card className={cx(accent && 'border-mango/30 bg-mango text-white')}>
      <div className={cx('text-sm', accent ? 'text-white/80' : 'text-muted')}>{label}</div>
      <div className={cx('mt-1 text-2xl font-bold tabular-nums', warn && 'text-coffee')}>{value}</div>
    </Card>
  );
}

/** Простая столбчатая диаграмма на CSS: все дни периода (до 62), пустые — нулевые. */
function DayChart({ days, from, to }: { days: SalesReport['byDay']; from: string; to: string }) {
  const series = useMemo(() => {
    const map = new Map(days.map((d) => [d.date, d]));
    const out: { date: string; total: number; orders: number }[] = [];
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    const span = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (span < 0 || span > 62) return days.map((d) => ({ ...d }));
    for (let i = 0; i <= span; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const v = map.get(key);
      out.push({ date: key, total: v?.total ?? 0, orders: v?.orders ?? 0 });
    }
    return out;
  }, [days, from, to]);

  const max = Math.max(1, ...series.map((d) => d.total));
  if (!series.some((d) => d.total > 0))
    return <Empty title="Продаж за период нет" icon={<ChartColumn className="h-6 w-6" />} />;

  return (
    <div className="overflow-x-auto">
      <div className="flex h-56 items-end gap-1" style={{ minWidth: series.length * 22 }}>
        {series.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-xl bg-cambodia px-2.5 py-1.5 text-xs whitespace-nowrap text-oat shadow-lg group-hover:block">
              {fmtDate(d.date)}: <b>{fmtMoney(d.total)}</b> · {d.orders} зак.
            </div>
            <div
              className={cx('w-full max-w-10 rounded-t-lg transition', d.total ? 'bg-mango group-hover:bg-mango-dark' : 'bg-line')}
              style={{ height: d.total ? `${Math.max(3, (d.total / max) * 100)}%` : 2 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 border-t border-line pt-1.5" style={{ minWidth: series.length * 22 }}>
        {series.map((d, i) => (
          <div key={d.date} className="flex-1 text-center text-[10px] text-muted">
            {series.length <= 16 || i % Math.ceil(series.length / 12) === 0 ? d.date.slice(8, 10) + '.' + d.date.slice(5, 7) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
