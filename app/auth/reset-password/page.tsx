'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@shared/utils/supabase/client';
import { ForgotPasswordSetNewPasswordForm } from '@client/components/modal/auth/ForgotPasswordSetNewPasswordForm';
import { Loader2 } from 'lucide-react';

function ResetPasswordContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleReset = async () => {
      const code = searchParams.get('code');
      const supabase = createClient();

      // First check if we already have a session (auto-exchange might have happened)
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      
      if (existingSession) {
        setStatus('success');
        return;
      }

      if (!code) {
        setError('Invalid or missing reset code.');
        setStatus('error');
        return;
      }
      
      // Attempt to exchange the code for a session
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (data.session) {
          setStatus('success');
          return;
        }

        if (error) {
          console.error('Code exchange failed:', error);
          
          // Double check if session was established despite error (race condition)
          const { data: { session: recheckSession } } = await supabase.auth.getSession();
          if (recheckSession) {
            setStatus('success');
            return;
          }

          setError(error.message);
          setStatus('error');
          return;
        }
      } catch (err) {
        console.error('Reset password error:', err);
        setError('An unexpected error occurred.');
        setStatus('error');
      }
    };

    handleReset();
  }, [searchParams]);

  const handlePasswordSet = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
          <p className="text-slate-500 mt-2">Enter your new password below.</p>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
            <p className="text-slate-600">Verifying reset link...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-center">
            <p>{error || 'Invalid or expired reset link.'}</p>
            <button 
              onClick={() => router.push('/')}
              className="mt-4 text-sm font-semibold hover:underline"
            >
              Return to Home
            </button>
          </div>
        )}

        {status === 'success' && (
          <ForgotPasswordSetNewPasswordForm onClose={handlePasswordSet} />
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}


