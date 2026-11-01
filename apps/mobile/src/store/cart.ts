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
  qty: number;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'qty'>, qty: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  replace: (lines: CartLine[]) => void;
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
    (set) => ({
      lines: [],
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
      replace: (lines) => set({ lines }),
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
