import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface CartLine {
  productId: string;
  name: string;
  unit: string;
  multiplicity: number;
  price: number | null;
  photoUrl: string | null;
  categoryName?: string;
  /** Кофе по акции «7-й бесплатно» */
  promo?: boolean;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  /** Выбранная в корзине дата доставки (YYYY-MM-DD) — подставляется при оформлении. */
  deliveryDate: string | null;
  add: (line: Omit<CartLine, 'qty'>, qty: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  /** Удалить и вернуть то, что нужно для «Вернуть». */
  take: (productId: string) => { line: CartLine; index: number } | null;
  /** Вернуть позицию на прежнее место. */
  restore: (line: CartLine, index: number) => void;
  replace: (lines: CartLine[]) => void;
  setDeliveryDate: (d: string | null) => void;
  clear: () => void;
}

/** Округляем до кратности вверх, минимум — одна кратность. */
export function normalizeQty(qty: number, multiplicity: number): number {
  const m = multiplicity > 0 ? multiplicity : 1;
  if (qty <= 0) return 0;
  return Math.round(Math.ceil(qty / m - 1e-9) * m * 1000) / 1000;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      deliveryDate: null,
      add: (line, qty) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === line.productId);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === line.productId
                  ? { ...l, ...line, qty: normalizeQty(l.qty + qty, line.multiplicity) }
                  : l,
              ),
            };
          }
          return { lines: [...s.lines, { ...line, qty: normalizeQty(qty, line.multiplicity) }] };
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.productId !== productId)
              : s.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      take: (productId) => {
        const lines = get().lines;
        const index = lines.findIndex((l) => l.productId === productId);
        if (index < 0) return null;
        const line = lines[index];
        set({ lines: lines.filter((l) => l.productId !== productId) });
        return { line, index };
      },
      restore: (line, index) =>
        set((s) => {
          if (s.lines.some((l) => l.productId === line.productId)) return s;
          const lines = [...s.lines];
          lines.splice(Math.min(index, lines.length), 0, line);
          return { lines };
        }),
      replace: (lines) => set({ lines }),
      setDeliveryDate: (deliveryDate) => set({ deliveryDate }),
      clear: () => set({ lines: [] }),
    }),
    { name: 'bulo.cart', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
}

export function useCartCount(): number {
  return useCart((s) => s.lines.length);
}

/** Количество товара в корзине (селектор — карточка перерисуется только при его изменении). */
export function useInCart(productId: string): number {
  return useCart((s) => s.lines.find((l) => l.productId === productId)?.qty ?? 0);
}
