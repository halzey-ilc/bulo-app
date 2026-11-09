import { errorMessage, Order, Orders } from '../api';
import { actionLabel, OrderStatus, statusLabel } from '../shared';
import { confirmDialog, toast } from '../store/ui';

type O = Pick<Order, 'id' | 'number'> & Partial<Pick<Order, 'channel' | 'paymentMethod' | 'paidAt' | 'buyer' | 'total' | 'paymentClaimedAt'>>;
const title = (o: O) => `${o.channel === 'CAFE' ? 'Бронь' : 'Заказ'} №${o.number}`;

/**
 * Выполняет смену статуса с нужным диалогом:
 * REJECTED — обязательная причина, CANCELLED — подтверждение, выдача/доставка — с отметкой наличных.
 */
export function runOrderAction(order: O, status: OrderStatus, done: (o: Order) => void) {
  const apply = async (extra: { comment?: string; cashReceived?: boolean } = {}) => {
    const updated = await Orders.setStatus(order.id, status, extra);
    toast.success(`${title(order)}: ${statusLabel(status, order.channel).toLowerCase()}`);
    done(updated);
  };
  const cashDue = order.paymentMethod === 'CASH' && !order.paidAt;

  if (status === 'REJECTED') {
    return confirmDialog({
      title: `Отклонить ${title(order).toLowerCase()}?`,
      message: 'Покупатель увидит причину в приложении.',
      input: { placeholder: 'Причина отклонения', required: true },
      confirmText: 'Отклонить',
      destructive: true,
      onConfirm: (comment) => apply({ comment }),
    });
  }
  if (status === 'CANCELLED') {
    return confirmDialog({
      title: `Отменить ${title(order).toLowerCase()}?`,
      message: 'Отменённый заказ нельзя восстановить. Если товар уже списан в 1С — он вернётся.',
      input: { placeholder: 'Причина (необязательно)' },
      confirmText: 'Отменить',
      cancelText: 'Назад',
      destructive: true,
      onConfirm: (comment) => apply({ comment: comment || undefined }),
    });
  }
  if (status === 'PAID') return runConfirm(order, done);
  if (status === 'DELIVERED' && order.channel === 'CAFE') {
    return confirmDialog({
      title: `Выдать ${title(order).toLowerCase()}?`,
      message: cashDue ? `Возьмите оплату наличными: ${order.total ?? ''} сом.` : 'Заказ оплачен — можно отдавать.',
      confirmText: cashDue ? 'Оплачено, выдать' : 'Выдать',
      onConfirm: () => apply(),
    });
  }
  if (status === 'DELIVERED' && cashDue) {
    return confirmDialog({
      title: `${title(order)} доставлен?`,
      message: `Наличные ${order.total ?? ''} сом получены?`,
      confirmText: 'Да, деньги у меня',
      cancelText: 'Назад',
      onConfirm: () => apply({ cashReceived: true }),
    });
  }
  if (status === 'DELIVERED' || status === 'SHIPPED') {
    return confirmDialog({
      title: status === 'SHIPPED' ? `Забрали ${title(order).toLowerCase()}?` : `${title(order)} доставлен?`,
      confirmText: actionLabel(status, order.channel),
      onConfirm: () => apply(),
    });
  }
  apply().catch((e) => toast.error(errorMessage(e)));
}

/** Подтвердить заказ: оплата пришла (QR, счёт) или принимаем за наличные. Дальше — цех и списание в 1С. */
export function runConfirm(order: O, done: (o: Order) => void) {
  const cash = order.paymentMethod === 'CASH';
  const cafe = order.channel === 'CAFE';
  return confirmDialog({
    title: cash ? `Принять ${title(order).toLowerCase()}?` : `Оплата по №${order.number} пришла?`,
    message: cash
      ? `${cafe ? 'Гость оплатит на кассе при получении.' : 'Партнёр оплатит наличными курьеру. Заказ уйдёт в цех.'} Товар спишется в 1С.`
      : `Проверьте поступление ${order.total ?? ''} сом${order.paymentClaimedAt ? ' — покупатель уже сообщил об оплате' : ''}. ${cafe ? '' : 'Заказ уйдёт в цех. '}Товар спишется в 1С.`,
    confirmText: cash ? 'Принять' : 'Оплата получена',
    onConfirm: async () => {
      const updated = await Orders.confirm(order.id);
      toast.success(`${title(order)}: подтверждено`);
      done(updated);
    },
  });
}

/** Деньги получены позже (наличные при выдаче, запоздалый перевод). */
export function runMarkPaid(order: O, done: (o: Order) => void) {
  return confirmDialog({
    title: `Оплата по №${order.number} получена?`,
    message: `${order.total ?? ''} сом · ${order.paymentMethod === 'CASH' ? 'наличными' : order.paymentMethod === 'QR' ? 'по QR' : 'переводом'}`,
    confirmText: 'Получена',
    onConfirm: async () => {
      const updated = await Orders.markPaid(order.id, { paymentMethod: order.paymentMethod ?? undefined });
      toast.success(`№${order.number}: оплата отмечена`);
      done(updated);
    },
  });
}

export function actionKind(s: OrderStatus): 'primary' | 'danger' | 'ghost' | 'dark' {
  if (s === 'REJECTED' || s === 'CANCELLED') return 'danger';
  if (s === 'APPROVED' || s === 'READY' || s === 'DELIVERED' || s === 'PAID') return 'primary';
  return 'dark';
}
