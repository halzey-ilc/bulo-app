import { useEffect, useMemo } from 'react';
import type { Branch } from '../api';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { usePrefs } from '../store/prefs';
import { toast } from '../store/ui';
import { fetchCached, invalidate } from './cache';
import { bishkekTime } from './format';
import { Q, repriceCart, useQuery } from './queries';

/** Гость кофейни (или ещё не вошёл) — видит меню филиала; партнёр — оптовый каталог. */
export function useIsCafe(): boolean {
  const user = useAuth((s) => s.user);
  if (!user) return true;
  return user.channel === 'CAFE';
}

/**
 * Выбранный филиал. Если ещё не выбран — любимый филиал гостя или первый, где есть меню.
 */
export function useBranch() {
  const branchId = usePrefs((s) => s.branchId);
  const userBranch = useAuth((s) => s.user?.branchId ?? null);
  const branches = useQuery(Q.branches(), { staleTime: 10 * 60_000 });
  const list = branches.data ?? [];
  const branch = useMemo(() => list.find((b) => b.id === branchId) ?? null, [list, branchId]);

  useEffect(() => {
    if (!list.length || branch) return;
    const fallback = list.find((b) => b.id === userBranch) ?? list.find((b) => b.menuSize > 0) ?? list[0];
    if (fallback) usePrefs.getState().setBranch(fallback.id);
  }, [list, branch, userBranch]);

  return { branch, branches: list, loading: branches.loading };
}

/** Сменить филиал: меню и цены другие — пересчитываем корзину, убираем то, чего там нет. */
export async function switchBranch(b: Branch) {
  if (usePrefs.getState().branchId === b.id) return;
  usePrefs.getState().setBranch(b.id);
  invalidate('products:');
  invalidate('categories:');
  invalidate('product:');
  const lines = useCart.getState().lines;
  if (!lines.length) return;
  try {
    const q = Q.products();
    const menu = await fetchCached(q.key, q.fn);
    const ids = new Set(menu.map((p) => p.id));
    const missing = lines.filter((l) => !ids.has(l.productId));
    if (missing.length) {
      useCart.getState().replace(lines.filter((l) => ids.has(l.productId)));
      toast.info(`В филиале «${b.name}» нет: ${missing.map((m) => m.name).join(', ')} — убрали из корзины`);
    }
    await repriceCart();
  } catch {
    // офлайн — сервер всё равно пересчитает
  }
}

/** «08:00–22:00» и открыт ли сейчас. */
export function branchHours(b: Pick<Branch, 'opensAt' | 'closesAt'>, now = new Date()) {
  const hm = bishkekTime(now);
  return { text: `${b.opensAt}–${b.closesAt}`, open: hm >= b.opensAt && hm < b.closesAt };
}
