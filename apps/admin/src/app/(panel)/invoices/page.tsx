'use client';

import { FileText, Printer, Truck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DownloadButton } from '@/components/common';
import { Button, Card, Empty, Input, Loading, Note, PageHeader, StatusChip, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtMoney, fmtPhone, fmtQty, isoDay, plural } from '@/lib/format';
import type { Invoice, Settings } from '@/lib/types';

export default function InvoicesPage() {
  const me = useMe();
  const [date, setDate] = useState(isoDay(1));
  const { data, loading, error } = useLoad(() => api.get<Invoice[]>('/invoices', { date }), [date]);
  const settings = useLoad(() => api.get<Settings>('/info').catch(() => null), []);
  const seller = settings.data;
  const list = data ?? [];
  const total = list.reduce((a, i) => a + i.total, 0);

  return (
    <>
      <PageHeader
        title="Накладные на отгрузку"
        subtitle="По одной на заказ, отсортированы по адресу — удобно для маршрута"
        actions={
          <>
            <Button variant={date === isoDay(0) ? 'dark' : 'secondary'} size="sm" onClick={() => setDate(isoDay(0))}>
              Сегодня
            </Button>
            <Button variant={date === isoDay(1) ? 'dark' : 'secondary'} size="sm" onClick={() => setDate(isoDay(1))}>
              Завтра
            </Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
          </>
        }
      />

      {me.role === 'COURIER' && (
        <Note tone="blue" icon={<Truck className="h-4 w-4" />} className="no-print mb-4">
          Процесс работы курьера дорабатывается. Отмечать «Передан» и «Доставлен» можно в разделе{' '}
          <Link href="/orders" className="font-semibold underline">
            Заказы
          </Link>
          .
        </Note>
      )}

      <Card className="no-print mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-lg font-bold">
            {list.length} {plural(list.length, 'накладная', 'накладные', 'накладных')} на {fmtDate(date)}
          </div>
          <div className="text-sm text-muted">на сумму {fmtMoney(total)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton path="/invoices/xlsx" query={{ date }} filename={`nakladnye-${date}.xlsx`} disabled={!list.length}>
            Excel
          </DownloadButton>
          <Button onClick={() => window.print()} disabled={!list.length}>
            <Printer className="h-4 w-4" /> Печать всех
          </Button>
        </div>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Note tone="red">{error}</Note>
      ) : !list.length ? (
        <Card>
          <Empty title="Накладных нет" icon={<FileText className="h-6 w-6" />}>
            На эту дату нет заказов к отгрузке.
          </Empty>
        </Card>
      ) : (
        <div className={cx('space-y-6', loading && 'opacity-60')}>
          {list.map((inv, idx) => (
            <Card key={inv.orderId} className="print-plain print-page mx-auto max-w-[210mm] p-8 sm:p-10">
              <div className="flex items-start justify-between gap-6 border-b-2 border-cambodia pb-4">
                <div>
                  <div className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Расходная накладная</div>
                  <h2 className="mt-1 text-2xl font-bold">
                    № {inv.number} от {fmtDate(inv.date)}
                  </h2>
                  <div className="no-print mt-2 flex items-center gap-2 text-xs text-muted">
                    {idx + 1} из {list.length} · <StatusChip status={inv.status} />
                    <Link href={`/orders/${inv.orderId}`} className="font-semibold text-mango">
                      открыть заказ
                    </Link>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/bulo-logo.svg" alt="BULO" className="h-12 w-auto" />
              </div>

              <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2 print:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold tracking-wide text-muted uppercase">Поставщик</div>
                  <div className="mt-1 font-bold">{seller?.companyName || 'BULO'}</div>
                  {seller?.address && <div>{seller.address}</div>}
                  {seller?.phone && <div>{seller.phone}</div>}
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wide text-muted uppercase">Покупатель</div>
                  <div className="mt-1 font-bold">{inv.partner.name}</div>
                  <div>ИНН: {inv.partner.inn ?? '—'}</div>
                  <div>
                    {inv.partner.contactName} {inv.partner.phone && `· ${fmtPhone(inv.partner.phone)}`}
                  </div>
                </div>
                <div className="sm:col-span-2 print:col-span-2">
                  <div className="text-xs font-semibold tracking-wide text-muted uppercase">Адрес доставки</div>
                  <div className="mt-1 font-semibold">{inv.deliveryAddress ?? '—'}</div>
                </div>
              </div>

              <table className="mt-5 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-cambodia/40 text-left text-xs text-muted uppercase">
                    <th className="w-8 py-2">№</th>
                    <th className="py-2">Товар</th>
                    <th className="py-2">Ед.</th>
                    <th className="py-2 text-right">Кол-во</th>
                    <th className="py-2 text-right">Цена</th>
                    <th className="py-2 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((it, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2">{i + 1}</td>
                      <td className="py-2">{it.name}</td>
                      <td className="py-2">{it.unit}</td>
                      <td className="py-2 text-right tabular-nums">{fmtQty(it.qty)}</td>
                      <td className="py-2 text-right whitespace-nowrap tabular-nums">{fmtMoney(it.price)}</td>
                      <td className="py-2 text-right whitespace-nowrap tabular-nums">{fmtMoney(it.sum)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="pt-3 text-right font-bold">
                      Итого:
                    </td>
                    <td className="pt-3 text-right text-lg font-bold whitespace-nowrap tabular-nums">{fmtMoney(inv.total)}</td>
                  </tr>
                </tfoot>
              </table>
              {inv.comment && <p className="mt-3 text-sm">Комментарий: {inv.comment}</p>}

              <div className="mt-14 grid grid-cols-2 gap-10 text-sm">
                <div>
                  Отпустил: <span className="inline-block w-36 border-b border-cambodia" />
                  <div className="mt-1 pl-20 text-[10px] text-muted">подпись</div>
                </div>
                <div>
                  Получил: <span className="inline-block w-36 border-b border-cambodia" />
                  <div className="mt-1 pl-20 text-[10px] text-muted">подпись</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
