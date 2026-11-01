'use client';

import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDebounced, useLoad } from '@/lib/hooks';
import type { Counterparty, PriceType } from '@/lib/types';
import { Field, Input, Select, Spinner, cx } from './ui';

export function usePriceTypes() {
  return useLoad(() => api.get<PriceType[]>('/admin/catalog/price-types'), []);
}

export function PriceTypeSelect({
  value,
  onChange,
  priceTypes,
}: {
  value: string;
  onChange: (v: string) => void;
  priceTypes: PriceType[];
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">По умолчанию ({priceTypes.find((p) => p.isDefault)?.name ?? 'базовая'})</option>
      {priceTypes.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.isDefault ? ' (по умолчанию)' : ''}
        </option>
      ))}
    </Select>
  );
}

/** Поиск контрагента 1С по названию/ИНН и выбор. */
export function CounterpartyPicker({
  value,
  onChange,
  initialSearch = '',
}: {
  value: string;
  onChange: (oneCId: string) => void;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const q = useDebounced(search, 350);
  const { data, loading, error } = useLoad(
    () => api.get<Counterparty[]>('/admin/onec/counterparties', { search: q.trim() || undefined }),
    [q],
  );

  return (
    <Field label="Контрагент в 1С" hint="Свяжите партнёра с контрагентом из 1С — документы будут выгружаться на него">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Название или ИНН" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-line">
        <button
          type="button"
          onClick={() => onChange('')}
          className={cx('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-oat', !value && 'bg-oat font-semibold')}
        >
          Не связывать сейчас {!value && <Check className="h-4 w-4 text-mango" />}
        </button>
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
            <Spinner className="h-4 w-4" /> Поиск…
          </div>
        )}
        {error && <div className="px-3 py-2 text-xs text-coffee">{error}</div>}
        {!loading && data?.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted">Ничего не найдено. Контрагенты приходят из 1С при обмене.</div>
        )}
        {data?.map((c) => (
          <button
            type="button"
            key={c.oneCId}
            onClick={() => onChange(c.oneCId)}
            className={cx(
              'flex w-full items-center justify-between gap-3 border-t border-line/60 px-3 py-2 text-left text-sm hover:bg-oat',
              value === c.oneCId && 'bg-mango-soft/50',
            )}
          >
            <span>
              <span className="font-semibold">{c.name}</span>
              <span className="block text-xs text-muted">
                ИНН {c.inn ?? '—'} · код {c.oneCId}
              </span>
            </span>
            {value === c.oneCId && <Check className="h-4 w-4 shrink-0 text-mango" />}
          </button>
        ))}
      </div>
      {value && !data?.some((c) => c.oneCId === value) && (
        <div className="mt-1 text-xs text-muted">Связан с кодом 1С: {value}</div>
      )}
    </Field>
  );
}
