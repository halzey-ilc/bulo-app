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

interface UiState {
  toast: { id: number; kind: ToastKind; text: string } | null;
  dialog: DialogOptions | null;
  showToast: (text: string, kind?: ToastKind) => void;
  hideToast: () => void;
  openDialog: (d: DialogOptions) => void;
  closeDialog: () => void;
}

let seq = 0;

export const useUi = create<UiState>((set) => ({
  toast: null,
  dialog: null,
  showToast: (text, kind = 'info') => set({ toast: { id: ++seq, kind, text } }),
  hideToast: () => set({ toast: null }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

export const toast = {
  success: (t: string) => useUi.getState().showToast(t, 'success'),
  error: (t: string) => useUi.getState().showToast(t, 'error'),
  info: (t: string) => useUi.getState().showToast(t, 'info'),
};

export const confirmDialog = (d: DialogOptions) => useUi.getState().openDialog(d);
