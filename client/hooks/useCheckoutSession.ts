'use client';

import { useEffect, useState, useRef, useCallback, type MutableRefObject } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe, type StripeEmbeddedCheckoutOptions } from '@stripe/stripe-js';
import { clientEnv } from '@shared/config/env';
import { StripeService, clearCheckoutSessionCache } from '@client/services/stripeService';
import { analytics } from '@client/analytics';
import { useToastStore } from '@client/store/toastStore';
import { getCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import { getStoredCheckoutRescueOffer } from '@client/utils/checkoutRescueOfferStorage';
import type { TCheckoutStep, TCheckoutErrorType } from '@server/analytics/types';

// ---------------------------------------------------------------------------
// Stripe initialisation (module-level, created once)
// ---------------------------------------------------------------------------

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

export const stripePromise = getStripePromise();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IUseCheckoutSessionParams {
  priceId: string;
  banditArmId: number | null;
  regionLoading: boolean;
  appliedOfferToken: string | null;
  trackStepViewed: (step: TCheckoutStep, loadTimeMs?: number) => void;
  trackError: (errorType: TCheckoutErrorType, errorMessage: string, step: TCheckoutStep) => void;
  onComplete: () => void;
}

interface IUseCheckoutSessionReturn {
  clientSecret: string | null;
  loading: boolean;
  slowLoading: boolean;
  error: string | null;
  errorCode: string | null;
  applyingRescueOffer: boolean;
  rescueOfferAppliedRef: MutableRefObject<boolean>;
  engagementDiscountAppliedRef: MutableRefObject<boolean>;
  retry: () => void;
  stripeOptions: StripeEmbeddedCheckoutOptions;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCheckoutSession({
  priceId,
  banditArmId,
  regionLoading,
  appliedOfferToken,
  trackStepViewed,
  trackError,
  onComplete,
}: IUseCheckoutSessionParams): IUseCheckoutSessionReturn {
  const t = useTranslations('stripe.checkout');
  const { showToast } = useToastStore();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [applyingRescueOffer, setApplyingRescueOffer] = useState(false);

  const rescueOfferAppliedRef = useRef(false);
  const engagementDiscountAppliedRef = useRef(false);

  // Check if Stripe is properly configured
  useEffect(() => {
    if (!stripePromise) {
      setError(t('notConfigured'));
      setLoading(false);
      trackError('other', 'Stripe not configured', 'plan_selection');
    }
  }, [t, trackError]);

  // Track slow loading — show additional message if loading takes >2s
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

  // Session creation effect
  useEffect(() => {
    const CHECKOUT_TIMEOUT_MS = 30000; // 30 seconds hard timeout

    const createCheckoutSession = async () => {
      // Don't attempt to create session if Stripe isn't configured
      if (!stripePromise) {
        return;
      }

      // Wait for region/bandit resolution so the checkout session matches the displayed price.
      if (regionLoading) {
        return;
      }

      const sessionLoadStart = Date.now();
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        const timeoutMessage = 'Checkout is taking too long. Please try again.';
        setError(timeoutMessage);
        setLoading(false);
        trackError('network_error', 'Checkout session creation timeout (30s)', 'plan_selection');
      }, CHECKOUT_TIMEOUT_MS);

      try {
        setLoading(true);
        setError(null);
        rescueOfferAppliedRef.current = false;
        engagementDiscountAppliedRef.current = false;
        getStoredCheckoutRescueOffer(priceId); // side-effect: hydrate storage check
        const checkoutTrigger = getCheckoutTrackingContext()?.trigger;
        const metadata: Record<string, string> = {};

        if (checkoutTrigger) {
          metadata.checkout_trigger = checkoutTrigger;
        }
        if (banditArmId) {
          metadata.bandit_arm_id = String(banditArmId);
        }

        // Pass Amplitude device/session IDs so webhook events stitch to this browser session
        const amplitudeDeviceId = analytics.getDeviceId();
        const amplitudeSessionId = analytics.getAmplitudeSessionId();
        if (amplitudeDeviceId) metadata.amplitude_device_id = amplitudeDeviceId;
        if (amplitudeSessionId !== null) metadata.amplitude_session_id = String(amplitudeSessionId);

        // Don't pass successUrl - let the server construct it with proper type & credits params
        const response = await StripeService.createCheckoutSession(priceId, {
          uiMode: 'embedded',
          offerToken: appliedOfferToken ?? undefined,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        });

        if (timedOut) return; // Timeout already fired, discard result

        if (response.clientSecret) {
          rescueOfferAppliedRef.current = Boolean(response.checkoutOfferApplied);
          engagementDiscountAppliedRef.current = Boolean(response.engagementDiscountApplied);
          setClientSecret(response.clientSecret);
          // Track stripe_embed step viewed with load time
          const loadTimeMs = Date.now() - sessionLoadStart;
          trackStepViewed('stripe_embed', loadTimeMs);
        } else {
          throw new Error('No client secret returned from checkout session');
        }
      } catch (err) {
        if (timedOut) return; // Timeout already handled the error state
        console.error('Failed to create checkout session:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load checkout';
        const code = (err as { code?: string })?.code ?? null;
        setError(errorMessage);
        setErrorCode(code);
        trackError('network_error', errorMessage, 'plan_selection');
        showToast({
          message: errorMessage,
          type: 'error',
        });
      } finally {
        clearTimeout(timeoutId);
        setApplyingRescueOffer(false);
        if (!timedOut) {
          setLoading(false);
        }
      }
    };

    createCheckoutSession();
  }, [
    priceId,
    retryKey,
    showToast,
    trackStepViewed,
    trackError,
    banditArmId,
    regionLoading,
    appliedOfferToken,
  ]);

  const retry = useCallback(() => {
    clearCheckoutSessionCache();
    setError(null);
    setErrorCode(null);
    setClientSecret(null);
    setLoading(true);
    setRetryKey(k => k + 1);
  }, []);

  const stripeOptions: StripeEmbeddedCheckoutOptions = {
    clientSecret: clientSecret ?? '',
    onComplete,
  };

  return {
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
  };
}
