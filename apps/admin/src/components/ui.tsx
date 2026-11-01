'use client';

import { ORDER_STATUS_LABELS, PARTNER_STATUS_LABELS } from '@bulo/shared';
import type { OrderStatus, PartnerStatus } from '@bulo/shared';
import { LoaderCircle, X } from 'lucide-react';
import { forwardRef, useEffect } from 'react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ---------- Кнопки ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-mango text-white hover:bg-mango-dark shadow-sm shadow-mango/20',
  dark: 'bg-cambodia text-oat hover:bg-cambodia/90',
  secondary: 'bg-white text-cambodia border border-line hover:border-cambodia/30 hover:bg-oat',
  ghost: 'text-cambodia hover:bg-cambodia/5',
  danger: 'bg-white text-coffee border border-coffee/25 hover:bg-coffee-soft',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }
>(function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

/* ---------- Карточки, заголовки ---------- */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-3xl border border-line/70 bg-white p-5 shadow-[0_1px_2px_rgba(38,66,43,0.04)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold">{children}</h2>
      {right}
    </div>
  );
}

/* ---------- Поля ---------- */

const inputCls =
  'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-cambodia outline-none transition placeholder:text-muted/60 focus:border-mango focus:ring-2 focus:ring-mango/15 disabled:bg-oat disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />;
});

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'h-auto min-h-[80px] py-2', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-cambodia/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('inline-flex items-center gap-2.5 select-none', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-mango' : 'bg-cambodia/15',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

/* ---------- Чипы статусов ---------- */

const ORDER_CHIP: Record<OrderStatus, string> = {
  NEW: 'bg-ice text-[#0b4a7d]',
  APPROVED: 'bg-butter text-[#6b5300]',
  PAID: 'bg-cambodia-soft text-cambodia',
  IN_PRODUCTION: 'bg-mango-soft text-mango-dark',
  READY: 'bg-[#e4f1d0] text-[#3d5a12]',
  SHIPPED: 'bg-[#e9e2f6] text-[#4b3a7a]',
  DELIVERED: 'bg-cambodia text-oat',
  REJECTED: 'bg-coffee-soft text-coffee',
  CANCELLED: 'bg-[#ece9e1] text-[#7b766a]',
};

export function StatusChip({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        ORDER_CHIP[status],
        className,
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const PARTNER_CHIP: Record<PartnerStatus, string> = {
  PENDING: 'bg-butter text-[#6b5300]',
  APPROVED: 'bg-cambodia-soft text-cambodia',
  REJECTED: 'bg-coffee-soft text-coffee',
  BLOCKED: 'bg-[#ece9e1] text-[#7b766a]',
};

export function PartnerChip({ status }: { status: PartnerStatus }) {
  return <Chip className={PARTNER_CHIP[status]}>{PARTNER_STATUS_LABELS[status] ?? status}</Chip>;
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        className ?? 'bg-oat text-cambodia',
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Состояния ---------- */

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('h-5 w-5 animate-spin text-mango', className)} />;
}

export function Loading({ text = 'Загрузка…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner /> {text}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 rounded-full bg-oat p-4 text-mango">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Note({
  children,
  tone = 'yellow',
  icon,
  className,
}: {
  children: React.ReactNode;
  tone?: 'yellow' | 'blue' | 'red' | 'green';
  icon?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    yellow: 'bg-butter/70 text-[#5a4600] border-[#eedb8a]',
    blue: 'bg-ice/60 text-[#0b4a7d] border-ice',
    red: 'bg-coffee-soft text-coffee border-coffee/15',
    green: 'bg-cambodia-soft text-cambodia border-cambodia/10',
  };
  return (
    <div className={cx('flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ---------- Модальное окно ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-cambodia/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line/70 px-6 py-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-oat" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Вкладки ---------- */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: React.ReactNode; count?: number }[];
}) {
  return (
    <div className="no-print inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-oat-dark/60 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
            value === it.value ? 'bg-white text-cambodia shadow-sm' : 'text-cambodia/60 hover:text-cambodia',
          )}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 && (
            <span className="rounded-full bg-mango px-1.5 py-0.5 text-[10px] leading-none text-white">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- Таблица ---------- */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        'border-b border-line px-3 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx('border-b border-line/60 px-3 py-3 align-middle', className)} {...rest}>
      {children}
    </td>
  );
}
