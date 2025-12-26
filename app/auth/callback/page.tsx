'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@shared/utils/supabase/client';
import { handleAuthRedirect, setAuthIntent } from '@client/utils/authRedirectManager';
import '@client/store/auth'; // Ensure auth store is initialized

function AuthCallbackContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const searchParams = useSearchParams();
  const hasRedirected = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();
      const returnTo = searchParams.get('returnTo');

      // Store the returnTo parameter as auth intent before processing the session
      if (returnTo) {
        setAuthIntent({
          action: 'oauth_complete',
          returnTo,
        });
      }

      // Function to handle successful auth and redirect
      const handleSuccess = async () => {
        if (hasRedirected.current) return;
        hasRedirected.current = true;
        setStatus('success');
        // Give the UI a moment to show success state, then redirect
        await new Promise(resolve => setTimeout(resolve, 500));
        await handleAuthRedirect();
      };

      // Listen for auth state changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          await handleSuccess();
        } else if (event === 'SIGNED_OUT') {
          setStatus('error');
        }
      });

      // Check if we already have a session (code exchange may have already happened)
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (session) {
        await handleSuccess();
      } else if (error) {
        setStatus('error');
      }

      return () => {
        subscription.unsubscribe();
      };
    };

    handleCallback();
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">Sign In Error</h1>
          <p className="text-muted-foreground mb-4">There was an error completing your sign in.</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Success state - will redirect automatically
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="text-green-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-muted-foreground">Sign in successful! Redirecting...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
