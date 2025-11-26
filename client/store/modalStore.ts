import { create } from 'zustand';

interface IModalStore {
  isOpen: boolean;
  modalId: string | null;
  open: (modalId: string) => void;
  close: () => void;
  isModalOpen: (modalId: string) => boolean;
}

export const useModalStore = create<IModalStore>((set, get) => ({
  isOpen: false,
  modalId: null,
  open: (modalId: string) => set({ isOpen: true, modalId }),
  close: () => set({ isOpen: false, modalId: null }),
  isModalOpen: (modalId: string) => get().isOpen && get().modalId === modalId,
}));
