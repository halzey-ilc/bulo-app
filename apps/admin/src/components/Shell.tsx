'use client';

import { ROLE_LABELS } from '@bulo/shared';
import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { cx } from './ui';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 pt-7 pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bulo-logo.svg" alt="BULO" className="h-9 w-auto" />
        <div className="leading-tight">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-oat/50 uppercase">панель</div>
          <div className="text-xs text-oat/70 italic">Taste at Your Pace</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((n) => {
          const Icon = n.icon;
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cx(
                'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition',
                active ? 'bg-mango text-white shadow-md shadow-black/10' : 'text-oat/75 hover:bg-white/8 hover:text-oat',
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-2xl bg-white/6 p-3.5">
        <div className="truncate text-sm font-semibold text-oat">{user.name}</div>
        <div className="mb-3 text-xs text-oat/60">{ROLE_LABELS[user.role]}</div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs font-semibold text-oat/70 transition hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Десктоп */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-cambodia lg:block">{sidebar}</aside>

      {/* Мобильная шапка */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-oat/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-xl p-2 hover:bg-white" aria-label="Меню">
          <Menu className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bulo-logo.svg" alt="BULO" className="h-7" />
        <div className="w-9" />
      </header>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-cambodia/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-cambodia shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 rounded-full p-1.5 text-oat/70 hover:bg-white/10"
              aria-label="Закрыть меню"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="print-main mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
