'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@shared/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { handleAuthRedirect, setAuthIntent } from '@client/utils/authRedirectManager';

function AuthConfirmContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'verified_please_login'>('loading');
  const [message, setMessage] = useState('Confirming your email...');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    // Check if we have a next parameter from the original signup flow
    const nextUrl = searchParams.get('next');

    // Store any intended redirect from the original signup
    if (nextUrl) {
      setAuthIntent({
        action: 'email_confirm',
        returnTo: nextUrl,
      });
    }

    // Check if we have a code parameter - this means Supabase already verified the email
    // and is redirecting back for session creation
    const hasCode = searchParams.get('code');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email);

      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
        setMessage('Email confirmed successfully! Redirecting...');
        // Use the unified redirect handler
        setTimeout(async () => {
          await handleAuthRedirect();
        }, 1500);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setStatus('success');
        setMessage('Email confirmed successfully! Redirecting...');
        setTimeout(async () => {
          await handleAuthRedirect();
        }, 1500);
      }
    });

    const checkSession = async () => {
      console.log('[Auth Confirm] Starting session check...');
      console.log('[Auth Confirm] URL params:', {
        code: hasCode ? 'present' : 'missing',
        next: nextUrl,
        fullUrl: window.location.href,
      });

      // First check if already authenticated
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      console.log('[Auth Confirm] Current session:', session ? 'exists' : 'none', sessionError);

      if (session) {
        console.log('[Auth Confirm] Already authenticated, redirecting...');
        setStatus('success');
        setMessage('Email confirmed successfully! Redirecting...');
        setTimeout(async () => {
          await handleAuthRedirect();
        }, 1500);
        return;
      }

      // If we have a code parameter, try to exchange it manually
      if (hasCode) {
        console.log('[Auth Confirm] Attempting code exchange...');
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(hasCode);
          console.log('[Auth Confirm] Code exchange result:', {
            success: !!data.session,
            error: error?.message,
            errorCode: error?.code,
          });

          if (data.session) {
            console.log('[Auth Confirm] Code exchange succeeded!');
            setStatus('success');
            setMessage('Email confirmed successfully! Redirecting...');
            setTimeout(async () => {
              await handleAuthRedirect();
            }, 1500);
            return;
          }

          if (error) {
            console.log('[Auth Confirm] Code exchange failed:', error.message);
            // Email is still confirmed by Supabase - user just needs to log in
            setStatus('verified_please_login');
            setMessage(
              'Your email has been confirmed! Please log in with your email and password.'
            );
            return;
          }
        } catch (err) {
          console.error('[Auth Confirm] Code exchange exception:', err);
        }

        // Fallback - email is confirmed, ask user to log in
        setStatus('verified_please_login');
        setMessage('Your email has been confirmed! Please log in with your email and password.');
      } else {
        console.log('[Auth Confirm] No code parameter found');
        // No code parameter - just show login prompt
        setTimeout(() => {
          if (status === 'loading') {
            setStatus('verified_please_login');
            setMessage('Please log in with your email and password.');
          }
        }, 2000);
      }
    };

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [router, status, searchParams]);

  const handleLoginClick = () => {
    // Store the intent to return here after login
    setAuthIntent({
      action: 'email_confirm_return',
      returnTo: window.location.pathname + window.location.search,
    });
    router.push('/?login=true');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
          {/* Icon based on status */}
          <div
            className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${
              status === 'success'
                ? 'bg-gradient-to-r from-success to-success/80'
                : status === 'verified_please_login'
                  ? 'bg-gradient-to-r from-success to-success/80'
                  : 'bg-accent glow-blue'
            }`}
          >
            {status === 'success' || status === 'verified_please_login' ? (
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            {status === 'success'
              ? 'Email Confirmed!'
              : status === 'verified_please_login'
                ? 'Email Confirmed!'
                : 'Confirming Email...'}
          </h1>

          <p className="text-muted-foreground mb-6">{message}</p>

          {status === 'loading' && (
            <div className="space-y-2">
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-accent h-2 rounded-full animate-pulse glow-blue"></div>
              </div>
            </div>
          )}

          {status === 'verified_please_login' && (
            <div className="space-y-3 mt-4">
              <button
                onClick={handleLoginClick}
                className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-all duration-200 shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/30 active:scale-[0.98] glow-blue"
              >
                Log In Now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-accent mx-auto mb-4 glow-blue"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthConfirmContent />
    </Suspense>
  );
}
