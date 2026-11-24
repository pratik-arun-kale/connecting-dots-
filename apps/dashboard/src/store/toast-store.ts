import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  /** Shows a toast for `durationMs` (default 8 s, long enough to reach Undo). */
  show: (message: string, options?: { action?: ToastAction; tone?: Toast['tone']; durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, options = {}) => {
    const id = nextId++;
    const toast: Toast = { id, message, tone: options.tone ?? 'default', action: options.action };
    // Newest last; at most three on screen.
    set((s) => ({ toasts: [...s.toasts, toast].slice(-3) }));
    setTimeout(() => get().dismiss(id), options.durationMs ?? 8000);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Shorthand for components outside React's render (mutation callbacks). */
export const toast = (...args: Parameters<ToastState['show']>) => useToastStore.getState().show(...args);
