import { Addresses, Catalog, Notifications, Order, Orders, Product } from '../api';
import { useAuth } from '../store/auth';
import { usePrefs } from '../store/prefs';
import { fetchCached, invalidate, peek, prefetch } from './cache';
import { useCart } from '../store/cart';
import { LoadOptions, useLoad } from './useLoad';

/**
 * Единые ключи кэша и загрузчики. Цены зависят от пользователя, поэтому личные ключи — с его id.
 * Меню кофейни зависит ещё и от филиала.
 */
const uid = () => useAuth.getState().user?.id ?? 'anon';

/** Филиал, по которому показываем меню: гостям и без входа — выбранный; партнёрам и офису — не нужен. */
export function catalogBranch(): string | null {
  const u = useAuth.getState().user;
  if (u && (u.partnerId || (u.channel == null && u.role !== 'CASHIER'))) return null;
  return usePrefs.getState().branchId;
}
const br = () => catalogBranch() ?? '-';

export const Q = {
  categories: (b = br()) => ({ key: `categories:${b}`, fn: () => Catalog.categories(b === '-' ? null : b) }),
  info: () => ({ key: 'info', fn: () => Catalog.info() }),
  rules: () => ({ key: 'rules', fn: () => Orders.rules() }),
  branches: () => ({ key: 'branches', fn: () => Catalog.branches() }),
  stories: (u = uid()) => ({ key: `stories:${u}`, fn: () => Catalog.stories() }),
  loyalty: (u = uid()) => ({ key: `loyalty:${u}`, fn: () => Orders.loyalty() }),
  products: (u = uid(), b = br()) => ({ key: `products:${u}:${b}`, fn: () => Catalog.products({ branchId: b === '-' ? null : b }) }),
  product: (id: string, u = uid(), b = br()) => ({ key: `product:${id}:${u}:${b}`, fn: () => Catalog.product(id, b === '-' ? null : b) }),
  orders: (u = uid()) => ({ key: `orders:${u}`, fn: () => Orders.list() }),
  order: (id: string) => ({ key: `order:${id}`, fn: () => Orders.get(id) }),
  payment: (id: string) => ({ key: `payment:${id}`, fn: () => Orders.payment(id) }),
  notifications: (u = uid()) => ({ key: `notif:${u}`, fn: () => Notifications.list() }),
  addresses: (u = uid()) => ({ key: `addr:${u}`, fn: () => Addresses.list() }),
};

type Query<T> = { key: string; fn: () => Promise<T> };

/** useLoad поверх кэша по описанию запроса из Q. */
export function useQuery<T>(q: Query<T>, opts: Omit<LoadOptions<T>, 'key'> = {}) {
  return useLoad(q.fn, [q.key], { ...opts, key: q.key });
}

/** Товар из уже загруженного каталога — для мгновенного открытия карточки. */
export function productFromCache(id: string): Product | undefined {
  return peek<Product[]>(Q.products().key)?.find((p) => p.id === id);
}

/** Прогрев данных на старте: каталог, правила, а покупателю — заказы и уведомления. */
export function warmUp(buyer: boolean) {
  const qs: Query<unknown>[] = [Q.categories(), Q.products(), Q.info(), Q.rules()];
  if (buyer) qs.push(Q.orders(), Q.notifications(), Q.addresses());
  for (const q of qs) prefetch(q.key, q.fn);
}

/**
 * Цены в корзине — по текущему пользователю (у партнёра опт, у клиента розница):
 * после входа/выхода пересчитываем позиции по свежему каталогу.
 */
export async function repriceCart() {
  const lines = useCart.getState().lines;
  if (!lines.length) return;
  try {
    const q = Q.products();
    const products = await fetchCached(q.key, q.fn);
    const byId = new Map(products.map((p) => [p.id, p]));
    useCart.getState().replace(
      useCart.getState().lines.map((l) => {
        const p = byId.get(l.productId);
        return p ? { ...l, price: p.price, name: p.name, photoUrl: p.photoUrl, promo: p.promo } : l;
      }),
    );
  } catch {
    // офлайн — оставим как есть, сервер всё равно посчитает по своим ценам
  }
}

/** После оформления/отмены заказа. */
export function invalidateOrders() {
  invalidate('orders:');
  invalidate('order:');
  invalidate('notif:');
  invalidate('rules');
}

/** «Часто заказываете»: суммируем позиции прошлых заказов (без отменённых/отклонённых). */
export function frequentProducts(orders: Order[] | undefined, products: Product[] | undefined, limit = 8): Product[] {
  if (!orders?.length || !products?.length) return [];
  const score = new Map<string, number>();
  for (const o of orders) {
    if (o.status === 'CANCELLED' || o.status === 'REJECTED') continue;
    for (const i of o.items) score.set(i.productId, (score.get(i.productId) ?? 0) + 1);
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => byId.get(id))
    .filter((p): p is Product => !!p)
    .slice(0, limit);
}
