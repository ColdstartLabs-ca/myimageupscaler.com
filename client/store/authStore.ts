import { create } from 'zustand';
import { createClient } from '@shared/utils/supabase/client';
import { AuthProvider } from '@shared/types/authProviders';
import { loadingStore } from '@client/store/loadingStore';

// Helper function to handle checkout redirect after authentication
const handleCheckoutRedirect = async () => {
  if (typeof window === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);
  const checkoutPriceId = urlParams.get('checkout_price');

  if (checkoutPriceId) {
    // Handle pending subscription checkout - redirect to Stripe
    // Clean up URL params
    urlParams.delete('checkout_price');
    const cleanUrl = urlParams.toString()
      ? `${window.location.pathname}?${urlParams.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    // Redirect to Stripe checkout (subscription-only)
    try {
      const { StripeService } = await import('@server/stripe/stripeService');
      await StripeService.redirectToCheckout(checkoutPriceId, {
        successUrl: `${window.location.origin}/success`,
        cancelUrl: window.location.href,
      });
    } catch (error) {
      console.error('Error processing checkout:', error);
      window.location.href = '/dashboard';
    }
    return true; // Indicates that a redirect is happening
  }

  return false; // No checkout redirect needed
};

// Create a single browser client instance for the auth store
const supabase = createClient();

interface IAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: null | {
    email: string;
    name?: string;
    provider?: AuthProvider;
  };
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setUser: (user: IAuthState['user']) => void;
  logout: () => void;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

export const useAuthStore = create<IAuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  setAuthenticated: value => set({ isAuthenticated: value }),
  setLoading: value => set({ isLoading: value }),
  setUser: user => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
  signInWithEmail: async (email, password) => {
    try {
      loadingStore.getState().setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        set({
          user: {
            email: data.user.email || '',
            name: data.user.user_metadata?.name,
            provider: AuthProvider.EMAIL,
          },
          isAuthenticated: true,
          isLoading: false,
        });
      }
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
  signUpWithEmail: async (email, password) => {
    try {
      loadingStore.getState().setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      if (!data.user?.identities?.length) {
        throw new Error('An account with this email already exists');
      }

      // For email signup, user needs to confirm email first
      // Don't set as authenticated yet - the onAuthStateChange handler will handle it
      // after email confirmation
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
  signOut: async () => {
    try {
      loadingStore.getState().setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error && !error.message?.includes('Auth session missing')) {
        throw error;
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      throw error;
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
  initializeAuth: async () => {
    try {
      loadingStore.getState().setLoading(true);

      // Add a timeout to prevent infinite loading in test environments
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Auth initialization timeout')), 5000);
      });

      const sessionPromise = supabase.auth.getSession();

      const { data: { session }, error: sessionError } = await Promise.race([sessionPromise, timeoutPromise]) as { data: { session: { user: { id: string; email: string; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown> } } | null }; error: Error | null };

      // Handle refresh token errors by clearing the session
      if (sessionError && sessionError.message?.includes('refresh_token_not_found')) {
        await supabase.auth.signOut();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (session?.user) {
        // Determine the auth provider consistently
        const providers = session.user.app_metadata?.providers as string[] | undefined;
        const primaryProvider = session.user.app_metadata?.provider as string | undefined;

        let provider: AuthProvider;
        if (primaryProvider === 'email' || (providers?.length === 1 && providers[0] === 'email')) {
          provider = AuthProvider.EMAIL;
        } else {
          const oauthProvider = primaryProvider || providers?.find((p: string) => p !== 'email');
          provider = (oauthProvider as AuthProvider) || AuthProvider.EMAIL;
        }

        set({
          user: {
            email: session.user.email || '',
            name: session.user.user_metadata?.name as string | undefined,
            provider: provider,
          },
          isAuthenticated: true,
          isLoading: false,
        });
      }
      set({ isLoading: false });
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ isLoading: false, user: null, isAuthenticated: false });
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
  changePassword: async (currentPassword, newPassword) => {
    try {
      loadingStore.getState().setLoading(true);
      const currentUser = get().user;
      if (!currentUser?.email) {
        throw new Error('No authenticated user found');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword,
      });

      if (signInError) throw signInError;

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
  resetPassword: async (email: string) => {
    try {
      loadingStore.getState().setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
  updatePassword: async (newPassword: string) => {
    try {
      loadingStore.getState().setLoading(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    } finally {
      loadingStore.getState().setLoading(false);
    }
  },
}));

// Initialize auth state when the store is created
useAuthStore.getState().initializeAuth();

// Listen for auth changes
supabase.auth.onAuthStateChange(async (event, session) => {
  // Handle sign out or token expired events
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    return;
  }

  if (session?.user) {
    // Determine the auth provider
    // For email/password users, app_metadata.provider is 'email'
    // For OAuth users (google, azure, facebook), it's the OAuth provider name
    // The providers array may contain both 'email' and the OAuth provider for linked accounts
    const providers = session.user.app_metadata?.providers as string[] | undefined;
    const primaryProvider = session.user.app_metadata?.provider as string | undefined;

    // Use the primary provider first, or check if it's an email-only user
    let provider: AuthProvider;
    if (primaryProvider === 'email' || (providers?.length === 1 && providers[0] === 'email')) {
      provider = AuthProvider.EMAIL;
    } else {
      // For OAuth users, use the primary provider or first non-email provider
      const oauthProvider = primaryProvider || providers?.find((p: string) => p !== 'email');
      provider = (oauthProvider as AuthProvider) || AuthProvider.EMAIL;
    }

    const wasAuthenticated = useAuthStore.getState().isAuthenticated;

    useAuthStore.setState({
      user: {
        email: session.user.email || '',
        name: session.user.user_metadata?.name,
        provider: provider,
      },
      isAuthenticated: true,
      isLoading: false,
    });

    // Handle post-authentication actions
    if (event === 'SIGNED_IN' && !wasAuthenticated && typeof window !== 'undefined') {
      // Check for pending checkout from the checkout store
      const { useCheckoutStore } = await import('./checkoutStore');
      const hasPendingCheckout = useCheckoutStore.getState().processPendingCheckout();

      // If there's a pending checkout, don't redirect - let the checkout modal handle it
      if (hasPendingCheckout) {
        return;
      }

      // Check for URL-based checkout redirect
      if (!window.location.pathname.startsWith('/dashboard')) {
        const isRedirecting = await handleCheckoutRedirect();
        if (!isRedirecting) {
          window.location.href = '/dashboard';
        }
      }
    }
  } else {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }
});
