'use client';

import { ROLE_LABELS } from '@bulo/shared';
import { ScrollText, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, Empty, Input, Loading, Note, PageHeader, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { AuditEntry } from '@/lib/types';

const ACTIONS: Record<string, string> = {
  'partner.approve': 'Одобрил партнёра',
  'partner.reject': 'Отклонил заявку партнёра',
  'partner.block': 'Заблокировал партнёра',
  'partner.unblock': 'Разблокировал партнёра',
  'partner.create': 'Создал партнёра',
  'partner.update': 'Изменил партнёра',
  'partner.register': 'Подал заявку партнёра',
  'user.create': 'Создал пользователя',
  'user.update': 'Изменил пользователя',
  'order.create': 'Создал заказ',
  'order.items': 'Изменил состав заказа',
  'order.approved': 'Одобрил заказ',
  'order.rejected': 'Отклонил заказ',
  'order.cancelled': 'Отменил заказ',
  'order.paid': 'Отметил оплату',
  'order.in_production': 'Передал в производство',
  'order.ready': 'Отметил готовность',
  'order.shipped': 'Передал курьеру',
  'order.delivered': 'Отметил доставку',
  'product.create': 'Создал товар',
  'product.update': 'Изменил товар',
  'product.prices': 'Изменил цены',
  'settings.update': 'Изменил настройки',
  'production.sheet': 'Сформировал сводную накладную',
};

const ENTITY: Record<string, string> = {
  Order: 'Заказ',
  Partner: 'Партнёр',
  User: 'Пользователь',
  Product: 'Товар',
  ProductionSheet: 'Сводная накладная',
  Settings: 'Настройки',
};

function entityLink(e: AuditEntry): string | null {
  if (!e.entityId) return null;
  if (e.entity === 'Order') return `/orders/${e.entityId}`;
  if (e.entity === 'Partner') return `/partners/${e.entityId}`;
  if (e.entity === 'ProductionSheet') return `/production/sheets/${e.entityId}`;
  return null;
}

function details(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object') continue;
    parts.push(`${k}: ${String(v)}`);
  }
  return parts.join(', ');
}

export default function AuditPage() {
  const { data, loading, error } = useLoad(() => api.get<AuditEntry[]>('/admin/audit'), []);
  const [search, setSearch] = useState('');
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter((e) =>
      [e.user?.name, ACTIONS[e.action] ?? e.action, ENTITY[e.entity] ?? e.entity, details(e.data)].join(' ').toLowerCase().includes(s),
    );
  }, [data, search]);

  return (
    <>
      <PageHeader
        title="Журнал действий"
        subtitle="Кто и что менял в системе"
        actions={
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      />
      <Card className="p-0 sm:p-0">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <div className="p-5">
            <Note tone="red">{error}</Note>
          </div>
        ) : !list.length ? (
          <Empty title="Записей нет" icon={<ScrollText className="h-6 w-6" />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="pl-5">Когда</Th>
                <Th>Кто</Th>
                <Th>Действие</Th>
                <Th>Объект</Th>
                <Th>Детали</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const href = entityLink(e);
                return (
                  <tr key={e.id}>
                    <Td className="pl-5 text-xs whitespace-nowrap text-muted">{fmtDateTime(e.createdAt)}</Td>
                    <Td>
                      <div className="font-semibold">{e.user?.name ?? 'Система'}</div>
                      {e.user && <div className="text-xs text-muted">{ROLE_LABELS[e.user.role]}</div>}
                    </Td>
                    <Td>{ACTIONS[e.action] ?? e.action}</Td>
                    <Td>
                      {href ? (
                        <Link href={href} className="font-semibold text-mango">
                          {ENTITY[e.entity] ?? e.entity}
                        </Link>
                      ) : (
                        ENTITY[e.entity] ?? e.entity
                      )}
                    </Td>
                    <Td className="max-w-[320px] truncate text-xs text-muted" title={details(e.data)}>
                      {details(e.data) || '—'}
                    </Td>
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
