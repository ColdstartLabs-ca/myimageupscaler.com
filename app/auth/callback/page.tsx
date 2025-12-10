'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@shared/utils/supabase/client';
import { setAuthIntent } from '@client/utils/authRedirectManager';

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const router = useRouter();
  const searchParams = useSearchParams();

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

      // Listen for auth state changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          setStatus('success');
          // The redirect will be handled by the postAuthRedirect in authStateHandler
          setTimeout(() => {
            // Give time for the auth state handler to process
            router.push('/dashboard');
          }, 100);
        } else if (event === 'SIGNED_OUT') {
          setStatus('error');
        }
      });

      // Check if we already have a session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (session) {
        setStatus('success');
        setTimeout(() => {
          router.push('/dashboard');
        }, 100);
      } else if (error) {
        setStatus('error');
      }

      return () => {
        subscription.unsubscribe();
      };
    };

    handleCallback();
  }, [router, searchParams]);

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
            onClick={() => router.push('/')}
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
