import {
  allowedTransitions,
  canTransition,
  checkDeliveryDate,
  checkMultiplicity,
  earliestDeliveryDate,
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

describe('переходы статусов', () => {
  it('оплату отмечает бухгалтер, а не партнёр', () => {
    expect(canTransition('APPROVED', 'PAID', 'ACCOUNTANT')).toBe(true);
    expect(canTransition('APPROVED', 'PAID', 'PARTNER')).toBe(false);
  });

  it('курьер забирает только готовые заказы', () => {
    expect(canTransition('READY', 'SHIPPED', 'COURIER')).toBe(true);
    expect(canTransition('PAID', 'SHIPPED', 'COURIER')).toBe(false);
  });

  it('партнёр может отменить только новый заказ', () => {
    expect(allowedTransitions('NEW', 'PARTNER')).toEqual(['CANCELLED']);
    expect(allowedTransitions('APPROVED', 'PARTNER')).toEqual([]);
  });
});
