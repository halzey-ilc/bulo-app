import {
  allowedTransitions,
  canConfirm,
  canTransition,
  checkDeliveryDate,
  checkMultiplicity,
  earliestDeliveryDate,
  paymentAllowed,
} from './order-rules';

// 2026-11-02 10:00 в Бишкеке (UTC+6) = 04:00 UTC
const morning = new Date('2026-11-02T04:00:00Z');
// 2026-11-02 17:30 в Бишкеке
const evening = new Date('2026-11-02T11:30:00Z');

describe('checkDeliveryDate', () => {
  it('не принимает заказ на сегодня', () => {
    expect(checkDeliveryDate('2026-11-02', '16:00', morning)).toMatch(/минимум на завтра/);
  });

  it('принимает заказ на завтра до отсечки', () => {
    expect(checkDeliveryDate('2026-11-03', '16:00', morning)).toBeNull();
  });

  it('закрывает завтра после отсечки, но пускает послезавтра', () => {
    expect(checkDeliveryDate('2026-11-03', '16:00', evening)).toMatch(/закрыт в 16:00/);
    expect(checkDeliveryDate('2026-11-04', '16:00', evening)).toBeNull();
  });

  it('считает ближайшую дату с учётом отсечки', () => {
    expect(earliestDeliveryDate('16:00', morning)).toBe('2026-11-03');
    expect(earliestDeliveryDate('16:00', evening)).toBe('2026-11-04');
  });
});

describe('checkMultiplicity', () => {
  it('проверяет кратность', () => {
    expect(checkMultiplicity(12, 6)).toBe(true);
    expect(checkMultiplicity(10, 6)).toBe(false);
    expect(checkMultiplicity(1.5, 0.5)).toBe(true);
    expect(checkMultiplicity(0, 1)).toBe(false);
  });
});

describe('переходы статусов: партнёры', () => {
  it('новый заказ ждёт оплаты: цех его не берёт, пока не подтвердят', () => {
    expect(canTransition('NEW', 'IN_PRODUCTION', 'WORKSHOP')).toBe(false);
    expect(canTransition('PAID', 'IN_PRODUCTION', 'WORKSHOP')).toBe(true);
  });

  it('подтверждают админ, менеджер и бухгалтер; кассир — только брони кофейни', () => {
    expect(canConfirm('MANAGER', 'PARTNER')).toBe(true);
    expect(canConfirm('ADMIN', 'PARTNER')).toBe(true);
    expect(canConfirm('CASHIER', 'PARTNER')).toBe(false);
    expect(canConfirm('CASHIER', 'CAFE')).toBe(true);
    expect(canConfirm('WORKSHOP', 'PARTNER')).toBe(false);
  });

  it('менеджер может отклонить новый заказ, кассир — нет', () => {
    expect(canTransition('NEW', 'REJECTED', 'MANAGER')).toBe(true);
    expect(canTransition('NEW', 'REJECTED', 'CASHIER')).toBe(false);
  });

  it('курьер забирает только готовые заказы', () => {
    expect(canTransition('READY', 'SHIPPED', 'COURIER')).toBe(true);
    expect(canTransition('NEW', 'SHIPPED', 'COURIER')).toBe(false);
  });

  it('партнёр может отменить только новый заказ', () => {
    expect(allowedTransitions('NEW', 'PARTNER')).toEqual(['CANCELLED']);
    expect(allowedTransitions('PAID', 'PARTNER')).toEqual([]);
  });
});

describe('переходы статусов: бронь кофейни', () => {
  it('кассир отмечает «готово» и «выдан», в цех бронь не идёт', () => {
    expect(canTransition('PAID', 'READY', 'CASHIER', 'CAFE')).toBe(true);
    expect(canTransition('READY', 'DELIVERED', 'CASHIER', 'CAFE')).toBe(true);
    expect(canTransition('PAID', 'IN_PRODUCTION', 'WORKSHOP', 'CAFE')).toBe(false);
    expect(canTransition('READY', 'SHIPPED', 'COURIER', 'CAFE')).toBe(false);
  });

  it('гость может отменить бронь, пока её не подтвердили', () => {
    expect(allowedTransitions('NEW', 'CLIENT', 'CAFE')).toEqual(['CANCELLED']);
    expect(allowedTransitions('PAID', 'CLIENT', 'CAFE')).toEqual([]);
  });
});

describe('способы оплаты', () => {
  it('в кофейне — QR или наличные, у партнёра ещё и счёт', () => {
    expect(paymentAllowed('QR', 'CAFE')).toBe(true);
    expect(paymentAllowed('CASH', 'CAFE')).toBe(true);
    expect(paymentAllowed('BANK', 'CAFE')).toBe(false);
    expect(paymentAllowed('BANK', 'PARTNER')).toBe(true);
    expect(paymentAllowed('CARD', 'PARTNER')).toBe(false);
  });
});
