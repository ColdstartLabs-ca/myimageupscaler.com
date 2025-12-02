'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { StripeService } from '@server/stripe';

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1000;

function SuccessContent(): JSX.Element {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const pollForCredits = useCallback(async () => {
    let attempts = 0;
    let initialCredits: number | null = null;

    try {
      // Get initial credits
      const initialProfile = await StripeService.getUserProfile();
      initialCredits = initialProfile?.credits_balance ?? 0;

      const poll = async (): Promise<void> => {
        attempts++;

        try {
          const profile = await StripeService.getUserProfile();
          const currentCredits = profile?.credits_balance ?? 0;

          // Credits have been updated
          if (currentCredits > initialCredits!) {
            setCredits(currentCredits);
            setLoading(false);
            return;
          }

          // Max attempts reached
          if (attempts >= MAX_POLL_ATTEMPTS) {
            setCredits(currentCredits);
            setPollTimedOut(true);
            setLoading(false);
            return;
          }

          // Continue polling
          setTimeout(poll, POLL_INTERVAL_MS);
        } catch (error) {
          console.error('Error polling credits:', error);
          // On error, stop polling and show current state
          const profile = await StripeService.getUserProfile();
          setCredits(profile?.credits_balance ?? 0);
          setPollTimedOut(true);
          setLoading(false);
        }
      };

      poll();
    } catch (error) {
      console.error('Error initializing credit poll:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    pollForCredits();
  }, [pollForCredits]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-lg text-slate-600">Processing your payment...</p>
          <p className="text-sm text-slate-400 mt-2">This usually takes a few seconds</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6">
        <div className="max-w-lg mx-auto text-center">
          {/* Success Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
          </div>

          {/* Success Message */}
          <h1 className="text-3xl font-bold mb-4">Payment Successful!</h1>
          <p className="text-lg text-slate-600 mb-4">Thank you for your purchase.</p>

          {/* Credits Balance */}
          {credits !== null && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-indigo-600 font-medium">Your current balance</p>
              <p className="text-3xl font-bold text-indigo-700">{credits} credits</p>
            </div>
          )}

          {/* Polling timeout notice */}
          {pollTimedOut && (
            <div className="flex items-center justify-center gap-2 text-amber-600 mb-6">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">
                If your credits haven&apos;t updated, please refresh the page.
              </p>
            </div>
          )}

          {/* Session ID (for reference) */}
          {sessionId && (
            <div className="bg-slate-100 rounded-lg p-4 mb-8">
              <p className="text-sm text-slate-500">
                Reference: <code className="text-xs">{sessionId.slice(0, 20)}...</code>
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center justify-center px-6 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              View Billing
            </Link>
          </div>

          {/* Additional Info */}
          <div className="mt-12 text-sm text-slate-500">
            <p>
              A receipt has been sent to your email address.
              <br />
              If you have any questions, please{' '}
              <a
                href="mailto:support@pixelperfect.com"
                className="text-indigo-600 hover:text-indigo-700 underline"
              >
                contact support
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoadingFallback(): JSX.Element {
  return (
    <main className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
        <p className="text-lg text-slate-600">Loading...</p>
      </div>
    </main>
  );
}

export default function SuccessPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SuccessContent />
    </Suspense>
  );
}
