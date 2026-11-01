'use client';

import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, CircleCheck, FileSpreadsheet, RotateCw, Server } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DownloadButton } from '@/components/common';
import { useToast } from '@/components/toast';
import { Button, Card, Chip, Empty, Field, Input, Loading, Note, PageHeader, SectionTitle, Select, Table, Tabs, Td, Th, Toggle, cx } from '@/components/ui';
import { api, API_URL } from '@/lib/api';
import { fmtDate, fmtDateTime, isoDay, monthStart } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { OneCDocType, OneCDocument, OneCLog, OneCStatus } from '@/lib/types';

const TYPE_LABELS: Record<OneCDocType, string> = {
  CUSTOMER_ORDER: 'Заказ клиента',
  PRODUCTION: 'Заказ на производство',
  SALE: 'Реализация',
};

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'ожидает', cls: 'bg-butter text-[#6b5300]' },
  SENT: { label: 'выгружен', cls: 'bg-cambodia-soft text-cambodia' },
  ERROR: { label: 'ошибка', cls: 'bg-coffee-soft text-coffee' },
};

const ENDPOINTS: { method: string; path: string; text: string }[] = [
  { method: 'POST', path: '/onec/import/nomenclature', text: 'Номенклатура: { groups: [{id, name}], items: [{id, name, groupId, unit?, multiplicity?, description?, weight?, shelfLife?}] }' },
  { method: 'POST', path: '/onec/import/price-types', text: 'Типы цен' },
  { method: 'POST', path: '/onec/import/prices', text: 'Цены номенклатуры по типам цен' },
  { method: 'POST', path: '/onec/import/counterparties', text: 'Контрагенты: { items: [...] } — для сопоставления партнёров' },
  { method: 'GET', path: '/onec/outbox?limit=50', text: 'Очередь документов для 1С: заказы клиентов, заказы на производство, реализации' },
  { method: 'POST', path: '/onec/outbox/:id/ack', text: 'Подтверждение: { ok: true, number: "ЗК-0001" } или { ok: false, error: "…" }' },
];

