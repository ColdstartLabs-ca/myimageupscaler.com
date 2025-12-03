import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthProvider } from '@shared/types/authProviders';
import { loadingStore } from '@client/store/loadingStore';
import { loadAuthCache, saveAuthCache, clearAuthCache } from './authCache';
import type { IAuthState, IAuthUser } from './types';

const AUTH_INIT_TIMEOUT = 2000; // Reduced from 5000ms

/**
 * Wrapper that handles loading state for async operations.
 */
async function withLoading<T>(operation: () => Promise<T>): Promise<T> {
  try {
    loadingStore.getState().setLoading(true);
    return await operation();
  } finally {
    loadingStore.getState().setLoading(false);
  }
}

/**
 * Creates the signInWithEmail action.
 */
export function createSignInWithEmail(
  supabase: SupabaseClient,
  setState: (state: Partial<IAuthState>) => void
): (email: string, password: string) => Promise<void> {
  return async (email: string, password: string) => {
    await withLoading(async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        const user: IAuthUser = {
          email: data.user.email || '',
          name: data.user.user_metadata?.name,
          provider: AuthProvider.EMAIL,
        };
        setState({ user, isAuthenticated: true, isLoading: false });
        saveAuthCache(user);
      }
    });
  };
}

/**
 * Creates the signUpWithEmail action.
 */
export function createSignUpWithEmail(
  supabase: SupabaseClient
): (email: string, password: string) => Promise<void> {
  return async (email: string, password: string) => {
    await withLoading(async () => {
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
      // User needs to confirm email first - onAuthStateChange handles post-confirmation
    });
  };
}

/**
 * Creates the signOut action.
 */
export function createSignOut(
  supabase: SupabaseClient,
  setState: (state: Partial<IAuthState>) => void
): () => Promise<void> {
  return async () => {
    try {
      loadingStore.getState().setLoading(true);
      const { error } = await supabase.auth.signOut();

      // Ignore "Auth session missing" error as it's expected in some cases
      if (error && !error.message?.includes('Auth session missing')) {
        throw error;
      }

      setState({ user: null, isAuthenticated: false, isLoading: false });
      clearAuthCache();
    } catch (error) {
      setState({ user: null, isAuthenticated: false, isLoading: false });
      clearAuthCache();
      throw error;
    } finally {
      loadingStore.getState().setLoading(false);
    }
  };
}

/**
 * Creates the initializeAuth action.
 * Handles error cases and refresh token issues.
 * NOW WITH CACHING: Immediately loads cached state for instant UI,
 * then validates with server in background.
 */
export function createInitializeAuth(
  supabase: SupabaseClient,
  setState: (state: Partial<IAuthState>) => void
): () => Promise<void> {
  return async () => {
    try {
      // INSTANT: Load from cache first (< 1ms)
      const cachedUser = loadAuthCache();
      if (cachedUser) {
        setState({
          user: cachedUser,
          isAuthenticated: true,
          isLoading: false, // UI can render immediately!
        });
      }

      // BACKGROUND: Validate session with server (still needed for security)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Auth initialization timeout')), AUTH_INIT_TIMEOUT);
      });

      const sessionPromise = supabase.auth.getSession();

      const {
        data: { session },
        error: sessionError,
      } = (await Promise.race([sessionPromise, timeoutPromise])) as {
        data: { session: { user: { id: string } } | null };
        error: Error | null;
      };

      // Handle refresh token errors
      if (sessionError?.message?.includes('refresh_token_not_found')) {
        await supabase.auth.signOut();
        setState({ user: null, isAuthenticated: false, isLoading: false });
        clearAuthCache();
        return;
      }

      // No session - clear cache and state
      if (!session?.user) {
        setState({ isLoading: false, user: null, isAuthenticated: false });
        clearAuthCache();
      }
      // If session exists, onAuthStateChange handles setting user state
    } catch (error) {
      console.error('Error initializing auth:', error);
      setState({ isLoading: false, user: null, isAuthenticated: false });
      clearAuthCache();
    }
  };
}

/**
 * Creates the changePassword action.
 */
export function createChangePassword(
  supabase: SupabaseClient,
  getState: () => IAuthState
): (currentPassword: string, newPassword: string) => Promise<void> {
  return async (currentPassword: string, newPassword: string) => {
    await withLoading(async () => {
      const currentUser = getState().user;
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
    });
  };
}

/**
 * Creates the resetPassword action.
 */
export function createResetPassword(
  supabase: SupabaseClient
): (email: string) => Promise<void> {
  return async (email: string) => {
    await withLoading(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;
    });
  };
}

/**
 * Creates the updatePassword action.
 */
export function createUpdatePassword(
  supabase: SupabaseClient
): (newPassword: string) => Promise<void> {
  return async (newPassword: string) => {
    await withLoading(async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    });
  };
}
