import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorMessage } from '../api';
import { cacheStats, fetchCached, isFresh, isInvalidated, peek, setCached, subscribe } from './cache';

export interface LoadOptions<T = unknown> {
  /** Перезапрашивать при возврате на экран (по умолчанию да; с key — только если данные устарели). */
  refetchOnFocus?: boolean;
  enabled?: boolean;
  /**
   * Ключ кэша. С ним данные показываются мгновенно из памяти (stale-while-revalidate),
   * одинаковые запросы склеиваются, а все экраны с этим ключом видят одни и те же данные.
   */
  key?: string | null;
  /** Сколько миллисекунд данные считаются свежими (без повторного запроса). По умолчанию 30 с. */
  staleTime?: number;
  /** Начальные данные, пока нет своих (например, товар из списка каталога). */
  initial?: () => T | undefined;
  /** Опрос каждые N мс, пока экран открыт (живой статус заказа). */
  poll?: number;
}

/**
 * Загрузчик данных: первая загрузка, pull-to-refresh, обновление при возврате на экран.
 * Сигнатура и форма результата прежние; `key` включает кэш.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: LoadOptions<T> = {}) {
  const { refetchOnFocus = true, enabled = true, key = null, staleTime = 30_000, poll } = opts;
  const initialRef = useRef(opts.initial);
  initialRef.current = opts.initial;

  const [local, setLocal] = useState<T | undefined>(() => (key ? undefined : opts.initial?.()));
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mounted = useRef(true);
  const loadedOnce = useRef(false);
  const reqId = useRef(0);

  const data: T | undefined = key ? (peek<T>(key) ?? initialRef.current?.()) : local;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!enabled) return;
      const id = ++reqId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        if (key) {
          await fetchCached(key, fnRef.current);
          if (!mounted.current || id !== reqId.current) return;
          rerender();
        } else {
          cacheStats.fetches++;
          const res = await fnRef.current();
          if (!mounted.current || id !== reqId.current) return;
          setLocal(res);
        }
        setError(null);
        loadedOnce.current = true;
      } catch (e) {
        if (!mounted.current || id !== reqId.current) return;
        setError(errorMessage(e));
      } finally {
        if (mounted.current && id === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, key, ...deps],
  );

  // Подписка на кэш: данные обновились где-то ещё / ключ помечен устаревшим.
  useEffect(() => {
    if (!key) return;
    return subscribe(key, () => {
      if (!mounted.current) return;
      rerender();
      if (enabled && isInvalidated(key)) void run('silent');
    });
  }, [key, enabled, run]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (key) {
      if (peek(key) !== undefined) {
        loadedOnce.current = true;
        setLoading(false);
        if (isFresh(key, staleTime)) {
          cacheStats.hits++;
          return;
        }
        void run('silent');
        return;
      }
      void run(initialRef.current?.() !== undefined ? 'silent' : 'initial');
      return;
    }
    void run(loadedOnce.current ? 'silent' : 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, enabled]);

  useFocusEffect(
    useCallback(() => {
      if (!refetchOnFocus || !loadedOnce.current) return;
      if (key && isFresh(key, staleTime)) {
        cacheStats.hits++;
        return;
      }
      void run('silent');
    }, [run, refetchOnFocus, key, staleTime]),
  );

  // Живой опрос, пока экран в фокусе.
  useFocusEffect(
    useCallback(() => {
      if (!poll || !enabled) return;
      const t = setInterval(() => void run('silent'), poll);
      return () => clearInterval(t);
    }, [poll, enabled, run]),
  );

  const setData = useCallback(
    (v: T | undefined | ((prev: T | undefined) => T | undefined)) => {
      if (key) {
        const next = typeof v === 'function' ? (v as (p: T | undefined) => T | undefined)(peek<T>(key)) : v;
        setCached(key, next);
      } else {
        setLocal(v as T);
      }
    },
    [key],
  );

  return {
    data,
    setData,
    error,
    loading: loading && data === undefined,
    refreshing,
    refresh: () => run('refresh'),
    reload: () => run('silent'),
  };
}
