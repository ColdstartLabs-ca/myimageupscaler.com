import { useState } from 'react';
import { supabase } from '@server/supabase/supabaseClient';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';

export const useFacebookSignIn = (): { signIn: () => Promise<void>; loading: boolean } => {
  const { showToast } = useToastStore();
  const { open } = useModalStore();
  const [loading, setLoading] = useState(false);

  const signIn = async (): Promise<void> => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        console.error('Facebook sign-in error:', error);
        showToast({ message: error.message || 'An error occurred during sign in.', type: 'error' });
        open('authenticationModal');
      }
    } catch (error) {
      console.error('Unexpected error during Facebook sign-in:', error);
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
