'use client';

import { useToastStore } from '@client/store/toastStore';
import { StripeService } from '@client/services/stripeService';
import { clientEnv } from '@shared/config/env';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type StripeEmbeddedCheckoutOptions } from '@stripe/stripe-js';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { analytics } from '@client/analytics';
import { STRIPE_PRICES } from '@shared/config/stripe';
import type { TCheckoutExitMethod, TCheckoutStep } from '@server/analytics/types';
import {
  CheckoutExitSurvey,
  shouldShowExitSurvey,
  markExitSurveyShown,
} from '@client/components/stripe/CheckoutExitSurvey';

interface ICheckoutModalProps {
  priceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// Initialize Stripe outside of component to avoid recreating on each render
// Add validation to provide better error messages
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
 * Determine the plan name from a price ID
 */
function determinePlanFromPriceId(priceId: string): 'starter' | 'hobby' | 'pro' | 'business' {
  if (priceId === STRIPE_PRICES.STARTER_MONTHLY) return 'starter';
  if (priceId === STRIPE_PRICES.HOBBY_MONTHLY) return 'hobby';
  if (priceId === STRIPE_PRICES.PRO_MONTHLY) return 'pro';
  if (priceId === STRIPE_PRICES.BUSINESS_MONTHLY) return 'business';
  // Default to hobby for unknown price IDs
  return 'hobby';
}

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

/**
 * CheckoutModal component for embedded Stripe Checkout
 *
 * Usage:
 * ```tsx
 * <CheckoutModal
 *   priceId="price_XXX"
 *   onClose={() => setShowModal(false)}
 *   onSuccess={() => handleSuccess()}
 * />
 * ```
 */
export function CheckoutModal({ priceId, onClose, onSuccess }: ICheckoutModalProps): JSX.Element {
  const t = useTranslations('stripe.checkout');

  // Track when modal was opened to calculate time spent
  const modalOpenedAtRef = useRef(Date.now());
  // Track if checkout was completed (to avoid tracking abandoned on successful close)
  const checkoutCompletedRef = useRef(false);
  // Track exit method for exit intent
  const exitMethodRef = useRef<TCheckoutExitMethod>('close_button');
  // Track current step
  const currentStepRef = useRef<TCheckoutStep>('plan_selection');
  // Track load start time
  const loadStartRef = useRef(Date.now());

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyTimeSpentMs, setSurveyTimeSpentMs] = useState(0);
  const { showToast } = useToastStore();

  // Track step viewed with load time
  const trackStepViewed = useCallback(
    (step: TCheckoutStep, loadTimeMs?: number) => {
      currentStepRef.current = step;
      const deviceType = detectDeviceType();

      analytics.track('checkout_step_viewed', {
        step,
        loadTimeMs: loadTimeMs ?? Date.now() - loadStartRef.current,
        priceId,
        purchaseType: 'subscription',
        deviceType,
      });
    },
    [priceId]
  );

  // Track exit intent
  const trackExitIntent = useCallback(
    (step: TCheckoutStep, method: TCheckoutExitMethod) => {
      const timeSpentMs = Date.now() - modalOpenedAtRef.current;

      analytics.track('checkout_exit_intent', {
        step,
        timeSpentMs,
        priceId,
        method,
      });
    },
    [priceId]
  );

  // Track error
  const trackError = useCallback(
    (
      errorType:
        | 'card_declined'
        | '3ds_failed'
        | 'network_error'
        | 'invalid_card'
        | 'session_expired'
        | 'other',
      errorMessage: string,
      step: TCheckoutStep
    ) => {
      // Sanitize error message - remove any potential card numbers or sensitive data
      const sanitizedMessage = errorMessage
        .replace(/\d{13,16}/g, '[CARD]') // Remove card numbers
        .replace(/cvc|cvv|cv2/gi, '[CVC]') // Remove CVC mentions
        .slice(0, 200); // Limit length

      analytics.track('checkout_error', {
        errorType,
        errorMessage: sanitizedMessage,
        step,
        priceId,
      });
    },
    [priceId]
  );

  // Check if Stripe is properly configured
  useEffect(() => {
    if (!stripePromise) {
      setError(t('notConfigured'));
      setLoading(false);
      trackError('other', 'Stripe not configured', 'plan_selection');
    }
  }, [t, trackError]);

  // Track slow loading - show additional message if loading takes >2s
  useEffect(() => {
    if (!loading) {
      setSlowLoading(false);
      return;
    }

    const slowLoadingTimer = setTimeout(() => {
      setSlowLoading(true);
    }, 2000);

    return () => clearTimeout(slowLoadingTimer);
  }, [loading]);

  // Track step viewed when component mounts
  useEffect(() => {
    loadStartRef.current = Date.now();
    trackStepViewed('plan_selection');

    return () => {
      // Track exit if checkout wasn't completed
      if (!checkoutCompletedRef.current) {
        trackExitIntent(currentStepRef.current, exitMethodRef.current);
      }
    };
  }, [trackStepViewed, trackExitIntent]);