export default function OneCPage() {
  const toast = useToast();
  const status = useLoad(() => api.get<OneCStatus>('/admin/onec/status'), []);
  const [docStatus, setDocStatus] = useState('');
  const [docType, setDocType] = useState('');
  const docs = useLoad(
    () => api.get<OneCDocument[]>('/admin/onec/documents', { status: docStatus || undefined, type: docType || undefined }),
    [docStatus, docType],
  );
  const log = useLoad(() => api.get<OneCLog[]>('/admin/onec/log'), []);
  const [tab, setTab] = useState<'docs' | 'log'>('docs');
  const [retrying, setRetrying] = useState<string | null>(null);

  // экспорт
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(0));
  const [expType, setExpType] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const [markSent, setMarkSent] = useState(false);

  const retry = async (d: OneCDocument) => {
    setRetrying(d.id);
    try {
      await api.post(`/admin/onec/documents/${d.id}/retry`);
      toast.success('Документ снова в очереди');
      docs.reload();
      status.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setRetrying(null);
    }
  };

  const s = status.data;

  return (
    <>
      <PageHeader title="Обмен с 1С" subtitle="Документы, которые уходят в 1С, и данные, которые приходят из неё" />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ожидают выгрузки" value={s?.pending} tone="bg-butter" />
        <StatCard label="Ошибки" value={s?.errors} tone={s?.errors ? 'bg-coffee-soft text-coffee' : 'bg-cambodia-soft'} />
        <StatCard label="Выгружено" value={s?.sent} tone="bg-cambodia-soft" />
        <Card>
          <div className="space-y-2 text-xs">
            <LastLine icon={<ArrowDownToLine className="h-3.5 w-3.5" />} label="Последний приём" entry={s?.lastIn ?? null} />
            <LastLine icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} label="Последняя выгрузка" entry={s?.lastOut ?? null} />
          </div>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Server className="h-4 w-4 text-mango" /> Режим 1: автоматический обмен
            </span>
          </SectionTitle>
          <p className="text-sm text-cambodia/80">
            1С сама обращается к API BULO по расписанию: забирает очередь документов и подтверждает их, а также отправляет
            номенклатуру, цены и контрагентов. Каждый запрос — с заголовком <code className="rounded bg-oat px-1">X-Api-Key</code>.
          </p>
          <div className="mt-3">
            {s?.apiKeyConfigured === false ? (
              <Note tone="red" icon={<CircleAlert className="h-4 w-4" />}>
                Ключ ONEC_API_KEY на сервере не задан — автоматический обмен выключен.
              </Note>
            ) : (
              <Note tone="green" icon={<CircleCheck className="h-4 w-4" />}>
                Ключ API настроен. Передайте его программисту 1С отдельно (он хранится в настройках сервера).
              </Note>
            )}
          </div>
          <details className="mt-4 rounded-2xl border border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Для программиста 1С: список методов</summary>
            <div className="border-t border-line px-4 py-3">
              <div className="mb-2 text-xs text-muted">
                Базовый адрес: <code className="rounded bg-oat px-1">{API_URL}</code>
              </div>
              <ul className="space-y-2.5">
                {ENDPOINTS.map((e) => (
                  <li key={e.path} className="text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
                          e.method === 'GET' ? 'bg-ice text-[#0b4a7d]' : 'bg-mango-soft text-mango-dark',
                        )}
                      >
                        {e.method}
                      </span>
                      <code className="font-mono font-semibold">{e.path}</code>
                    </div>
                    <div className="mt-0.5 text-muted">{e.text}</div>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </Card>

        <Card>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-mango" /> Режим 2: выгрузка в Excel
            </span>
          </SectionTitle>
          <p className="mb-4 text-sm text-cambodia/80">
            Если автоматический обмен ещё не настроен — скачайте документы файлом и загрузите их в 1С вручную (обработкой
            загрузки из Excel).
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="С">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="По">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Тип документов">
              <Select value={expType} onChange={(e) => setExpType(e.target.value)}>
                <option value="">Все типы</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <Toggle checked={onlyPending} onChange={setOnlyPending} label="Только ещё не выгруженные" />
            <Toggle checked={markSent} onChange={setMarkSent} label="Отметить как выгруженные после скачивания" />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {markSent ? 'Документы получат статус «выгружен» и не попадут в следующую выгрузку.' : 'Статусы документов не изменятся.'}
            </span>
            <DownloadButton
              variant="primary"
              path="/admin/onec/export.xlsx"
              query={{
                from,
                to,
                type: expType || undefined,
                onlyPending: onlyPending ? 'true' : undefined,
                markSent: markSent ? 'true' : undefined,
              }}
              filename={`1c-export-${from}-${to}.xlsx`}
            >
              Скачать Excel
            </DownloadButton>
          </div>
        </Card>
      </div>

      <Card className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'docs', label: 'Документы', count: s?.errors },
              { value: 'log', label: 'Журнал обмена' },
            ]}
          />
          {tab === 'docs' && (
            <div className="flex gap-2">
              <Select value={docStatus} onChange={(e) => setDocStatus(e.target.value)} className="w-40">
                <option value="">Все статусы</option>
                <option value="PENDING">Ожидают</option>
                <option value="SENT">Выгружены</option>
                <option value="ERROR">Ошибки</option>
              </Select>
              <Select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-52">
                <option value="">Все типы</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {tab === 'docs' ? (
          docs.loading && !docs.data ? (
            <Loading />
          ) : docs.error ? (
            <div className="p-5">
              <Note tone="red">{docs.error}</Note>
            </div>
          ) : !docs.data?.length ? (
            <Empty title="Документов нет" />
          ) : (
            <Table className="mt-3">
              <thead>
                <tr>
                  <Th className="pl-5">Тип</Th>
                  <Th>Основание</Th>
                  <Th>Создан</Th>
                  <Th>Статус</Th>
                  <Th>№ в 1С / ошибка</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {docs.data.map((d) => {
                  const st = STATUS_CHIP[d.status] ?? { label: d.status, cls: '' };
                  return (
                    <tr key={d.id}>
                      <Td className="pl-5 font-semibold">{TYPE_LABELS[d.type] ?? d.type}</Td>
                      <Td>
                        {d.order ? (
                          <Link href={`/orders/${d.order.id}`} className="hover:text-mango">
                            Заказ №{d.order.number}
                          </Link>
                        ) : d.productionSheet ? (
                          <Link href={`/production/sheets/${d.productionSheet.id}`} className="hover:text-mango">
                            Сводная №{d.productionSheet.number}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="text-xs whitespace-nowrap text-muted">{fmtDateTime(d.createdAt)}</Td>
                      <Td>
                        <Chip className={st.cls}>{st.label}</Chip>
                      </Td>
                      <Td className="max-w-[280px] text-xs">
                        {d.lastError ? (
                          <span className="text-coffee">{d.lastError}</span>
                        ) : d.oneCNumber ? (
                          <span className="font-semibold">{d.oneCNumber}</span>
                        ) : (
                          <span className="text-muted">{d.attempts ? `попыток: ${d.attempts}` : '—'}</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {d.status === 'ERROR' && (
                          <Button size="sm" variant="secondary" loading={retrying === d.id} onClick={() => retry(d)}>
                            <RotateCw className="h-3.5 w-3.5" /> Повторить
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )
        ) : log.loading && !log.data ? (
          <Loading />
        ) : !log.data?.length ? (
          <Empty title="Обменов ещё не было" />
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th className="pl-5">Когда</Th>
                <Th>Направление</Th>
                <Th>Что</Th>
                <Th>Кол-во</Th>
                <Th>Результат</Th>
              </tr>
            </thead>
            <tbody>
              {log.data.map((l) => (
                <tr key={l.id}>
                  <Td className="pl-5 text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
                  <Td>
                    {l.direction === 'IN' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        <ArrowDownToLine className="h-3.5 w-3.5" /> из 1С
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        <ArrowUpFromLine className="h-3.5 w-3.5" /> в 1С
                      </span>
                    )}
                  </Td>
                  <Td>{TYPE_LABELS[l.entity as OneCDocType] ?? l.entity}</Td>
                  <Td>{l.count ?? '—'}</Td>
                  <Td className="text-xs">
                    {l.ok ? <span className="font-semibold text-cambodia">успешно</span> : <span className="text-coffee">ошибка</span>}
                    {l.message && <span className="ml-2 text-muted">{l.message}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Показаны последние 200 документов. Сегодня {fmtDate(isoDay(0))}.</p>
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className={cx('mt-2 inline-flex min-w-12 justify-center rounded-2xl px-3 py-1 text-2xl font-bold tabular-nums', tone)}>
        {value ?? '…'}
      </div>
    </Card>
  );
}

function LastLine({ icon, label, entry }: { icon: React.ReactNode; label: string; entry: OneCLog | null }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-semibold">
        {icon} {label}
      </div>
      <div className="text-muted">
        {entry ? `${fmtDateTime(entry.createdAt)} · ${entry.ok ? 'ок' : 'ошибка'}` : 'ещё не было'}
      </div>
    </div>
  );
}
