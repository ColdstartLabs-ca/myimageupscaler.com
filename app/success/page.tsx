'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { StripeService } from '@client/services/stripeService';
import { clientEnv } from '@shared/config/env';

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1000;

function SuccessContent(): JSX.Element {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const purchaseType = searchParams.get('type') || 'subscription';
  const purchasedCredits = searchParams.get('credits');
  const isCredits = purchaseType === 'credits';
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const pollForCredits = useCallback(async () => {
    let attempts = 0;
    let initialCredits: number | null = null;

    try {
      // Get initial credits (sum of both pools)
      const initialProfile = await StripeService.getUserProfile();
      initialCredits =
        (initialProfile?.subscription_credits_balance ?? 0) +
        (initialProfile?.purchased_credits_balance ?? 0);

      const poll = async (): Promise<void> => {
        attempts++;

        try {
          const profile = await StripeService.getUserProfile();
          const currentCredits =
            (profile?.subscription_credits_balance ?? 0) +
            (profile?.purchased_credits_balance ?? 0);

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
          setCredits(
            (profile?.subscription_credits_balance ?? 0) + (profile?.purchased_credits_balance ?? 0)
          );
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
          <Loader2 className="h-12 w-12 animate-spin text-accent mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">
            {isCredits ? 'Processing your purchase...' : 'Activating your subscription...'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Your credits will be available in a moment
          </p>
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
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/20">
              <CheckCircle className="h-12 w-12 text-success" />
            </div>
          </div>

          {/* Success Message */}
          <h1 className="text-3xl font-bold mb-4">
            {isCredits ? 'Credits Purchased!' : 'Subscription Activated!'}
          </h1>
          <p className="text-lg text-muted-foreground mb-4">
            {isCredits
              ? `Thank you for your purchase${purchasedCredits ? `. ${purchasedCredits} credits have been added to your account.` : '.'}`
              : 'Thank you for subscribing. Your monthly credits will be added shortly.'}
          </p>

          {/* Credits Balance */}
          {credits !== null && (
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 mb-6">
              <p className="text-sm text-accent font-medium">Your current balance</p>
              <p className="text-3xl font-bold text-accent-hover">{credits} credits</p>
            </div>
          )}

          {/* Polling timeout notice */}
          {pollTimedOut && (
            <div className="flex items-center justify-center gap-2 text-warning mb-6">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">
                {isCredits
                  ? "Your purchase is complete. If your credits haven't updated yet, please refresh the page or check your billing dashboard."
                  : "Your subscription is active. If your credits haven't updated yet, please refresh the page or check your billing dashboard."}
              </p>
            </div>
          )}

          {/* Session ID (for reference) */}
          {sessionId && (
            <div className="bg-surface-light rounded-lg p-4 mb-8">
              <p className="text-sm text-muted-foreground">
                Reference: <code className="text-xs">{sessionId.slice(0, 20)}...</code>
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center justify-center px-6 py-3 border border-white/20 text-muted-foreground font-medium rounded-lg hover:bg-surface transition-colors"
            >
              View Billing
            </Link>
          </div>

          {/* Additional Info */}
          <div className="mt-12 text-sm text-muted-foreground">
            <p>
              A receipt has been sent to your email address.
              <br />
              If you have any questions, please{' '}
              <a
                href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                className="text-accent hover:text-accent-hover underline"
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
        <Loader2 className="h-12 w-12 animate-spin text-accent mx-auto mb-4" />
        <p className="text-lg text-muted-foreground">Loading...</p>
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
