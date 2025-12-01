import { create } from 'zustand';

// Auth modal view types
export type AuthModalView =
  | 'login'
  | 'register'
  | 'changePassword'
  | 'forgotPassword'
  | 'setNewPassword';

interface IModalStore {
  isOpen: boolean;
  modalId: string | null;
  // Auth modal specific state
  authModalView: AuthModalView;
  open: (modalId: string) => void;
  close: () => void;
  isModalOpen: (modalId: string) => boolean;
  // Auth modal specific actions
  setAuthModalView: (view: AuthModalView) => void;
  openAuthModal: (view: AuthModalView) => void;
}

export const useModalStore = create<IModalStore>((set, get) => ({
  isOpen: false,
  modalId: null,
  authModalView: 'login',
  open: (modalId: string) => set({ isOpen: true, modalId }),
  close: () => {
    set({ isOpen: false, modalId: null });
    // Reset auth modal view after close animation completes
    setTimeout(() => {
      set({ authModalView: 'login' });
    }, 250);
  },
  isModalOpen: (modalId: string) => get().isOpen && get().modalId === modalId,
  setAuthModalView: (view: AuthModalView) => set({ authModalView: view }),
  openAuthModal: (view: AuthModalView) =>
    set({ isOpen: true, modalId: 'authenticationModal', authModalView: view }),
}));
