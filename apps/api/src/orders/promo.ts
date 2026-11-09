/**
 * Акция «каждый N-й кофе бесплатно» (по умолчанию 7-й).
 * Считаем все кофе гостя в непропавших бронях. В новой броне бесплатными становятся
 * те штуки, что выпадают на 7-ю, 14-ю, … позицию; дарим самые дешёвые кофе из брони.
 */
export interface PromoLine {
  productId: string;
  price: number;
  qty: number;
  promo: boolean;
}

export interface PromoResult {
  /** productId → сколько штук бесплатно */
  free: Map<string, number>;
  freeCount: number;
  discount: number;
  /** Сколько кофе станет у гостя после этой брони */
  totalAfter: number;
}

export function applyCoffeePromo(lines: PromoLine[], before: number, every: number): PromoResult {
  const free = new Map<string, number>();
  const coffees = lines.filter((l) => l.promo && l.qty > 0);
  const count = coffees.reduce((s, l) => s + Math.floor(l.qty), 0);
  const totalAfter = before + count;
  if (!(every > 1) || !count) return { free, freeCount: 0, discount: 0, totalAfter };

  let freeCount = Math.floor(totalAfter / every) - Math.floor(before / every);
  const n = freeCount;
  let discount = 0;
  for (const l of [...coffees].sort((a, b) => a.price - b.price)) {
    if (freeCount <= 0) break;
    const take = Math.min(freeCount, Math.floor(l.qty));
    if (take <= 0) continue;
    free.set(l.productId, take);
    discount += take * l.price;
    freeCount -= take;
  }
  return { free, freeCount: n, discount: Math.round(discount * 100) / 100, totalAfter };
}

/** Состояние карты гостя: сколько уже набрано в текущем круге и подарок ли следующий. */
export function loyaltyCard(total: number, every: number) {
  const inCycle = every > 0 ? total % every : 0;
  return {
    every,
    total,
    /** штампов в карте сейчас (0…every-1) */
    stamps: inCycle,
    /** сколько ещё купить до подарка (следующий бесплатный, если 1) */
    untilFree: every - inCycle,
    nextIsFree: every > 0 && inCycle === every - 1,
  };
}
