'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToastStore } from '@client/store/toastStore';
import { useAuthStore } from '@client/store/authStore';
import { StripeService } from '@client/services/stripeService';
import { clientEnv } from '@shared/config/env';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type StripeEmbeddedCheckoutOptions } from '@stripe/stripe-js';

// Initialize Stripe
const getStripePromise = () => {
  const publishableKey = clientEnv.STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    console.error('Stripe publishable key is not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env file.');
    return null;
  }

  if (!publishableKey.startsWith('pk_')) {
    console.error('Invalid Stripe publishable key format. Key should start with "pk_"');
    return null;
  }

  return loadStripe(publishableKey);
};

const stripePromise = getStripePromise();

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToastStore();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const priceId = searchParams.get('priceId');
  const planName = searchParams.get('plan');

  useEffect(() => {
    if (!priceId) {
      setError('No price ID provided. Please select a plan first.');
      setLoading(false);
      return;
    }

    if (!isAuthenticated) {
      // Don't create checkout session until user is authenticated
      return;
    }

    const createCheckoutSession = async () => {
      if (!stripePromise) {
        setError('Stripe is not properly configured. Please contact support.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await StripeService.createCheckoutSession(priceId, {
          uiMode: 'embedded',
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        });

        if (response.clientSecret) {
          setClientSecret(response.clientSecret);
        } else {
          throw new Error('No client secret returned from checkout session');
        }
      } catch (err) {
        console.error('Failed to create checkout session:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load checkout';
        const code = (err as Error & { code?: string }).code;
        setError(errorMessage);
        setErrorCode(code || null);
        // Only show toast for non-subscription errors (subscription errors have better UI)
        if (code !== 'ALREADY_SUBSCRIBED') {
          showToast({
            message: errorMessage,
            type: 'error',
          });
        }
      } finally {
        setLoading(false);
      }
    };

    createCheckoutSession();
  }, [priceId, isAuthenticated, showToast]);

  const options: StripeEmbeddedCheckoutOptions = {
    clientSecret: clientSecret || '',
    onComplete: () => {
      // Redirect to success page after checkout completion
      setTimeout(() => {
        router.push('/success');
      }, 2000);
    },
  };

  const handleGoBack = () => {
    router.push('/pricing');
  };

  if (!priceId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-4">No Plan Selected</h1>
            <p className="text-slate-600 mb-6">Please select a plan from the pricing page.</p>
            <button
              onClick={handleGoBack}
              className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while checking authentication or waiting for user to sign in
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Checking Authentication</h1>
            <p className="text-slate-600">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated, don't render the checkout form - auth modal will be shown
  if (!isAuthenticated && priceId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Authentication Required</h1>
            <p className="text-slate-600 mb-6">Please sign in to continue with your purchase.</p>
            <button
              onClick={() => router.push('/pricing')}
              className="inline-flex items-center px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
            >
              Back to Pricing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleGoBack}
              className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Pricing
            </button>
            {planName && (
              <div className="text-sm text-slate-600">
                Subscribing to: <span className="font-medium text-slate-900">{planName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Checkout Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h1 className="text-2xl font-bold text-slate-900">Complete Your Subscription</h1>
            <p className="text-slate-600 mt-2">Secure payment powered by Stripe</p>
          </div>

          <div className="min-h-[600px]">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  <p className="text-slate-600">Loading secure checkout...</p>
                </div>
              </div>
            )}

            {error && errorCode === 'ALREADY_SUBSCRIBED' && (
              <div className="p-8">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-amber-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-amber-800 mb-2">
                        You Already Have an Active Subscription
                      </h3>
                      <p className="text-amber-700 mb-4">
                        {error}
                      </p>
                      <p className="text-sm text-amber-600 mb-4">
                        To change your plan, please use the billing portal to manage your subscription.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => router.push('/dashboard/billing')}
                          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                        >
                          Manage Subscription
                        </button>
                        <button
                          onClick={handleGoBack}
                          className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                        >
                          Back to Plans
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && errorCode !== 'ALREADY_SUBSCRIBED' && (
              <div className="p-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="text-red-800 font-semibold mb-2">Error</h3>
                  <p className="text-red-600">{error}</p>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={handleGoBack}
                      className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Back to Plans
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!loading && !error && clientSecret && (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center text-sm text-slate-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            Secured by 256-bit SSL encryption. All payments are processed securely by Stripe.
          </div>
        </div>
      </div>
    </div>
  );
}