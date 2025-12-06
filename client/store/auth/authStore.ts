import { create } from 'zustand';
import { createClient } from '@shared/utils/supabase/client';
import { createAuthStateHandler } from './authStateHandler';
import {
  createSignInWithEmail,
  createSignUpWithEmail,
  createSignOut,
  createInitializeAuth,
  createChangePassword,
  createResetPassword,
  createUpdatePassword,
} from './authOperations';
import type { IAuthState } from './types';

// Single browser client instance
const supabase = createClient();

export const useAuthStore = create<IAuthState>((set, get) => {
  // Create operation handlers with access to set/get
  const setState = (state: Partial<IAuthState>) => set(state);
  const getState = () => get();

  // Add a fallback timeout to prevent infinite loading
  setTimeout(() => {
    const currentState = useAuthStore.getState();
    if (currentState.isLoading) {
      console.warn('Auth initialization taking too long, setting isLoading to false');
      setState({ isLoading: false });
    }
  }, 6000); // 6 seconds fallback

  return {
    // Initial state
    isAuthenticated: false,
    isLoading: true,
    user: null,

    // Simple state setters
    setAuthenticated: value => set({ isAuthenticated: value }),
    setLoading: value => set({ isLoading: value }),
    setUser: user => set({ user, isAuthenticated: !!user }),
    logout: () => set({ user: null, isAuthenticated: false }),

    // Auth operations
    signInWithEmail: createSignInWithEmail(supabase, setState),
    signUpWithEmail: createSignUpWithEmail(supabase),
    signOut: createSignOut(supabase, setState),
    initializeAuth: createInitializeAuth(supabase, setState),

    // Password operations
    changePassword: createChangePassword(supabase, getState),
    resetPassword: createResetPassword(supabase),
    updatePassword: createUpdatePassword(supabase),
  };
});

// IMPORTANT: Set up auth state listener BEFORE initializing auth
// This prevents a race condition where getSession returns a session
// but onAuthStateChange isn't registered yet to handle it
const authStateHandler = createAuthStateHandler(
  supabase,
  () => useAuthStore.getState(),
  state => useAuthStore.setState(state)
);
supabase.auth.onAuthStateChange(authStateHandler);

// Now initialize auth state (getSession will trigger onAuthStateChange)
useAuthStore.getState().initializeAuth();

// Selector hook for checking admin role
export const useIsAdmin = (): boolean => useAuthStore(state => state.user?.role === 'admin');
