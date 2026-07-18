import { AuthProvider } from '@/shared/types/authProviders.types';

export interface IAuthUser {
  email: string;
  name?: string;
  provider?: AuthProvider;
  role?: 'user' | 'admin';
}

export interface ISignUpResult {
  emailConfirmationRequired: boolean;
}

export interface IAuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: IAuthUser | null;

  // State setters
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setUser: (user: IAuthUser | null) => void;
  logout: () => void;

  // Auth operations
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<ISignUpResult>;
  signOut: () => Promise<void>;
  initializeAuth: () => Promise<void>;

  // Password operations
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}
