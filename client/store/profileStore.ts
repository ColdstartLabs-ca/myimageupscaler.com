/**
 * DEPRECATED: Re-export from unified user store.
 * This maintains backward compatibility with existing imports.
 * New code should import directly from '@client/store/userStore'.
 */
import { create } from 'zustand';
import { useUserStore } from './userStore';
import type { IUserProfile, ISubscription } from '@shared/types/stripe';

export interface IProfileState {
  profile: IUserProfile | null;
  subscription: ISubscription | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  // Actions
  fetchProfile: () => Promise<void>;
  invalidate: () => void;
  reset: () => void;
}

/**
 * DEPRECATED: Compatibility wrapper around userStore
 * Maintains the same API as the old profileStore for backward compatibility
 */
export const useProfileStore = create<IProfileState>(() => ({
  get profile() {
    return useUserStore.getState().user?.profile ?? null;
  },
  get subscription() {
    return useUserStore.getState().user?.subscription ?? null;
  },
  get isLoading() {
    return useUserStore.getState().isLoading;
  },
  get error() {
    return useUserStore.getState().error;
  },
  get lastFetched() {
    return useUserStore.getState().lastFetched;
  },
  fetchProfile: async () => {
    const userId = useUserStore.getState().user?.id;
    if (userId) {
      await useUserStore.getState().fetchUserData(userId);
    }
  },
  invalidate: () => {
    useUserStore.getState().invalidate();
  },
  reset: () => {
    // Profile reset is handled by userStore.reset()
    // Don't call it here to avoid double-reset
  },
}));
