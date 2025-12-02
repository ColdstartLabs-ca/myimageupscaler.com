import { create } from 'zustand';

interface ICheckoutState {
  pendingPriceId: string | null;
  isCheckoutModalOpen: boolean;
  activePriceId: string | null;

  // Actions
  setPendingCheckout: (priceId: string) => void;
  clearPendingCheckout: () => void;
  openCheckoutModal: (priceId: string) => void;
  closeCheckoutModal: () => void;

  // Helper to process pending checkout after auth
  processPendingCheckout: () => boolean;
}

export const useCheckoutStore = create<ICheckoutState>((set, get) => ({
  pendingPriceId: null,
  isCheckoutModalOpen: false,
  activePriceId: null,

  setPendingCheckout: (priceId: string) => {
    set({ pendingPriceId: priceId });
  },

  clearPendingCheckout: () => {
    set({ pendingPriceId: null });
  },

  openCheckoutModal: (priceId: string) => {
    set({
      isCheckoutModalOpen: true,
      activePriceId: priceId,
      pendingPriceId: null // Clear pending since we're opening it
    });
  },

  closeCheckoutModal: () => {
    set({
      isCheckoutModalOpen: false,
      activePriceId: null
    });
  },

  processPendingCheckout: () => {
    const { pendingPriceId } = get();
    if (pendingPriceId) {
      get().openCheckoutModal(pendingPriceId);
      return true;
    }
    return false;
  },
}));
