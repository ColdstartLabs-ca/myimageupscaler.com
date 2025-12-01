import { useState } from 'react';
import { createClient } from '@shared/utils/supabase/client';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';

export const useGoogleSignIn = (): { signIn: () => Promise<void>; loading: boolean } => {
  const { showToast } = useToastStore();
  const { openAuthModal } = useModalStore();
  const [loading, setLoading] = useState(false);

  const signIn = async (): Promise<void> => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          scopes: 'email profile',
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        console.error('Google sign-in error:', error);
        showToast({ message: error.message || 'An error occurred during sign in.', type: 'error' });
        openAuthModal('login');
      }
    } catch (error) {
      console.error('Unexpected error during Google sign-in:', error);
      showToast({
        message: error instanceof Error ? error.message : 'An unexpected error occurred.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return { signIn, loading };
};
