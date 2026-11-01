'use client';

import { Clock, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, Field, Input, Loading, Note, PageHeader, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { Settings } from '@/lib/types';

type Form = Record<keyof Omit<Settings, 'updatedAt'>, string>;

const EMPTY: Form = {
  cutoffTime: '',
  minOrderSum: '',
  companyName: '',
  phone: '',
  email: '',
  address: '',
  workHours: '',
  instagram: '',
  whatsapp: '',
  telegram: '',
};

export default function SettingsPage() {
  const me = useMe();
  const toast = useToast();
  const readOnly = me.role !== 'ADMIN';
  const { data, loading, error, setData } = useLoad(() => api.get<Settings>('/admin/settings'), []);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      const next = { ...EMPTY };
      (Object.keys(EMPTY) as (keyof Form)[]).forEach((k) => (next[k] = data[k] === null || data[k] === undefined ? '' : String(data[k])));
      setF(next);
    }
  }, [data]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(f.cutoffTime);
  const sumOk = f.minOrderSum !== '' && !isNaN(Number(f.minOrderSum)) && Number(f.minOrderSum) >= 0;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.put<Settings>('/admin/settings', {
        cutoffTime: f.cutoffTime,
        minOrderSum: Number(f.minOrderSum),
        companyName: f.companyName,
        phone: f.phone,
        email: f.email,
        address: f.address,
        workHours: f.workHours,
        instagram: f.instagram,
        whatsapp: f.whatsapp,
        telegram: f.telegram,
      });
      if (res) setData(res);
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <Note tone="red">{error}</Note>;

  return (
    <>
      <PageHeader
        title="Настройки"
        subtitle={data?.updatedAt ? `Изменены ${fmtDateTime(data.updatedAt)}` : undefined}
        actions={
          !readOnly && (
            <Button onClick={save} loading={busy} disabled={!timeOk || !sumOk}>
              Сохранить
            </Button>
          )
        }
      />
      {readOnly && (
        <Note tone="blue" icon={<Lock className="h-4 w-4" />} className="mb-5">
          Режим просмотра. Менять настройки может только администратор.
        </Note>
      )}
      <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-mango" /> Приём заказов
            </span>
          </SectionTitle>
          <div className="space-y-4">
            <Field label="Время отсечки (ЧЧ:ММ)" hint="После этого времени заказ на завтра уже не принимается — только на послезавтра и позже">
              <Input value={f.cutoffTime} onChange={set('cutoffTime')} placeholder="16:00" className={!timeOk && f.cutoffTime ? 'border-coffee' : ''} />
            </Field>
            <Field label="Минимальная сумма заказа, сом">
              <Input value={f.minOrderSum} onChange={set('minOrderSum')} inputMode="numeric" />
            </Field>
          </div>
        </Card>
        <Card>
          <SectionTitle>Компания</SectionTitle>
          <div className="space-y-4">
            <Field label="Название (для накладных)">
              <Input value={f.companyName} onChange={set('companyName')} />
            </Field>
            <Field label="Адрес">
              <Input value={f.address} onChange={set('address')} />
            </Field>
            <Field label="Часы работы">
              <Input value={f.workHours} onChange={set('workHours')} />
            </Field>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle>Контакты (показываются в приложении)</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Телефон">
              <Input value={f.phone} onChange={set('phone')} />
            </Field>
            <Field label="Email">
              <Input value={f.email} onChange={set('email')} />
            </Field>
            <Field label="Instagram">
              <Input value={f.instagram} onChange={set('instagram')} placeholder="bulo.kg" />
            </Field>
            <Field label="WhatsApp">
              <Input value={f.whatsapp} onChange={set('whatsapp')} placeholder="+996…" />
            </Field>
            <Field label="Telegram">
              <Input value={f.telegram} onChange={set('telegram')} placeholder="@bulo" />
            </Field>
          </div>
        </Card>
      </fieldset>
    </>
  );
}
