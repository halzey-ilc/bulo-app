'use client';

import { ArrowLeft, CheckCheck, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { DownloadButton } from '@/components/common';
import { useToast } from '@/components/toast';
import { Button, Card, Chip, Loading, Note, StatusChip } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { SheetDetail } from '@/lib/types';

function SheetInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const me = useMe();
  const toast = useToast();
  const { data: s, loading, error, reload } = useLoad(() => api.get<SheetDetail>(`/production/sheets/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const canReady = ['ADMIN', 'MANAGER', 'WORKSHOP'].includes(me.role);

  useEffect(() => {
    if (s && sp.get('print') === '1') setTimeout(() => window.print(), 400);
  }, [s, sp]);

  if (loading && !s) return <Loading />;
  if (error || !s) return <Note tone="red">{error ?? 'Накладная не найдена'}</Note>;

  const inProd = s.orders.filter((o) => o.status === 'IN_PRODUCTION');

  const markReady = async (ids: string[]) => {
    setBusy(ids.length > 1 ? 'all' : ids[0]);
    let ok = 0;
    for (const oid of ids) {
      try {
        await api.post(`/orders/${oid}/status`, { status: 'READY' });
        ok++;
      } catch (e) {
        toast.error(e);
      }
    }
    if (ok) toast.success(ok > 1 ? `Готово: ${ok} заказов` : 'Заказ готов к отгрузке');
    setBusy(null);
    reload();
  };

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/production" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-cambodia">
          <ArrowLeft className="h-4 w-4" /> Производство
        </Link>
        <div className="flex flex-wrap gap-2">
          <DownloadButton path={`/production/sheets/${s.id}/xlsx`} filename={`svodnaya-${s.number}.xlsx`}>
            Excel
          </DownloadButton>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Печать
          </Button>
        </div>
      </div>

      {/* Печатная форма */}
      <Card className="print-plain mx-auto max-w-[210mm] p-8 sm:p-10">
        <div className="flex items-start justify-between gap-6 border-b-2 border-cambodia pb-5">
          <div>
            <div className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Сводная накладная на производство</div>
            <h1 className="mt-1 text-3xl font-bold">
              №{s.number} на {fmtDate(s.date)}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              {s.isSupplement && <Chip className="bg-mango text-white">ДОЗАКАЗ</Chip>}
              Сформирована {fmtDateTime(s.createdAt)} · заказов: {s.orders.length}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bulo-logo.svg" alt="BULO" className="h-14 w-auto" />
        </div>

        <div className="mt-6 space-y-6">
          {s.groups.map((g) => (
            <section key={g.area} className="break-inside-avoid">
              <h2 className="mb-2 rounded-xl bg-oat px-3 py-2 text-lg font-bold">{g.area}</h2>
              <table className="w-full border-collapse">
                <tbody>
                  {g.items.map((it, i) => (
                    <tr key={it.productId ?? it.name} className="border-b border-line">
                      <td className="w-8 py-2.5 pl-1 text-sm text-muted">{i + 1}</td>
                      <td className="py-2.5 text-base">
                        {it.name}
                        {it.category && <span className="ml-2 text-xs text-muted">{it.category}</span>}
                      </td>
                      <td className="w-40 py-2.5 pr-1 text-right text-2xl font-bold tabular-nums">
                        {fmtQty(it.qty)} <span className="text-base font-semibold text-muted">{it.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <section className="mt-8 break-inside-avoid">
          <h3 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Заказы в накладной</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {s.orders.map((o) => (
                <tr key={o.id} className="border-b border-line/70">
                  <td className="py-1.5 font-semibold">№{o.number}</td>
                  <td className="py-1.5">{o.partner}</td>
                  <td className="py-1.5 text-muted">{o.deliveryAddress}</td>
                  <td className="no-print py-1.5 text-right">
                    <StatusChip status={o.status} />
                  </td>
                  {canReady && (
                    <td className="no-print py-1.5 pl-2 text-right">
                      {o.status === 'IN_PRODUCTION' && (
                        <Button size="sm" loading={busy === o.id} onClick={() => markReady([o.id])}>
                          Готов
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="no-print mt-2 text-xs text-muted">
            Сумма заказов: {fmtMoney(s.orders.reduce((a, o) => a + o.total, 0))}
          </p>
        </section>

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div>
            Выдал: <span className="inline-block w-40 border-b border-cambodia" />
          </div>
          <div>
            Принял (цех): <span className="inline-block w-40 border-b border-cambodia" />
          </div>
        </div>
      </Card>

      {canReady && inProd.length > 1 && (
        <div className="no-print mx-auto mt-5 flex max-w-[210mm] justify-end">
          <Button variant="dark" loading={busy === 'all'} onClick={() => markReady(inProd.map((o) => o.id))}>
            <CheckCheck className="h-4 w-4" /> Все заказы готовы ({inProd.length})
          </Button>
        </div>
      )}
    </>
  );
}

export default function SheetPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SheetInner />
    </Suspense>
  );
}
