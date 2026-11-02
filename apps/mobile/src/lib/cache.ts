/**
 * Кэш запросов в памяти (stale-while-revalidate).
 *
 * - Данные по ключу живут, пока приложение запущено: переключение вкладок и «назад» — мгновенные.
 * - Одинаковые запросы, ушедшие одновременно, склеиваются в один (dedupe).
 * - Подписчики (useLoad с key) получают новые данные сразу, где бы их ни загрузили.
 * - invalidate(prefix) помечает данные устаревшими — смонтированные экраны тихо перезапросят.
 */

interface Entry {
  data?: unknown;
  /** Когда данные получены (0 — устарели/не загружены). */
  ts: number;
  promise?: Promise<unknown>;
}

const store = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();

/** Счётчики для замера: сколько реальных запросов ушло и сколько раз выручил кэш. */
export const cacheStats = { fetches: 0, deduped: 0, hits: 0 };

function notify(key: string) {
  subs.get(key)?.forEach((cb) => cb());
}

export function peek<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function ageOf(key: string): number {
  const e = store.get(key);
  return e && e.ts ? Date.now() - e.ts : Infinity;
}

export function isFresh(key: string, staleTime: number): boolean {
  return ageOf(key) < staleTime;
}

/** Ключ помечен устаревшим через invalidate() и ещё не перезапрошен. */
export function isInvalidated(key: string): boolean {
  const e = store.get(key);
  return !!e && e.ts === 0 && !e.promise;
}

export function setCached<T>(key: string, data: T) {
  const e = store.get(key) ?? { ts: 0 };
  e.data = data;
  e.ts = Date.now();
  store.set(key, e);
  notify(key);
}

/** Меняет данные в кэше функцией (оптимистичные обновления). */
export function updateCached<T>(key: string, fn: (prev: T | undefined) => T) {
  setCached(key, fn(peek<T>(key)));
}

/** Запрос через кэш: если такой же запрос уже в пути — ждём его. */
export function fetchCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const e = store.get(key) ?? { ts: 0 };
  if (e.promise) {
    cacheStats.deduped++;
    return e.promise as Promise<T>;
  }
  cacheStats.fetches++;
  const p = fn()
    .then((data) => {
      e.promise = undefined;
      setCached(key, data);
      return data;
    })
    .catch((err) => {
      e.promise = undefined;
      throw err;
    });
  e.promise = p;
  store.set(key, e);
  return p;
}

/** Прогрев кэша (на старте приложения, перед переходом). Ошибки глотаем. */
export function prefetch<T>(key: string, fn: () => Promise<T>, staleTime = 30_000): void {
  if (isFresh(key, staleTime) || store.get(key)?.promise) return;
  fetchCached(key, fn).catch(() => {});
}

/** Пометить устаревшими все ключи с префиксом; открытые экраны перезапросят тихо. */
export function invalidate(prefix: string) {
  for (const [key, e] of store) {
    if (key.startsWith(prefix)) {
      e.ts = 0;
      notify(key);
    }
  }
}

export function subscribe(key: string, cb: () => void): () => void {
  let set = subs.get(key);
  if (!set) {
    set = new Set();
    subs.set(key, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

/** При выходе/смене пользователя: личные данные не должны пережить сессию. */
export function clearCache(keep: (key: string) => boolean = () => false) {
  for (const key of [...store.keys()]) {
    if (!keep(key)) store.delete(key);
  }
}
