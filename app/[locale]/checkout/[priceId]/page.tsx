'use client';

import { Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToastStore } from '@client/store/toastStore';
import { useUserStore } from '@client/store/userStore';
import { useTranslations } from 'next-intl';
import { StripeService } from '@client/services/stripeService';
import { clientEnv } from '@shared/config/env';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type StripeEmbeddedCheckoutOptions } from '@stripe/stripe-js';
import { BillingErrorBoundary } from '@client/components/stripe/BillingErrorBoundary';
import { TrustBadges } from '@client/components/stripe/TrustBadges';
import { analytics } from '@client/analytics';
import { ArrowLeft } from 'lucide-react';
import type { TCheckoutStep } from '@server/analytics/types';

// Initialize Stripe outside of component to avoid recreating on each render
const getStripePromise = () => {
  const publishableKey = clientEnv.STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    console.error(
      'Stripe publishable key is not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env file.'
    );
    return null;
  }

  if (!publishableKey.startsWith('pk_')) {
    console.error('Invalid Stripe publishable key format. Key should start with "pk_"');
    return null;
  }

  return loadStripe(publishableKey);
};

const stripePromise = getStripePromise();

/**
 * Detect device type based on viewport and user agent
 */
function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();

  // Tablet detection
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua) || (width >= 768 && width < 1024);
  if (isTablet) return 'tablet';

  // Mobile detection
  const isMobile =
    /iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua) || width < 768;
  if (isMobile) return 'mobile';

  return 'desktop';
}

