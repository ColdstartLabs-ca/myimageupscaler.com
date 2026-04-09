'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useCheckoutAnalytics } from '@client/hooks/useCheckoutAnalytics';
import { useCheckoutSession, stripePromise } from '@client/hooks/useCheckoutSession';
import { useCheckoutRescueOffer } from '@client/hooks/useCheckoutRescueOffer';
import { useModalBehavior } from '@client/hooks/useModalBehavior';
import { isCheckoutRescueOfferEligiblePrice } from '@shared/config/checkout-rescue-offer';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import type { TCheckoutExitMethod } from '@server/analytics/types';
import {
  CheckoutExitSurvey,
  shouldShowExitSurvey,
  markExitSurveyShown,
} from '@client/components/stripe/CheckoutExitSurvey';
import { CheckoutRescueOffer } from '@client/components/stripe/CheckoutRescueOffer';
import { getCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';

interface ICheckoutModalProps {
  priceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * CheckoutModal component for embedded Stripe Checkout.
 * Composed from useCheckoutAnalytics, useCheckoutSession, useCheckoutRescueOffer,
 * and useModalBehavior hooks.
 */
export function CheckoutModal({ priceId, onClose, onSuccess }: ICheckoutModalProps): JSX.Element {
  const t = useTranslations('stripe.checkout');
  const { pricingRegion, banditArmId, isLoading: regionLoading } = useRegionTier();
  const rescueOfferEligible = isCheckoutRescueOfferEligiblePrice(priceId);

  // Analytics hook — owns all tracking state and callbacks
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

  const exitMethodRef = useRef<TCheckoutExitMethod>('close_button');
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyTimeSpentMs, setSurveyTimeSpentMs] = useState(0);

  // Rescue offer hook — owns rescue offer state machine
  const {
    showRescueOffer,
    rescueOffer,
    appliedOfferToken,
    tryShowRescueOffer,
    claimOffer,
    dismissOffer,
    clearOffer,
    hideRescueOffer,
  } = useCheckoutRescueOffer(priceId);

  // Checkout completion callback
  const handleComplete = useCallback(() => {
    clearOffer();
    markCompleted();
    trackStepViewed('confirmation');
    if (onSuccess) onSuccess();
    setTimeout(() => onClose(), 1500);
  }, [clearOffer, markCompleted, trackStepViewed, onSuccess, onClose]);

  // Session hook — owns Stripe session lifecycle
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

  // Handle close — orchestrates rescue offer, survey, and tracking
  const handleClose = useCallback(
    async (method: TCheckoutExitMethod = 'close_button') => {
      if (showSurvey) {
        setShowSurvey(false);
        onClose();
        return;
      }

      if (showRescueOffer) {
        hideRescueOffer();
        trackCheckoutAbandoned('stripe_embed');
        onClose();
        return;
      }

      exitMethodRef.current = method;

      if (!checkoutCompletedRef.current) {
        const timeSpentMs = Date.now() - modalOpenedAtRef.current;
        const step = clientSecret ? 'stripe_embed' : 'plan_selection';
        const checkoutTrigger = getCheckoutTrackingContext()?.trigger;

        const shown = await tryShowRescueOffer({
          step,
          rescueOfferEligible,
          rescueOfferApplied: rescueOfferAppliedRef.current,
          engagementDiscountApplied:
            engagementDiscountAppliedRef.current ||
            checkoutTrigger === 'engagement_discount_banner',
          method,
          exitIntentTrackedRef,
          trackExitIntent,
        });
        if (shown) return;

        trackCheckoutAbandoned(step);
        exitIntentTrackedRef.current = true;
        trackExitIntent(step, method);

        if (shouldShowExitSurvey(timeSpentMs)) {
          setSurveyTimeSpentMs(timeSpentMs);
          setShowSurvey(true);
          markExitSurveyShown();
          return;
        }
      }
      onClose();
    },
    [
      showSurvey,
      showRescueOffer,
      clientSecret,
      rescueOfferEligible,
      tryShowRescueOffer,
      hideRescueOffer,
      trackCheckoutAbandoned,
      trackExitIntent,
      checkoutCompletedRef,
      modalOpenedAtRef,
      rescueOfferAppliedRef,
      engagementDiscountAppliedRef,
      exitIntentTrackedRef,
      onClose,
    ]
  );

  // Modal behavior (escape key + scroll lock)
  const handleEscapeKey = useCallback(() => void handleClose('escape_key'), [handleClose]);
  useModalBehavior(handleEscapeKey);

  const handleSurveyClose = useCallback(() => {
    setShowSurvey(false);
    onClose();
  }, [onClose]);

  const handleRescueOfferClaim = useCallback(() => {
    claimOffer({ rescueOfferAppliedRef, resetLoadStart, retry });
  }, [claimOffer, rescueOfferAppliedRef, resetLoadStart, retry]);

  const handleRescueOfferDismiss = useCallback(() => {
    dismissOffer({ trackCheckoutAbandoned, onClose });
  }, [dismissOffer, trackCheckoutAbandoned, onClose]);

  return (
    <>
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
          if (e.target === e.currentTarget) void handleClose('click_outside');
        }}
      >
        <div
          className="relative bg-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] supports-[height:100dvh]:max-h-[95dvh] flex flex-col touch-manipulation"
          onClick={e => e.stopPropagation()}
        >
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
                        onClick={() => { resetLoadStart(); retry(); }}
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
