import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorMessage } from '../api';

/**
 * Простой загрузчик данных: первая загрузка, pull-to-refresh, обновление при возврате на экран.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { refetchOnFocus?: boolean; enabled?: boolean } = {}) {
  const { refetchOnFocus = true, enabled = true } = opts;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mounted = useRef(true);
  const loadedOnce = useRef(false);
  const reqId = useRef(0);

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
        const res = await fnRef.current();
        if (!mounted.current || id !== reqId.current) return;
        setData(res);
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
    [enabled, ...deps],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void run(loadedOnce.current ? 'silent' : 'initial');
  }, [run, enabled]);

  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus && loadedOnce.current) void run('silent');
    }, [run, refetchOnFocus]),
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
