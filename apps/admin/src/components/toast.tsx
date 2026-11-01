'use client';

import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';
import { errorMessage } from '@/lib/api';

type Kind = 'success' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (e: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = seq++;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      setTimeout(() => remove(id), kind === 'error' ? 6000 : 3500);
    },
    [remove],
  );

  const [apiValue] = useState<ToastApi>(() => ({
    success: (text) => push('success', text),
    error: (e) => push('error', typeof e === 'string' ? e : errorMessage(e)),
  }));

  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error'
                ? 'border-coffee/20 bg-coffee-soft text-coffee'
                : 'border-cambodia/15 bg-white text-cambodia'
            }`}
          >
            {t.kind === 'error' ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-mango" />
            )}
            <span className="flex-1 font-medium">{t.text}</span>
            <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100" aria-label="Закрыть">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast вне ToastProvider');
  return ctx;
}
