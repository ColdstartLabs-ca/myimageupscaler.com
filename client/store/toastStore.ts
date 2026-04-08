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

export const TOAST_DUPLICATE_COOLDOWN_MS = 4000;

const recentToastTimestamps = new Map<string, number>();

function getToastKey(toast: Pick<IToast, 'message' | 'type'>): string {
  return `${toast.type}:${toast.message}`;
}

export function resetToastDeduplication(): void {
  recentToastTimestamps.clear();
}

export const useToastStore = create<IToastState>(set => ({
  toasts: [],
  showToast: (toast: IToast) => {
    const id = Math.random().toString(36).substring(7);
    const duration = toast.duration || 3000;
    const now = Date.now();
    const toastKey = getToastKey(toast);
    let wasAdded = false;

    set(state => {
      const hasActiveDuplicate = state.toasts.some(
        existing => existing.message === toast.message && existing.type === toast.type
      );
      const lastShownAt = recentToastTimestamps.get(toastKey);
      const isInCooldown =
        typeof lastShownAt === 'number' && now - lastShownAt < TOAST_DUPLICATE_COOLDOWN_MS;

      if (hasActiveDuplicate || isInCooldown) {
        return state;
      }

      recentToastTimestamps.set(toastKey, now);
      wasAdded = true;

      return {
        toasts: [...state.toasts, { ...toast, id }],
      };
    });

    if (!wasAdded) {
      return;
    }

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
