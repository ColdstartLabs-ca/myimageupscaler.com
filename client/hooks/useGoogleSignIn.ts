import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@shared/utils/supabase/client';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { handleAuthRedirect, setAuthIntent } from '@client/utils/authRedirectManager';
import { clientEnv } from '@shared/config/env';

// Type for Google's credential response
interface ICredentialResponse {
  credential: string;
  select_by: string;
}

// Generate nonce for security
async function generateNoncePayload(): Promise<{ nonce: string; hashedNonce: string }> {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const encoder = new TextEncoder();
  const encodedNonce = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { nonce, hashedNonce };
}

export const useGoogleSignIn = (): {
  signIn: (returnTo?: string) => Promise<void>;
  loading: boolean;
  isGisLoaded: boolean;
} => {
  const { showToast } = useToastStore();
  const { openAuthModal } = useModalStore();
  const [loading, setLoading] = useState(false);
  const [isGisLoaded, setIsGisLoaded] = useState(false);

  // Handle the credential response from Google
  const handleCredentialResponse = useCallback(
    async (response: ICredentialResponse, nonce: string) => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce,
        });

        if (error) {
          console.error('Supabase signInWithIdToken error:', error);
          showToast({ message: error.message || 'Sign in failed', type: 'error' });
          openAuthModal('login');
          return;
        }

        // Success - handle redirect
        await handleAuthRedirect();
      } catch (err) {
        console.error('Error during Google sign-in:', err);
        showToast({
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    },
    [showToast, openAuthModal]
  );

  // Initialize Google Identity Services
  useEffect(() => {
    const initGis = async () => {
      // Check if script is already loaded
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        setIsGisLoaded(true);
        return;
      }

      // Load the GIS script
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => setIsGisLoaded(true);
      script.onerror = () => console.error('Failed to load Google Identity Services');
      document.head.appendChild(script);
    };

    initGis();
  }, []);

  const signIn = useCallback(
    async (returnTo?: string): Promise<void> => {
      // Store return URL for after auth
      if (returnTo) {
        setAuthIntent({ action: 'oauth_complete', returnTo });
      }

      // Fallback to redirect OAuth if GIS not available
      if (!isGisLoaded || !window.google?.accounts?.id) {
        console.warn('GIS not loaded, falling back to redirect OAuth');
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`,
            scopes: 'email profile',
            queryParams: { access_type: 'offline', prompt: 'select_account' },
          },
        });
        if (error) {
          showToast({ message: error.message, type: 'error' });
        }
        return;
      }

      setLoading(true);

      try {
        const { nonce, hashedNonce } = await generateNoncePayload();

        // Initialize with the hashed nonce (Google expects hashed version)
        window.google.accounts.id.initialize({
          client_id: clientEnv.GOOGLE_CLIENT_ID,
          callback: (response: ICredentialResponse) => handleCredentialResponse(response, nonce),
          nonce: hashedNonce,
          use_fedcm_for_prompt: true,
          context: 'signin',
          ux_mode: 'popup',
        });

        // Trigger the One Tap / account chooser prompt
        window.google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; getNotDisplayedReason: () => string }) => {
          if (notification.isNotDisplayed()) {
            console.warn('Google One Tap not displayed:', notification.getNotDisplayedReason());
            // Fallback: try the standard button flow or redirect
            setLoading(false);
            // Could fallback to redirect here if needed
          }
        });
      } catch (err) {
        console.error('Error initializing Google sign-in:', err);
        setLoading(false);
        showToast({ message: 'Failed to initialize Google sign-in', type: 'error' });
      }
    },
    [isGisLoaded, handleCredentialResponse, showToast]
  );

  return { signIn, loading, isGisLoaded };
};
