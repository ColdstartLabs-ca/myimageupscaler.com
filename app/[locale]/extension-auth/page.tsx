/**
 * Extension Auth Bridge Page
 * This page handles authentication for the browser extension.
 * It runs in a tab and communicates with the extension's content script.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@client/store/auth/authStore';
import type { IExtensionSession } from '@extension/shared/types';

export default function ExtensionAuthPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const action = searchParams.get('action');

    if (action === 'install') {
      // First install - user needs to sign in
      setStatus('loading');
    } else if (action === 'signin') {
      // Returning from sign in flow
      setStatus('loading');
    }

    // When authenticated, pass session to extension
    if (isAuthenticated && user) {
      // Get user's credits from profile
      Promise.resolve().then(async () => {
        try {
          const supabase = (await import('@shared/utils/supabase/client')).createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const response = await fetch('/api/users/me', {
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
          });
          const data = await response.json();

          const sessionData: IExtensionSession = {
            userId: user.id,
            accessToken: session?.access_token || '',
            creditsRemaining: data.creditsRemaining || 0,
            expiresAt: Date.now() + 3600000, // 1 hour
          };

          // Attach to window for content script to pick up
          (window as any).__EXTENSION_AUTH__ = sessionData;

          setStatus('success');

          // Close this tab after short delay
          setTimeout(() => {
            window.close();
          }, 1000);
        } catch (error) {
          console.error('Failed to fetch user data:', error);
          setStatus('error');
        }
      });
    }
  }, [isAuthenticated, user, searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login with extension-auth as return
    router.push(`/?login=1&next=/extension-auth`);
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Redirecting to login...</div>;
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="spinner mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Setting up extension...</h1>
          <p className="text-gray-600">Please wait while we connect your account.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Extension Connected!</h1>
          <p className="text-gray-600 mb-4">You can now close this tab and use the extension.</p>
          <p className="text-sm text-gray-500">This window will close automatically...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto p-8">
        <h1 className="text-xl font-semibold text-red-600 mb-2">Connection Failed</h1>
        <p className="text-gray-600 mb-4">Unable to connect the extension. Please try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
