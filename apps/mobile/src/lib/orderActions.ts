import { errorMessage, Order, Orders } from '../api';
import { ACTION_LABELS, ORDER_STATUS_LABELS, OrderStatus } from '../shared';
import { confirmDialog, toast } from '../store/ui';

/**
 * Выполняет смену статуса с нужным диалогом:
 * REJECTED — обязательная причина, PAID — необязательный способ оплаты, CANCELLED — подтверждение.
 */
export function runOrderAction(order: Pick<Order, 'id' | 'number'>, status: OrderStatus, done: (o: Order) => void) {
  const apply = async (extra: { comment?: string; paymentMethod?: string } = {}) => {
    const updated = await Orders.setStatus(order.id, status, extra);
    toast.success(`Заказ №${order.number}: ${ORDER_STATUS_LABELS[status].toLowerCase()}`);
    done(updated);
  };

  if (status === 'REJECTED') {
    return confirmDialog({
      title: `Отклонить заказ №${order.number}?`,
      message: 'Партнёр увидит причину в приложении.',
      input: { placeholder: 'Причина отклонения', required: true },
      confirmText: 'Отклонить',
      destructive: true,
      onConfirm: (comment) => apply({ comment }),
    });
  }
  if (status === 'CANCELLED') {
    return confirmDialog({
      title: `Отменить заказ №${order.number}?`,
      message: 'Заказ будет отменён, его нельзя будет восстановить.',
      input: { placeholder: 'Причина (необязательно)' },
      confirmText: 'Отменить заказ',
      cancelText: 'Назад',
      destructive: true,
      onConfirm: (comment) => apply({ comment: comment || undefined }),
    });
  }
  if (status === 'PAID') {
    return confirmDialog({
      title: `Отметить оплату №${order.number}`,
      message: 'Укажите способ оплаты, если знаете.',
      input: { placeholder: 'Наличные, перевод, QR…' },
      confirmText: 'Оплачен',
      onConfirm: (paymentMethod) => apply({ paymentMethod: paymentMethod || undefined }),
    });
  }
  if (status === 'DELIVERED' || status === 'SHIPPED') {
    return confirmDialog({
      title: status === 'SHIPPED' ? `Забрали заказ №${order.number}?` : `Заказ №${order.number} доставлен?`,
      confirmText: ACTION_LABELS[status],
      onConfirm: () => apply(),
    });
  }
  apply().catch((e) => toast.error(errorMessage(e)));
}

export function actionKind(s: OrderStatus): 'primary' | 'danger' | 'ghost' | 'dark' {
  if (s === 'REJECTED' || s === 'CANCELLED') return 'danger';
  if (s === 'APPROVED' || s === 'READY' || s === 'DELIVERED' || s === 'PAID') return 'primary';
  return 'dark';
}
