import { errorMessage, Order, Product } from '../api';
import { hapticSuccess } from '../components/ui';
import { CartLine, normalizeQty, useCart } from '../store/cart';
import { confirmDialog, toast, useUi } from '../store/ui';
import { fetchCached, isFresh, peek } from './cache';
import { goTab } from './nav';
import { Q } from './queries';

/** «Повторить заказ»: кладёт те же позиции в корзину по актуальным ценам (каталог — из кэша). */
export async function repeatOrder(order: Order) {
  const doIt = async () => {
    try {
      const q = Q.products();
      const products = isFresh(q.key, 5 * 60_000) ? peek<Product[]>(q.key)! : await fetchCached(q.key, q.fn);
      const byId = new Map(products.map((p) => [p.id, p]));
      const lines: CartLine[] = [];
      let missing = 0;
      for (const i of order.items) {
        const p = byId.get(i.productId);
        if (!p) {
          missing++;
          continue;
        }
        lines.push({
          productId: p.id,
          name: p.name,
          unit: p.unit,
          multiplicity: p.multiplicity,
          price: p.price,
          photoUrl: p.photoUrl,
          categoryName: p.category?.name,
          qty: normalizeQty(i.qty, p.multiplicity),
        });
      }
      useCart.getState().replace(lines);
      hapticSuccess();
      useUi.getState().bumpCart();
      if (missing) toast.info(`${missing} поз. больше нет в каталоге — остальное в корзине`);
      else toast.success(`Заказ №${order.number} снова в корзине`);
      goTab('/cart');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (useCart.getState().lines.length) {
    confirmDialog({
      title: 'Заменить корзину?',
      message: `В корзине уже есть товары. Положить вместо них позиции заказа №${order.number}?`,
      confirmText: 'Заменить',
      onConfirm: doIt,
    });
  } else {
    await doIt();
  }
}
