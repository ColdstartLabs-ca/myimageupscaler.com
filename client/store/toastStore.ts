import { create } from 'zustand';

interface IToast {
  id?: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export interface IToastState {
  toasts: IToast[];
  showToast: (toast: IToast) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<IToastState>(set => ({
  toasts: [],
  showToast: (toast: IToast) => {
    const id = Math.random().toString(36).substring(7);
    const duration = toast.duration || 3000;

    set(state => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    setTimeout(() => {
      set(state => ({
        toasts: state.toasts.filter(t => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id: string) =>
    set(state => ({
      toasts: state.toasts.filter(toast => toast.id !== id),
    })),
}));
