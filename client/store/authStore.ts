import { create } from 'zustand';
import { supabase } from '@server/supabase/supabaseClient';
import { AuthProvider } from '@shared/types/authProviders';
import { loadingStore } from '@client/store/loadingStore';

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const provider = session.user.app_metadata?.provider;
        set({
          user: {
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
            provider: provider as AuthProvider,
          },
          isAuthenticated: true,
          isLoading: false,
        });
      }
      set({ isLoading: false });
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ isLoading: false });
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
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    // I had to do this because the azure provider was returning an array with the 'email' field, confusing the type inference
    const cleanedUpProvidersArray = session.user.app_metadata?.providers.filter(
      (elm: string) => elm !== 'email'
    );

    console.log('session', session);
    const provider = cleanedUpProvidersArray[0] as AuthProvider;
    const wasAuthenticated = useAuthStore.getState().isAuthenticated;

    useAuthStore.setState({
      user: {
        email: session.user.email || '',
        name: session.user.user_metadata?.name,
        provider: provider as AuthProvider,
      },
      isAuthenticated: true,
      isLoading: false,
    });

    // Redirect to dashboard only on fresh sign in (not token refresh or if already on dashboard)
    if (
      event === 'SIGNED_IN' &&
      !wasAuthenticated &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/dashboard')
    ) {
      window.location.href = '/dashboard';
    }
  } else {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }
});
