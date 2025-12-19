import type { ISubscription, IUserProfile } from '@/shared/types/stripe.types';
import { TIMEOUTS } from '@shared/config/timeouts.config';
import { createClient } from '@shared/utils/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { handlePostAuthRedirect } from './auth/postAuthRedirect';

// Cache keys
const USER_CACHE_KEY = 'pixelperfect_user_cache';
const CACHE_VERSION = 1;
const CACHE_MAX_AGE = TIMEOUTS.CACHE_MEDIUM_TTL; // 5 minutes

interface IUserCache {
  version: number;
  timestamp: number;
  user: IUserData | null;
}

interface IUserData {
  id: string;
  email: string;
  name?: string;
  provider: string;
  role: 'user' | 'admin';
  profile: IUserProfile | null;
  subscription: ISubscription | null;
}

export interface IUserState {
  // State
  user: IUserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  // Actions
  initialize: () => Promise<void>;
  fetchUserData: (userId: string) => Promise<void>;
  invalidate: () => void;
  reset: () => void;
  updateCreditsFromProcessing: (creditsRemaining: number) => void;

  // Auth operations (delegated to Supabase)
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<{ emailConfirmationRequired: boolean }>;
  signOut: () => Promise<void>;

  // Password operations
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const supabase = createClient();

// In-flight request deduplication
let fetchPromise: Promise<void> | null = null;

// Set to true when user actively logs in/signs up (not on page refresh)
let shouldRedirectToDashboard = false;

/** Mark that user should be redirected after auth completes */
function enablePostAuthRedirect(): void {
  shouldRedirectToDashboard = true;
}

export const useUserStore = create<IUserState>((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  lastFetched: null,

  initialize: async () => {
    // Load cache first for instant UI
    const cached = loadUserCache();
    if (cached) {
      set({
        user: cached,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      // No cache = likely unauthenticated, show UI immediately
      set({ isLoading: false });
    }

    // Auth state change handler does the real work
    // (registered at module level below)
  },

  fetchUserData: async (userId: string) => {
    // Dedupe concurrent requests
    if (fetchPromise) {
      await fetchPromise;
      return;
    }

    fetchPromise = (async () => {
      try {
        // Add timeout to prevent hanging forever
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('RPC timeout after 5s')), 5000);
        });

        const rpcPromise = supabase.rpc('get_user_data', {
          target_user_id: userId,
        });

        const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

        if (error) throw error;

        const currentUser = get().user;
        if (currentUser) {
          const updatedUser: IUserData = {
            ...currentUser,
            profile: data?.profile ?? null,
            subscription: data?.subscription ?? null,
            role: data?.profile?.role ?? 'user',
          };
          set({
            user: updatedUser,
            lastFetched: Date.now(),
            error: null,
          });
          saveUserCache(updatedUser);
        }
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        set({ error: err instanceof Error ? err.message : 'Failed to load user data' });
      } finally {
        fetchPromise = null;
      }
    })();

    await fetchPromise;
  },

  invalidate: () => {
    set({ lastFetched: null });
    const userId = get().user?.id;
    if (userId) {
      get().fetchUserData(userId);
    }
  },

  reset: () => {
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      lastFetched: null,
    });
    clearUserCache();
  },

  updateCreditsFromProcessing: (creditsRemaining: number) => {
    const currentUser = get().user;
    if (!currentUser?.profile) return;

    const currentTotal =
      (currentUser.profile.subscription_credits_balance ?? 0) +
      (currentUser.profile.purchased_credits_balance ?? 0);
    const creditsDelta = creditsRemaining - currentTotal;

    // If credits decreased, deduct from subscription first (FIFO), then purchased
    // If credits increased (refund), add back proportionally
    let newSubscriptionBalance = currentUser.profile.subscription_credits_balance ?? 0;
    let newPurchasedBalance = currentUser.profile.purchased_credits_balance ?? 0;

    if (creditsDelta < 0) {
      // Credits were consumed
      const consumed = Math.abs(creditsDelta);
      const fromSubscription = Math.min(newSubscriptionBalance, consumed);
      const fromPurchased = consumed - fromSubscription;
      newSubscriptionBalance -= fromSubscription;
      newPurchasedBalance -= fromPurchased;
    } else if (creditsDelta > 0) {
      // Credits were refunded - add to purchased balance
      newPurchasedBalance += creditsDelta;
    }

    const updatedUser: IUserData = {
      ...currentUser,
      profile: {
        ...currentUser.profile,
        subscription_credits_balance: newSubscriptionBalance,
        purchased_credits_balance: newPurchasedBalance,
      },
    };

    set({ user: updatedUser });
    saveUserCache(updatedUser);
  },

  signInWithEmail: async (email, password) => {
    enablePostAuthRedirect();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUpWithEmail: async (email, password) => {
    enablePostAuthRedirect();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) throw error;
    return { emailConfirmationRequired: !!data.user && !data.session };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // Auth state change listener will call reset()
  },

  changePassword: async (currentPassword, newPassword) => {
    const currentUser = get().user;
    if (!currentUser?.email) {
      throw new Error('No authenticated user found');
    }

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (signInError) throw signInError;

    // Update to new password
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  resetPassword: async email => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw error;
  },

  updatePassword: async newPassword => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
}));

