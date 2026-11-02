import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** Поле ввода: причина отклонения, способ оплаты… */
  input?: { placeholder: string; required?: boolean; initial?: string };
  onConfirm: (value: string) => void | Promise<void>;
}

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface UiState {
  toast: { id: number; kind: ToastKind; text: string; action?: ToastAction } | null;
  dialog: DialogOptions | null;
  /** «Полёт» товара в корзину: точка старта на экране. */
  fly: { id: number; x: number; y: number } | null;
  /** Счётчик «подпрыгиваний» иконки корзины. */
  cartBump: number;
  showToast: (text: string, kind?: ToastKind, action?: ToastAction) => void;
  hideToast: () => void;
  openDialog: (d: DialogOptions) => void;
  closeDialog: () => void;
  flyToCart: (x?: number, y?: number) => void;
  bumpCart: () => void;
}

let seq = 0;

export const useUi = create<UiState>((set) => ({
  toast: null,
  dialog: null,
  fly: null,
  cartBump: 0,
  showToast: (text, kind = 'info', action) => set({ toast: { id: ++seq, kind, text, action } }),
  hideToast: () => set({ toast: null }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  flyToCart: (x, y) =>
    x != null && y != null ? set({ fly: { id: ++seq, x, y } }) : set((s) => ({ cartBump: s.cartBump + 1 })),
  bumpCart: () => set((s) => ({ cartBump: s.cartBump + 1 })),
}));

export const toast = {
  success: (t: string, action?: ToastAction) => useUi.getState().showToast(t, 'success', action),
  error: (t: string) => useUi.getState().showToast(t, 'error'),
  info: (t: string, action?: ToastAction) => useUi.getState().showToast(t, 'info', action),
  /** Сообщение с кнопкой «Вернуть». */
  undo: (t: string, onUndo: () => void) => useUi.getState().showToast(t, 'info', { label: 'Вернуть', onPress: onUndo }),
};

export const confirmDialog = (d: DialogOptions) => useUi.getState().openDialog(d);
