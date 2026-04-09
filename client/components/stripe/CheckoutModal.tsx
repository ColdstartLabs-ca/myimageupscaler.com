'use client';

import { StripeService } from '@client/services/stripeService';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { isCheckoutRescueOfferEligiblePrice } from '@shared/config/checkout-rescue-offer';
import type { TCheckoutExitMethod } from '@server/analytics/types';
import { useCheckoutAnalytics } from '@client/hooks/useCheckoutAnalytics';
import { useCheckoutSession, stripePromise } from '@client/hooks/useCheckoutSession';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';
import {
  CheckoutExitSurvey,
  shouldShowExitSurvey,
  markExitSurveyShown,
} from '@client/components/stripe/CheckoutExitSurvey';
import { CheckoutRescueOffer } from '@client/components/stripe/CheckoutRescueOffer';
import {
  clearStoredCheckoutRescueOffer,
  getStoredCheckoutRescueOffer,
  storeCheckoutRescueOffer,
} from '@client/utils/checkoutRescueOfferStorage';
import { shouldShowCheckoutRescueOffer } from '@client/utils/checkoutRescueOfferVisibility';
import { getCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';

interface ICheckoutModalProps {
  priceId: string;
  onClose: () => void;
  onSuccess?: () => void;
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
  const { pricingRegion, banditArmId, isLoading: regionLoading } = useRegionTier();
  const rescueOfferEligible = isCheckoutRescueOfferEligiblePrice(priceId);

  const {
    trackStepViewed,
    trackExitIntent,
    trackCheckoutAbandoned,
    trackError,
    markCompleted,
    resetLoadStart,
    checkoutCompletedRef,
    exitIntentTrackedRef,
    modalOpenedAtRef,
  } = useCheckoutAnalytics(priceId, pricingRegion);

  // Track exit method for exit intent
  const exitMethodRef = useRef<TCheckoutExitMethod>('close_button');

  const [showSurvey, setShowSurvey] = useState(false);
  const [showRescueOffer, setShowRescueOffer] = useState(false);
  const [rescueOffer, setRescueOffer] = useState<ICheckoutRescueOffer | null>(null);
  const [appliedOfferToken, setAppliedOfferToken] = useState<string | null>(null);
  const [surveyTimeSpentMs, setSurveyTimeSpentMs] = useState(0);

  useEffect(() => {
    setRescueOffer(getStoredCheckoutRescueOffer(priceId));
  }, [priceId]);

  const handleComplete = useCallback(() => {
    clearStoredCheckoutRescueOffer(priceId);
    setAppliedOfferToken(null);
    markCompleted();
    trackStepViewed('confirmation');
    if (onSuccess) onSuccess();
    setTimeout(() => {
      onClose();
    }, 1500);
  }, [priceId, markCompleted, trackStepViewed, onSuccess, onClose]);

  const {
    clientSecret,
    loading,
    slowLoading,
    error,
    errorCode,
    applyingRescueOffer,
    rescueOfferAppliedRef,
    engagementDiscountAppliedRef,
    retry,
    stripeOptions,
  } = useCheckoutSession({
    priceId,
    banditArmId,
    regionLoading,
    appliedOfferToken,
    trackStepViewed,
    trackError,
    onComplete: handleComplete,
  });

  // Handle close with exit intent tracking
  const handleClose = useCallback(
    async (method: TCheckoutExitMethod = 'close_button') => {
      // Survey is already showing — a second ESC/close must just dismiss it, not re-track
      if (showSurvey) {
        setShowSurvey(false);
        onClose();
        return;
      }

      if (showRescueOffer) {
        setShowRescueOffer(false);
        trackCheckoutAbandoned('stripe_embed');
        onClose();
        return;
      }

      exitMethodRef.current = method;

      // Only track abandoned if checkout wasn't completed
      if (!checkoutCompletedRef.current) {
        const timeSpentMs = Date.now() - modalOpenedAtRef.current;
        const step = clientSecret ? 'stripe_embed' : 'plan_selection';
        const checkoutTrigger = getCheckoutTrackingContext()?.trigger;

        if (
          shouldShowCheckoutRescueOffer({
            step,
            rescueOfferEligible,
            rescueOfferApplied: rescueOfferAppliedRef.current,
            engagementDiscountApplied:
              engagementDiscountAppliedRef.current ||
              checkoutTrigger === 'engagement_discount_banner',
          })
        ) {
          const existingOffer = getStoredCheckoutRescueOffer(priceId);

          if (existingOffer) {
            setRescueOffer(existingOffer);
            setShowRescueOffer(true);
            exitIntentTrackedRef.current = true;
            trackExitIntent(step, method);
            return;
          }

          try {
            const createdOffer = await StripeService.createCheckoutRescueOffer(priceId);
            storeCheckoutRescueOffer(createdOffer);
            setRescueOffer(createdOffer);
            setShowRescueOffer(true);
            exitIntentTrackedRef.current = true;
            trackExitIntent(step, method);
            return;
          } catch (offerError) {
            console.warn('[CHECKOUT_RESCUE_OFFER] Failed to issue offer, closing normally', {
              priceId,
              error: offerError instanceof Error ? offerError.message : offerError,
            });
          }
        }

        trackCheckoutAbandoned(step);

        // Track exit intent and mark as tracked so cleanup doesn't double-fire
        exitIntentTrackedRef.current = true;
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
    [
      priceId,
      clientSecret,
      onClose,
      rescueOfferEligible,
      showSurvey,
      showRescueOffer,
      trackCheckoutAbandoned,
      trackExitIntent,
    ]
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
        void handleClose('escape_key');
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

  const handleRescueOfferClaim = useCallback(() => {
    if (!rescueOffer) {
      return;
    }

    setShowRescueOffer(false);
    setAppliedOfferToken(rescueOffer.offerToken);
    rescueOfferAppliedRef.current = true;
    resetLoadStart();
    retry();
  }, [rescueOffer, rescueOfferAppliedRef, resetLoadStart, retry]);

  const handleRescueOfferDismiss = useCallback(() => {
    setShowRescueOffer(false);
    trackCheckoutAbandoned('stripe_embed');
    onClose();
  }, [onClose, trackCheckoutAbandoned]);

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

      {showRescueOffer && rescueOffer && (
        <CheckoutRescueOffer
          offer={rescueOffer}
          isApplying={applyingRescueOffer}
          onClaim={handleRescueOfferClaim}
          onDismiss={handleRescueOfferDismiss}
        />
      )}

      <div
        data-modal="checkout"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-x-hidden"
        onClick={e => {
          // Only close when clicking directly on the backdrop, not its children
          if (e.target === e.currentTarget) {
            void handleClose('click_outside');
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
            onClick={() => void handleClose('close_button')}
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
                  <div className="mt-4 flex gap-3">
                    {errorCode === 'ALREADY_SUBSCRIBED' ? (
                      <a
                        href="/dashboard/billing"
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors touch-manipulation"
                      >
                        Manage subscription
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          resetLoadStart();
                          retry();
                        }}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors touch-manipulation"
                      >
                        Try again
                      </button>
                    )}
                    <button
                      onClick={() => void handleClose('close_button')}
                      className="px-4 py-2 bg-error text-white rounded-lg hover:bg-error/80 transition-colors touch-manipulation"
                    >
                      {t('close')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!loading && !error && clientSecret && (
              <div className="min-h-[400px]">
                <EmbeddedCheckoutProvider stripe={stripePromise} options={stripeOptions}>
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
