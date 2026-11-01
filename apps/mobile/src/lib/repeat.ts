import { Catalog, errorMessage, Order } from '../api';
import { goTab } from './nav';
import { CartLine, normalizeQty, useCart } from '../store/cart';
import { confirmDialog, toast } from '../store/ui';

/** «Повторить заказ»: кладёт те же позиции в корзину по актуальным ценам. */
export async function repeatOrder(order: Order) {
  const doIt = async () => {
    try {
      const products = await Catalog.products();
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
      if (missing) toast.info(`${missing} поз. больше нет в каталоге — остальное в корзине`);
      else toast.success('Позиции заказа в корзине');
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
