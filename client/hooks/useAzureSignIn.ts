import { useState } from 'react';
import { supabase } from '@server/supabase/supabaseClient';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';

export const useAzureSignIn = (): { signIn: () => Promise<void>; loading: boolean } => {
  const { showToast } = useToastStore();
  const { open } = useModalStore();
  const [loading, setLoading] = useState(false);

  const signIn = async (): Promise<void> => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email openid profile User.Read',
          redirectTo: window.location.origin,
          queryParams: {
            response_type: 'code',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        console.error('Azure sign-in error:', error);
        showToast({ message: error.message || 'An error occurred during sign in.', type: 'error' });
        open('authenticationModal');
      }
    } catch (error) {
      console.error('Unexpected error during Azure sign-in:', error);
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
