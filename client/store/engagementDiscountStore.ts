/**
 * Engagement Discount Store
 *
 * Zustand store for managing the engagement-based first-purchase discount state.
 * Tracks engagement signals, eligibility status, and toast visibility.
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { IEngagementSignals, IDiscountOffer } from '@shared/types/engagement-discount';
import {
  createEmptyEngagementSignals,
  ENGAGEMENT_DISCOUNT_CONFIG,
} from '@shared/config/engagement-discount';

/**
 * Store state interface.
 */
export interface IEngagementDiscountState {
  /** Current session engagement signals */
  signals: IEngagementSignals;
  /** Whether eligibility has been checked this session */
  hasCheckedEligibility: boolean;
  /** Whether the user is eligible for the discount */
  isEligible: boolean;
  /** Whether the toast is currently visible */
  showToast: boolean;
  /** Current discount offer, if any */
  offer: IDiscountOffer | null;
  /** Whether the toast was dismissed this session */
  wasDismissed: boolean;
  /** Countdown end time (timestamp in ms) */
  countdownEndTime: number | null;
  /** Whether the toast_shown impression has been tracked this session */
  hasTrackedImpression: boolean;
  /** Source that triggered the discount offer ('engagement' | 'abandonment') */
  discountSource: 'engagement' | 'abandonment';

  // Actions
  setSignals: (
    signals: IEngagementSignals | ((prev: IEngagementSignals) => IEngagementSignals)
  ) => void;
  setHasCheckedEligibility: (checked: boolean) => void;
  setIsEligible: (eligible: boolean) => void;
  setShowToast: (show: boolean) => void;
  setOffer: (offer: IDiscountOffer | null) => void;
  setWasDismissed: (dismissed: boolean) => void;
  setCountdownEndTime: (time: number | null) => void;
  setHasTrackedImpression: (tracked: boolean) => void;
  setDiscountSource: (source: 'engagement' | 'abandonment') => void;
  dismissToast: () => void;
  reset: () => void;
}

/**
 * Initial state.
 */
const initialState = {
  signals: createEmptyEngagementSignals(),
  hasCheckedEligibility: false,
  isEligible: false,
  showToast: false,
  offer: null,
  wasDismissed: false,
  countdownEndTime: null,
  hasTrackedImpression: false,
  discountSource: 'engagement' as const,
};

/**
 * Engagement discount store.
 *
 * Uses zustand with sessionStorage persistence for offer data (to survive page refresh)
 * but keeps signals in memory only (session-based).
 */
export const useEngagementDiscountStore = create<IEngagementDiscountState>()(
  persist(
    set => ({
      ...initialState,

      setSignals: updater =>
        set(state => ({
          signals: typeof updater === 'function' ? updater(state.signals) : updater,
        })),

      setHasCheckedEligibility: checked => set({ hasCheckedEligibility: checked }),

      setIsEligible: eligible => set({ isEligible: eligible }),

      setShowToast: show => set({ showToast: show }),

      setOffer: offer => set({ offer }),

      setWasDismissed: dismissed => set({ wasDismissed: dismissed }),

      setCountdownEndTime: time => set({ countdownEndTime: time }),

      setHasTrackedImpression: tracked => set({ hasTrackedImpression: tracked }),

      setDiscountSource: source => set({ discountSource: source }),

      dismissToast: () =>
        set({
          showToast: false,
          wasDismissed: true,
        }),

      reset: () => set(initialState),
    }),
    {
      name: ENGAGEMENT_DISCOUNT_CONFIG.offerKey,
      storage: createJSONStorage(() => sessionStorage),
      partialize: state => ({
        // Only persist offer data and dismissal state
        offer: state.offer,
        wasDismissed: state.wasDismissed,
        countdownEndTime: state.countdownEndTime,
        hasCheckedEligibility: state.hasCheckedEligibility,
        hasTrackedImpression: state.hasTrackedImpression,
      }),
    }
  )
);

/**
 * Selector to check if the toast should be shown.
 * Toast is shown when:
 * - User is eligible
 * - Toast wasn't dismissed this session
 * - There's an active offer
 */
export const selectShouldShowToast = (state: IEngagementDiscountState): boolean => {
  return state.isEligible && !state.wasDismissed && state.offer !== null;
};

/**
 * Selector to get remaining time in seconds.
 */
export const selectRemainingSeconds = (state: IEngagementDiscountState): number => {
  if (!state.countdownEndTime) return 0;
  return Math.max(0, Math.floor((state.countdownEndTime - Date.now()) / 1000));
};
