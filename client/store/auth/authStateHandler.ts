import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { createUserFromSession } from './authUtils';
import { handlePostAuthRedirect } from './postAuthRedirect';
import { saveAuthCache } from './authCache';
import type { IAuthState } from './types';

const PROFILE_FETCH_TIMEOUT = 1500; // Reduced from 3000ms

/**
 * Fetches the user role from the profiles table.
 * This runs in the background and doesn't block UI rendering.
 */
async function fetchUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<'user' | 'admin'> {
  try {
    const profilePromise = supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    const profileTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Profile fetch timeout')), PROFILE_FETCH_TIMEOUT);
    });

    const { data } = await Promise.race([profilePromise, profileTimeout]);
    return data?.role || 'user';
  } catch (error) {
    console.warn('Failed to fetch user profile role:', error);
    return 'user';
  }
}

/**
 * Updates user state with fetched role and saves to cache.
 * This is non-blocking - called after initial user state is set.
 */
async function updateUserRole(
  supabase: SupabaseClient,
  session: Session,
  setState: (state: Partial<IAuthState>) => void
): Promise<void> {
  const role = await fetchUserRole(supabase, session.user.id);
  const updatedUser = createUserFromSession(session, role);
  setState({ user: updatedUser });
  saveAuthCache(updatedUser);
}

/**
 * Handles sign out or token expiry events.
 */
function handleSignOut(
  setState: (state: Partial<IAuthState>) => void
): void {
  setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  saveAuthCache(null);
}

/**
 * Handles user session events (sign in, token refresh with valid session).
 * NOW NON-BLOCKING: Sets user state immediately with default role,
 * then fetches actual role in background.
 */
async function handleUserSession(
  supabase: SupabaseClient,
  session: Session,
  event: AuthChangeEvent,
  getState: () => IAuthState,
  setState: (state: Partial<IAuthState>) => void
): Promise<void> {
  const wasAuthenticated = getState().isAuthenticated;

  // IMMEDIATE: Set user with default 'user' role to unblock UI rendering
  const userWithDefaultRole = createUserFromSession(session, 'user');
  setState({
    user: userWithDefaultRole,
    isAuthenticated: true,
    isLoading: false,
  });

  // BACKGROUND: Fetch actual role and update (non-blocking)
  updateUserRole(supabase, session, setState);

  // Handle post-auth actions for new sign-ins
  if (event === 'SIGNED_IN' && !wasAuthenticated && typeof window !== 'undefined') {
    await handlePostAuthRedirect();
  }
}

/**
 * Creates the auth state change handler for Supabase.
 */
export function createAuthStateHandler(
  supabase: SupabaseClient,
  getState: () => IAuthState,
  setState: (state: Partial<IAuthState>) => void
): (event: AuthChangeEvent, session: Session | null) => Promise<void> {
  return async (event: AuthChangeEvent, session: Session | null) => {
    // Handle sign out or token expired
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      handleSignOut(setState);
      return;
    }

    // Handle valid user session
    if (session?.user) {
      await handleUserSession(supabase, session, event, getState, setState);
    } else {
      handleSignOut(setState);
    }
  };
}
