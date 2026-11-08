'use client';

import {
  ArrowRight,
  CircleAlert,
  ClipboardCheck,
  Factory,
  PackageCheck,
  Sparkles,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { Card, Loading, Note, PageHeader, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDate, fmtMoney, plural } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { Dashboard } from '@/lib/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function DashboardPage() {
  const me = useMe();
  const { data, loading, error } = useLoad(() => api.get<Dashboard>('/admin/dashboard'), []);

  const cards = data
    ? [
        {
          href: '/orders?status=NEW',
          label: 'Новые заказы',
          value: data.newOrders,
          hint: 'ещё не в цехе',
          icon: Sparkles,
          tone: 'bg-ice',
          accent: data.newOrders > 0,
        },
        {
          href: '/orders?paid=false',
          label: 'Не оплачены',
          value: data.awaitingPayment.count,
          hint: fmtMoney(data.awaitingPayment.total),
          icon: Wallet,
          tone: 'bg-butter',
        },
        { href: '/orders?paid=true', label: 'Оплачены', value: data.paid, hint: 'ещё не доставлены', icon: ClipboardCheck, tone: 'bg-cambodia-soft' },
        { href: '/orders?status=IN_PRODUCTION', label: 'В производстве', value: data.inProduction, hint: 'в цехе', icon: Factory, tone: 'bg-mango-soft' },
        { href: '/orders?status=READY', label: 'Готовы к отгрузке', value: data.ready, hint: 'ждут курьера', icon: PackageCheck, tone: 'bg-[#e4f1d0]' },
        {
          href: `/orders?dateFrom=${data.today}&dateTo=${data.today}`,
          label: 'Доставки сегодня',
          value: data.todayDeliveries.count,
          hint: fmtMoney(data.todayDeliveries.total),
          icon: Truck,
          tone: 'bg-[#e9e2f6]',
        },
        {
          href: '/partners?status=PENDING',
          label: 'Заявки партнёров',
          value: data.pendingPartners,
          hint: 'на рассмотрении',
          icon: Store,
          tone: 'bg-butter',
          accent: data.pendingPartners > 0,
        },
        ...(me.role !== 'MANAGER'
          ? [
              {
                href: '/onec',
                label: 'Ошибки 1С',
                value: data.onecErrors,
                hint: data.onecErrors ? 'нужно проверить' : 'всё в порядке',
                icon: CircleAlert,
                tone: data.onecErrors ? 'bg-coffee-soft' : 'bg-cambodia-soft',
                accent: data.onecErrors > 0,
              },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me.name.split(' ')[0]}`}
        subtitle={data ? `Сводка на ${fmtDate(data.today)}` : 'Сводка'}
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Note tone="red">{error}</Note>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.label} href={c.href} className="group">
                  <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className={cx('rounded-2xl p-2.5', c.tone)}>
                        <Icon className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      {c.accent && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-mango" />}
                    </div>
                    <div className="mt-4 text-3xl font-bold tabular-nums">{c.value}</div>
                    <div className="mt-1 font-semibold">{c.label}</div>
                    <div className="mt-0.5 flex items-center justify-between text-sm text-muted">
                      <span>{c.hint}</span>
                      <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
          {data && (() => {
            const active = data.newOrders + data.inProduction + data.ready;
            return (
              <p className="mt-6 text-sm text-muted">
                В работе {active} {plural(active, 'заказ', 'заказа', 'заказов')}. Нажмите на карточку, чтобы открыть список.
              </p>
            );
          })()}
        </>
      )}
    </>
  );
}