function CheckoutPageContent() {
  const t = useTranslations('checkout');
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToastStore();
  const { isAuthenticated, isLoading: authLoading } = useUserStore();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Track when page was opened to calculate time spent
  const pageOpenedAtRef = useRef(Date.now());
  // Track if checkout was completed (to avoid tracking abandoned on successful close)
  const checkoutCompletedRef = useRef(false);
  // Track current step
  const currentStepRef = useRef<TCheckoutStep>('plan_selection');
  // Track load start time
  const loadStartRef = useRef(Date.now());

  // Get priceId from URL params (handle string | string[] type from Next.js)
  const priceId = Array.isArray(params.priceId) ? params.priceId[0] : params.priceId;
  const planName = searchParams.get('plan');
  const type = searchParams.get('type'); // 'subscription' or 'credits'

  // Track step viewed with load time
  const trackStepViewed = useCallback(
    (step: TCheckoutStep, loadTimeMs?: number) => {
      currentStepRef.current = step;
      const deviceType = detectDeviceType();

      analytics.track('checkout_step_viewed', {
        step,
        loadTimeMs: loadTimeMs ?? Date.now() - loadStartRef.current,
        priceId,
        purchaseType: type || 'subscription',
        deviceType,
        checkout_variant: 'page',
      });
    },
    [priceId, type]
  );

  // Track checkout_variant event on mount
  useEffect(() => {
    // Track the A/B test variant assignment
    analytics.track('checkout_variant', {
      variant: 'page',
      priceId,
      purchaseType: type || 'subscription',
    });
  }, [priceId, type]);

  useEffect(() => {
    // Track page view on mount
    loadStartRef.current = Date.now();
    trackStepViewed('plan_selection');

    return () => {
      // Track exit if checkout wasn't completed
      if (!checkoutCompletedRef.current) {
        const timeSpentMs = Date.now() - pageOpenedAtRef.current;
        analytics.track('checkout_abandoned', {
          priceId,
          step: currentStepRef.current,
          timeSpentMs,
          checkout_variant: 'page',
        });
      }
    };
  }, [priceId, trackStepViewed]);

  useEffect(() => {
    if (!priceId) {
      setError(t('noPriceIdProvided'));
      setLoading(false);
      return;
    }

    if (!isAuthenticated) {
      // Don't create checkout session until user is authenticated
      return;
    }

    const createCheckoutSession = async () => {
      if (!stripePromise) {
        setError(t('stripeNotConfigured'));
        setLoading(false);
        return;
      }

      const sessionLoadStart = Date.now();

      try {
        setLoading(true);
        setError(null);

        const response = await StripeService.createCheckoutSession(priceId, {
          uiMode: 'embedded',
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/dashboard/billing`,
        });

        if (response.clientSecret) {
          setClientSecret(response.clientSecret);
          // Track stripe_embed step viewed with load time
          const loadTimeMs = Date.now() - sessionLoadStart;
          trackStepViewed('stripe_embed', loadTimeMs);
        } else {
          throw new Error(t('noClientSecret'));
        }
      } catch (err) {
        console.error('Failed to create checkout session:', err);
        const errorMessage = err instanceof Error ? err.message : t('error');
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
  }, [priceId, isAuthenticated, showToast, t, trackStepViewed]);

  const options: StripeEmbeddedCheckoutOptions = {
    clientSecret: clientSecret || '',
    onComplete: () => {
      // Mark checkout as completed to avoid tracking abandoned
      checkoutCompletedRef.current = true;

      // Track confirmation step
      trackStepViewed('confirmation');

      // Redirect to success page after checkout completion
      setTimeout(() => {
        router.push('/success');
      }, 2000);
    },
  };

  const handleGoBack = () => {
    router.push('/dashboard/billing');
  };

  if (!priceId) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-surface rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">{t('noPlanSelected')}</h1>
            <p className="text-muted-foreground mb-6">{t('pleaseSelectPlan')}</p>
            <button
              onClick={handleGoBack}
              className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
            >
              {t('viewPlans')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while checking authentication or waiting for user to sign in
  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-surface rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold text-white mb-2">{t('checkingAuthentication')}</h1>
            <p className="text-muted-foreground">{t('pleaseWait')}</p>
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated, show auth required message
  if (!isAuthenticated && priceId) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-surface rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white mb-2">{t('authenticationRequired')}</h1>
            <p className="text-muted-foreground mb-6">{t('pleaseSignInToContinue')}</p>
            <button
              onClick={() => router.push('/dashboard/billing')}
              className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
            >
              {t('backToBilling')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleGoBack}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              {t('backToBilling')}
            </button>
            {planName && (
              <div className="text-sm text-muted-foreground">
                {t('subscribingTo', { planName })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trust Badges at top - mobile optimized */}
      <div className="bg-surface-light/50 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <TrustBadges variant="horizontal" />
        </div>
      </div>

      {/* Checkout Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-surface rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b border-border">
            <h1 className="text-2xl font-bold text-white">{t('completeYourSubscription')}</h1>
            <p className="text-muted-foreground mt-2">{t('securePaymentPowered')}</p>
          </div>

          <div className="min-h-[600px]">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                  <p className="text-muted-foreground">{t('loadingSecureCheckout')}</p>
                </div>
              </div>
            )}

            {error && errorCode === 'ALREADY_SUBSCRIBED' && (
              <div className="p-8">
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-warning"
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
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {t('alreadyHaveActiveSubscription')}
                      </h3>
                      <p className="text-muted-foreground mb-4">{error}</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('useBillingPortalText')}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => router.push('/dashboard/billing')}
                          className="px-4 py-2 bg-warning text-white rounded-lg hover:bg-warning/80 transition-colors"
                        >
                          {t('manageSubscription')}
                        </button>
                        <button
                          onClick={handleGoBack}
                          className="px-4 py-2 bg-surface-light text-muted-foreground rounded-lg hover:bg-surface-light transition-colors"
                        >
                          {t('backToPlans')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && errorCode !== 'ALREADY_SUBSCRIBED' && (
              <div className="p-8">
                <div className="bg-error/10 border border-error/20 rounded-lg p-4">
                  <h3 className="text-error font-semibold mb-2">{t('error')}</h3>
                  <p className="text-error">{error}</p>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={handleGoBack}
                      className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                    >
                      {t('backToPlans')}
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-error text-white rounded-lg hover:bg-error/80 transition-colors"
                    >
                      {t('tryAgain')}
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
          <div className="inline-flex items-center text-sm text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2 text-success"
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
            {t('securedBySsl')}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <BillingErrorBoundary context="checkout">
      <Suspense fallback={<LoadingFallback />}>
        <CheckoutPageContent />
      </Suspense>
    </BillingErrorBoundary>
  );
}
