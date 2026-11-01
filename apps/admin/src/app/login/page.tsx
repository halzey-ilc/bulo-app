'use client';

import { KeyRound, MessageSquareText, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Field, Input, Note, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { homeFor, STAFF_PANEL_ROLES } from '@/lib/nav';
import type { User } from '@/lib/types';

type Mode = 'password' | 'sms';

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('996')) return '+' + digits;
  if (digits.startsWith('0')) return '+996' + digits.slice(1);
  if (digits.length === 9) return '+996' + digits;
  return '+' + digits;
}

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('password');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+996 ');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notStaff, setNotStaff] = useState(false);

  useEffect(() => {
    if (!loading && user && STAFF_PANEL_ROLES.includes(user.role)) router.replace(homeFor(user.role));
  }, [loading, user, router]);

  const finish = (res: { token: string; user: User }) => {
    if (!STAFF_PANEL_ROLES.includes(res.user.role)) {
      setNotStaff(true);
      return;
    }
    login(res.token, res.user);
    router.replace(homeFor(res.user.role));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotStaff(false);
    try {
      finish(await api.post<{ token: string; user: User }>('/auth/login', { login: loginName.trim(), password }));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    setBusy(true);
    setNotStaff(false);
    try {
      const res = await api.post<{ devCode?: string }>('/auth/otp', { phone: normalizePhone(phone), purpose: 'LOGIN' });
      setCodeSent(true);
      setDevCode(res?.devCode ?? null);
      toast.success('Код отправлен по СМС');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeSent) return sendCode();
    setBusy(true);
    try {
      finish(await api.post<{ token: string; user: User }>('/auth/login/otp', { phone: normalizePhone(phone), code: code.trim() }));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-cambodia p-12 text-oat lg:flex lg:flex-col lg:justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bulo-logo.svg" alt="BULO" className="h-16 w-auto self-start" />
        <div>
          <div className="text-5xl leading-tight font-bold">
            Taste at
            <br />
            Your Pace
          </div>
          <p className="mt-5 max-w-md text-oat/70">
            Панель управления заказами пекарни: партнёры, производство, накладные, отчёты и обмен с 1С.
          </p>
        </div>
        <div className="text-xs text-oat/40">© BULO, Бишкек</div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-mango/25 blur-2xl" />
        <div className="pointer-events-none absolute top-20 -right-10 h-40 w-40 rounded-full bg-butter/15" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bulo-logo.svg" alt="BULO" className="mx-auto mb-8 h-14 lg:hidden" />
          <h1 className="text-3xl font-bold">Вход в панель</h1>
          <p className="mt-2 text-sm text-muted">Для сотрудников BULO: администратор, менеджер, бухгалтер, цех, курьер.</p>

          <div className="mt-7 grid grid-cols-2 gap-1 rounded-2xl bg-oat-dark/70 p-1">
            {(
              [
                ['password', 'Логин и пароль', KeyRound],
                ['sms', 'Телефон и СМС', Smartphone],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cx(
                  'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition',
                  mode === m ? 'bg-white shadow-sm' : 'text-cambodia/60',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-line/70 bg-white p-6 shadow-sm">
            {mode === 'password' ? (
              <form onSubmit={submitPassword} className="space-y-4">
                <Field label="Логин">
                  <Input value={loginName} onChange={(e) => setLoginName(e.target.value)} autoComplete="username" autoFocus />
                </Field>
                <Field label="Пароль">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
                <Button type="submit" className="w-full" loading={busy} disabled={!loginName || !password}>
                  Войти
                </Button>
              </form>
            ) : (
              <form onSubmit={submitCode} className="space-y-4">
                <Field label="Номер телефона">
                  <Input
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setCodeSent(false);
                      setDevCode(null);
                    }}
                    inputMode="tel"
                    placeholder="+996 700 123 456"
                  />
                </Field>
                {codeSent && (
                  <Field label="Код из СМС">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                      autoFocus
                      maxLength={6}
                      className="text-center text-lg tracking-[0.5em]"
                    />
                  </Field>
                )}
                {devCode && (
                  <Note tone="blue" icon={<MessageSquareText className="h-4 w-4" />}>
                    Режим разработки: код <b className="font-mono text-base">{devCode}</b>
                  </Note>
                )}
                <Button type="submit" className="w-full" loading={busy} disabled={phone.replace(/\D/g, '').length < 9}>
                  {codeSent ? 'Войти' : 'Получить код'}
                </Button>
                {codeSent && (
                  <button type="button" onClick={sendCode} className="w-full text-center text-xs font-semibold text-mango">
                    Отправить код ещё раз
                  </button>
                )}
              </form>
            )}
            {notStaff && (
              <Note tone="yellow" className="mt-4">
                Этот аккаунт — партнёр или гость. Оформляйте заказы в мобильном приложении BULO, веб-панель только для
                сотрудников.
              </Note>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