  // Track checkout_step_time periodically every 5 seconds
  useEffect(() => {
    // Track cumulative time per step
    const stepTimeAccumulator: Record<TCheckoutStep, number> = {
      plan_selection: 0,
      stripe_embed: 0,
      payment_details: 0,
      confirmation: 0,
    };

    let lastTickTime = Date.now();

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickTime;
      lastTickTime = now;

      // Accumulate time for current step
      const currentStep = currentStepRef.current;
      stepTimeAccumulator[currentStep] += elapsed;

      // Calculate cumulative time across all steps
      const cumulativeTimeMs = Object.values(stepTimeAccumulator).reduce(
        (sum, time) => sum + time,
        0
      );

      analytics.track('checkout_step_time', {
        step: currentStep,
        timeSpentMs: stepTimeAccumulator[currentStep],
        priceId,
        cumulativeTimeMs,
      });
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [priceId]);

  // Handle close with exit intent tracking
  const handleClose = useCallback(
    (method: TCheckoutExitMethod = 'close_button') => {
      exitMethodRef.current = method;

      // Only track abandoned if checkout wasn't completed
      if (!checkoutCompletedRef.current) {
        const timeSpentMs = Date.now() - modalOpenedAtRef.current;
        const step = clientSecret ? 'stripe_embed' : 'plan_selection';

        analytics.track('checkout_abandoned', {
          priceId,
          step,
          timeSpentMs,
          plan: determinePlanFromPriceId(priceId),
        });

        // Track exit intent with the new event
        trackExitIntent(step, method);

        // Check if we should show the exit survey
        if (shouldShowExitSurvey(timeSpentMs)) {
          setSurveyTimeSpentMs(timeSpentMs);
          setShowSurvey(true);
          markExitSurveyShown();
          return; // Don't close yet - show survey first
        }
      }
      onClose();
    },
    [priceId, clientSecret, onClose, trackExitIntent]
  );

  // Handle closing the survey
  const handleSurveyClose = useCallback(() => {
    setShowSurvey(false);
    onClose();
  }, [onClose]);

  // Handle escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose('escape_key');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Lock body scroll when modal is open (prevents mobile touch pass-through)
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const createCheckoutSession = async () => {
      // Don't attempt to create session if Stripe isn't configured
      if (!stripePromise) {
        return;
      }

      const sessionLoadStart = Date.now();

      try {
        setLoading(true);
        setError(null);

        // Don't pass successUrl - let the server construct it with proper type & credits params
        const response = await StripeService.createCheckoutSession(priceId, {
          uiMode: 'embedded',
        });

        if (response.clientSecret) {
          setClientSecret(response.clientSecret);
          // Track stripe_embed step viewed with load time
          const loadTimeMs = Date.now() - sessionLoadStart;
          trackStepViewed('stripe_embed', loadTimeMs);
        } else {
          throw new Error('No client secret returned from checkout session');
        }
      } catch (err) {
        console.error('Failed to create checkout session:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load checkout';
        setError(errorMessage);
        trackError('network_error', errorMessage, 'plan_selection');
        showToast({
          message: errorMessage,
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };

    createCheckoutSession();
  }, [priceId, showToast, trackStepViewed, trackError]);

  const options: StripeEmbeddedCheckoutOptions = {
    clientSecret: clientSecret || '',
    onComplete: () => {
      // Mark checkout as completed to avoid tracking abandoned
      checkoutCompletedRef.current = true;

      // Track confirmation step
      trackStepViewed('confirmation');

      // Called when the checkout is complete
      if (onSuccess) {
        onSuccess();
      }
      // Close the modal after a short delay to show confirmation
      setTimeout(() => {
        onClose();
      }, 1500);
    },
  };

  return (
    <>
      {/* Exit Survey Modal - shown on top when applicable */}
      {showSurvey && (
        <CheckoutExitSurvey
          priceId={priceId}
          timeSpentMs={surveyTimeSpentMs}
          onClose={handleSurveyClose}
        />
      )}

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-x-hidden"
        onClick={e => {
          // Only close when clicking directly on the backdrop, not its children
          if (e.target === e.currentTarget) {
            handleClose('click_outside');
          }
        }}
      >
        {/* Stop propagation to prevent backdrop close on mobile touch drift */}
        <div
          className="relative bg-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] supports-[height:100dvh]:max-h-[95dvh] flex flex-col touch-manipulation"
          onClick={e => e.stopPropagation()}
        >
          {/* Close button - 44x44px minimum touch target for accessibility */}
          <button
            onClick={() => handleClose('close_button')}
            className="absolute top-3 right-3 z-10 p-3 text-muted-foreground hover:text-muted-foreground transition-colors bg-surface rounded-full shadow-md min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            aria-label={t('close')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                  <p className="text-muted-foreground">{t('loading')}</p>
                  {slowLoading && (
                    <p className="text-sm text-muted-foreground/70">{t('slowLoading')}</p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-8">
                <div className="bg-error/10 border border-error/20 rounded-lg p-4">
                  <h3 className="text-error font-semibold mb-2">{t('error')}</h3>
                  <p className="text-error/80">{error}</p>
                  <button
                    onClick={() => handleClose('close_button')}
                    className="mt-4 px-4 py-2 bg-error text-white rounded-lg hover:bg-error/80 transition-colors touch-manipulation"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && clientSecret && (
              <div className="min-h-[400px]">
                <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