// Cache helpers
function loadUserCache(): IUserData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const cache: IUserCache = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) return null;
    if (Date.now() - cache.timestamp > CACHE_MAX_AGE) return null;
    return cache.user;
  } catch {
    return null;
  }
}

function saveUserCache(user: IUserData): void {
  if (typeof window === 'undefined') return;
  try {
    const cache: IUserCache = { version: CACHE_VERSION, timestamp: Date.now(), user };
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Fail silently
  }
}

function clearUserCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Fail silently
  }
}

// Only run client-side initialization
if (typeof window !== 'undefined') {
  // Auth state listener (single source of truth)
  supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    const store = useUserStore.getState();

    if (event === 'SIGNED_OUT' || !session) {
      store.reset();
      return;
    }

    if (session?.user) {
      // Set basic user info immediately
      const basicUser: IUserData = {
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.user_metadata?.name,
        provider: session.user.app_metadata?.provider ?? 'email',
        role: 'user', // Default, will be updated
        profile: null,
        subscription: null,
      };

      // NON-BLOCKING: Show UI immediately with basic user data
      useUserStore.setState({
        user: basicUser,
        isAuthenticated: true,
        isLoading: false, // Don't block UI!
      });

      // Fetch full data in background (non-blocking)
      // Use setTimeout to defer to next tick, avoiding HMR timing issues
      setTimeout(() => {
        store.fetchUserData(session.user.id).catch(err => {
          console.error('Background fetch failed:', err);
        });
      }, 0);

      // Redirect to dashboard for active login/signup (email/password only)
      // OAuth redirects directly to /dashboard via redirectTo option
      if (shouldRedirectToDashboard) {
        shouldRedirectToDashboard = false;
        handlePostAuthRedirect();
      }
    }
  });

  // Initialize on module load (client-side only)
  useUserStore.getState().initialize();
}

// Convenience hooks - use useShallow for object selectors to prevent infinite loops
export const useCredits = (): {
  total: number;
  subscription: number;
  purchased: number;
} =>
  useUserStore(
    useShallow(state => ({
      total:
        (state.user?.profile?.subscription_credits_balance ?? 0) +
        (state.user?.profile?.purchased_credits_balance ?? 0),
      subscription: state.user?.profile?.subscription_credits_balance ?? 0,
      purchased: state.user?.profile?.purchased_credits_balance ?? 0,
    }))
  );

export const useIsAdmin = (): boolean => useUserStore(state => state.user?.role === 'admin');

export const useSubscription = (): ISubscription | null =>
  useUserStore(state => state.user?.subscription ?? null);

export const useProfile = (): IUserProfile | null =>
  useUserStore(state => state.user?.profile ?? null);

// Combined selector for components that need multiple values
export const useUserData = (): {
  totalCredits: number;
  profile: IUserProfile | null;
  subscription: ISubscription | null;
  isAuthenticated: boolean;
} =>
  useUserStore(
    useShallow(state => ({
      totalCredits:
        (state.user?.profile?.subscription_credits_balance ?? 0) +
        (state.user?.profile?.purchased_credits_balance ?? 0),
      profile: state.user?.profile ?? null,
      subscription: state.user?.subscription ?? null,
      isAuthenticated: state.isAuthenticated,
    }))
  );
