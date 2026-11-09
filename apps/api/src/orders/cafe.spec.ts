import { buildPaymentQr, elqrChecksum, extractPayload, isValidElqr, parseTlv } from '../common/elqr';
import { checkPickup, localToDate, pickupSlots } from './pickup';
import { applyCoffeePromo, loyaltyCard } from './promo';

const OPTIMA =
  'https://optimabank.kg/index.php?lang=ru#00020101021132710013QR.Optima.C2B01032031016109162116378032411112075469%3A3%3A1120211130212331500112075469%3A3%3A15204999953034175918CINNABON%20BY%20MEERIM63043787';

describe('акция «7-й кофе бесплатно»', () => {
  const latte = { productId: 'latte', price: 220, qty: 1, promo: true };
  const amer = { productId: 'amer', price: 140, qty: 1, promo: true };
  const bun = { productId: 'bun', price: 250, qty: 1, promo: false };

  it('седьмой кофе — в подарок', () => {
    const r = applyCoffeePromo([latte, bun], 6, 7);
    expect(r.freeCount).toBe(1);
    expect(r.discount).toBe(220);
    expect(r.totalAfter).toBe(7);
  });

  it('до седьмого — без подарка, выпечка не считается', () => {
    const r = applyCoffeePromo([latte, bun], 4, 7);
    expect(r.freeCount).toBe(0);
    expect(r.totalAfter).toBe(5);
  });

  it('в подарок идёт самый дешёвый кофе из брони', () => {
    const r = applyCoffeePromo([latte, amer], 5, 7);
    expect(r.freeCount).toBe(1);
    expect(r.free.get('amer')).toBe(1);
    expect(r.discount).toBe(140);
  });

  it('большая бронь может дать два подарка', () => {
    const r = applyCoffeePromo([{ ...latte, qty: 14 }], 0, 7);
    expect(r.freeCount).toBe(2);
    expect(r.discount).toBe(440);
  });

  it('карта: 6 штампов — следующий бесплатно', () => {
    expect(loyaltyCard(6, 7)).toMatchObject({ stamps: 6, untilFree: 1, nextIsFree: true });
    expect(loyaltyCard(7, 7)).toMatchObject({ stamps: 0, untilFree: 7, nextIsFree: false });
  });
});

describe('QR Оптима Банка (ELQR)', () => {
  it('понимает контрольную сумму банка', () => {
    const payload = extractPayload(OPTIMA);
    expect(isValidElqr(payload)).toBe(true);
    expect(elqrChecksum(payload.slice(0, -8))).toBe('3787');
  });

  it('подставляет сумму в тыйынах и пересчитывает контрольную сумму', () => {
    const qr = buildPaymentQr(OPTIMA, 470, true);
    expect(qr.startsWith('https://optimabank.kg/index.php?lang=ru#')).toBe(true);
    const payload = extractPayload(qr);
    expect(isValidElqr(payload)).toBe(true);
    const f = Object.fromEntries(parseTlv(payload).map((x) => [x.tag, x.value]));
    expect(f['01']).toBe('12');
    expect(f['54']).toBe('47000');
    expect(f['59']).toBe('CINNABON BY MEERIM');
  });

  it('без суммы отдаёт QR банка как есть', () => {
    expect(buildPaymentQr(OPTIMA, 470, false)).toBe(OPTIMA);
  });
});

describe('время самовывоза', () => {
  // 10:07 в Бишкеке
  const now = new Date('2026-11-10T04:07:00Z');

  it('переводит местное время в момент', () => {
    expect(localToDate('2026-11-10', '10:30').toISOString()).toBe('2026-11-10T04:30:00.000Z');
  });

  it('ближайший слот — через 15 минут, кратно 15', () => {
    const s = pickupSlots('08:00', '22:00', now);
    expect(s.today[0].time).toBe('10:30');
    expect(s.today.at(-1)!.time).toBe('21:45');
    expect(s.tomorrow[0].time).toBe('08:00');
  });

  it('после закрытия — только завтра', () => {
    const late = new Date('2026-11-10T16:00:00Z'); // 22:00
    expect(pickupSlots('08:00', '22:00', late).closedToday).toBe(true);
  });

  it('не даёт забронировать «на сейчас» и вне часов работы', () => {
    expect(checkPickup(new Date('2026-11-10T04:10:00Z'), '08:00', '22:00', now)).toMatch(/15 минут/);
    expect(checkPickup(localToDate('2026-11-10', '23:00'), '08:00', '22:00', now)).toMatch(/работает/);
    expect(checkPickup(localToDate('2026-11-10', '12:00'), '08:00', '22:00', now)).toBeNull();
  });
});
