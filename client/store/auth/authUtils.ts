import { AuthProvider } from '@/shared/types/authProviders.types';
import type { Session } from '@supabase/supabase-js';

/**
 * Determines the auth provider from a Supabase session.
 * For email/password users, app_metadata.provider is 'email'.
 * For OAuth users (google, azure, facebook), it's the OAuth provider name.
 */
export function getAuthProvider(session: Session): AuthProvider {
  const providers = session.user.app_metadata?.providers as string[] | undefined;
  const primaryProvider = session.user.app_metadata?.provider as string | undefined;

  // Email-only user
  if (primaryProvider === 'email' || (providers?.length === 1 && providers[0] === 'email')) {
    return AuthProvider.EMAIL;
  }

  // OAuth user - use the primary provider or first non-email provider
  const oauthProvider = primaryProvider || providers?.find((p: string) => p !== 'email');
  return (oauthProvider as AuthProvider) || AuthProvider.EMAIL;
}

/**
 * Creates a user object from a Supabase session.
 */
export function createUserFromSession(
  session: Session,
  role: 'user' | 'admin' = 'user'
): {
  email: string;
  name?: string;
  provider: AuthProvider;
  role: 'user' | 'admin';
} {
  return {
    email: session.user.email || '',
    name: session.user.user_metadata?.name,
    provider: getAuthProvider(session),
    role,
  };
}
