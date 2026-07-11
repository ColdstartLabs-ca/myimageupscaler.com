'use client';

import { useEffect, useState, useRef, useCallback, type MutableRefObject } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe, type StripeEmbeddedCheckoutOptions } from '@stripe/stripe-js';
import { clientEnv } from '@shared/config/env';
import { StripeService, clearCheckoutSessionCache } from '@client/services/stripeService';
import { analytics } from '@client/analytics';
import { useToastStore } from '@client/store/toastStore';
import {
  getCheckoutFunnelMetadata,
  getCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';
import { getCheckoutUiMode } from '@client/utils/checkoutUiMode';
import { getStoredCheckoutRescueOffer } from '@client/utils/checkoutRescueOfferStorage';
import { EXPERIMENT_CHECKOUT_METADATA_KEYS } from '@shared/types/experiments.types';
import type { TCheckoutStep, TCheckoutErrorType } from '@server/analytics/types';

// ---------------------------------------------------------------------------
// Mobile viewport detection
// ---------------------------------------------------------------------------

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
  isAuthenticated: boolean;
  autoTopUp?: { enabled: true; thresholdCredits: number };
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

function sanitizeCheckoutErrorMessage(errorMessage: string): string {
  return errorMessage
    .replace(/\d{13,16}/g, '[CARD]')
    .replace(/cvc|cvv|cv2/gi, '[CVC]')
    .slice(0, 200);
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
  isAuthenticated,
  autoTopUp,
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

  const trackCheckoutFailure = useCallback(
    (failurePoint: string, errorType: TCheckoutErrorType, errorMessage: string) => {
      const checkoutContext = getCheckoutTrackingContext();
      const checkoutUiMode = getCheckoutUiMode();
      const sanitizedMessage = sanitizeCheckoutErrorMessage(errorMessage);
      analytics.track('checkout_error', {
        errorType,
        errorMessage: sanitizedMessage,
        step: 'plan_selection',
        priceId,
        failurePoint,
        uiMode: checkoutUiMode,
        isAuthenticated,
        trigger: checkoutContext?.trigger,
        originatingModel: checkoutContext?.originatingModel,
        originatingTrigger: checkoutContext?.originatingTrigger,
        attributionChain: checkoutContext?.attributionChain,
      });
      trackError(errorType, sanitizedMessage, 'plan_selection');
    },
    [isAuthenticated, priceId, trackError]
  );

  // Check if Stripe is properly configured
  useEffect(() => {
    if (!stripePromise) {
      setError(t('notConfigured'));
      setLoading(false);
      trackCheckoutFailure('stripe_not_configured', 'other', 'Stripe not configured');
    }
  }, [t, trackCheckoutFailure]);

  useEffect(() => {
    if (!regionLoading || !loading) return;

    const regionLoadingTimer = setTimeout(() => {
      trackCheckoutFailure(
        'pricing_region_loading_timeout',
        'network_error',
        'Pricing region is still loading after 10s'
      );
    }, 10000);

    return () => clearTimeout(regionLoadingTimer);
  }, [loading, regionLoading, trackCheckoutFailure]);

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
      let checkoutAutoTopUp = autoTopUp;

      type TCheckoutSessionOptions = Parameters<typeof StripeService.createCheckoutSession>[1];
      const createSession = async (options: TCheckoutSessionOptions) => {
        const requestOptions: TCheckoutSessionOptions = {
          ...options,
          ...(checkoutAutoTopUp ? { autoTopUp: checkoutAutoTopUp } : {}),
        };

        try {
          return await StripeService.createCheckoutSession(priceId, requestOptions);
        } catch (sessionError) {
          const code = (sessionError as { code?: string })?.code;
          if (checkoutAutoTopUp && code === 'AUTO_TOP_UP_NOT_ELIGIBLE') {
            checkoutAutoTopUp = undefined;
            console.warn('Auto top-up became ineligible during checkout; retrying without consent');
            return StripeService.createCheckoutSession(priceId, options);
          }
          throw sessionError;
        }
      };

      const timeoutId = setTimeout(() => {
        timedOut = true;
        const timeoutMessage = 'Checkout is taking too long. Please try again.';
        setError(timeoutMessage);
        setLoading(false);
        trackCheckoutFailure(
          'checkout_session_timeout',
          'network_error',
          'Checkout session creation timeout (30s)'
        );
      }, CHECKOUT_TIMEOUT_MS);

      try {
        setLoading(true);
        setError(null);
        rescueOfferAppliedRef.current = false;
        engagementDiscountAppliedRef.current = false;
        getStoredCheckoutRescueOffer(priceId); // side-effect: hydrate storage check
        const checkoutContext = getCheckoutTrackingContext();
        const checkoutTrigger = checkoutContext?.trigger;
        const metadata: Record<string, string> = getCheckoutFunnelMetadata();

        if (checkoutTrigger) {
          metadata.checkout_trigger = checkoutTrigger;
        }
        if (checkoutContext?.originatingModel) {
          metadata.checkout_originating_model = checkoutContext.originatingModel;
        }
        if (checkoutContext?.originatingTrigger) {
          metadata.checkout_originating_trigger = checkoutContext.originatingTrigger;
        }
        if (checkoutContext?.attributionChain?.length) {
          metadata.checkout_attribution_chain = checkoutContext.attributionChain.join(',');
        }
        if (checkoutContext?.experimentKey) {
          metadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentKey] = checkoutContext.experimentKey;
        }
        if (checkoutContext?.experimentContextKey) {
          metadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentContextKey] =
            checkoutContext.experimentContextKey;
        }
        if (checkoutContext?.experimentArmId) {
          metadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmId] = String(
            checkoutContext.experimentArmId
          );
        }
        if (checkoutContext?.experimentArmKey) {
          metadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmKey] =
            checkoutContext.experimentArmKey;
        }
        if (checkoutContext?.experimentAssignmentKey) {
          metadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentAssignmentKey] =
            checkoutContext.experimentAssignmentKey;
        }
        if (banditArmId) {
          metadata.bandit_arm_id = String(banditArmId);
        }

        // Pass Amplitude device/session IDs so webhook events stitch to this browser session
        const amplitudeDeviceId = analytics.getDeviceId();
        const amplitudeSessionId = analytics.getAmplitudeSessionId();
        if (amplitudeDeviceId) metadata.amplitude_device_id = amplitudeDeviceId;
        if (amplitudeSessionId !== null) metadata.amplitude_session_id = String(amplitudeSessionId);

        const checkoutUiMode = getCheckoutUiMode();
        metadata.checkout_ui_mode = checkoutUiMode;
        metadata.checkout_authenticated = String(isAuthenticated);

        const attributionProps = {
          trigger: checkoutTrigger,
          ...(checkoutContext?.originatingModel
            ? { originatingModel: checkoutContext.originatingModel }
            : {}),
          ...(checkoutContext?.originatingTrigger
            ? { originatingTrigger: checkoutContext.originatingTrigger }
            : {}),
          ...(checkoutContext?.attributionChain?.length
            ? { attributionChain: checkoutContext.attributionChain }
            : {}),
          ...(checkoutContext?.experimentKey
            ? {
                experimentKey: checkoutContext.experimentKey,
                experimentContextKey: checkoutContext.experimentContextKey,
                experimentArmId: checkoutContext.experimentArmId,
                experimentArmKey: checkoutContext.experimentArmKey,
              }
            : {}),
        };

        analytics.track('checkout_session_requested', {
          priceId,
          uiMode: checkoutUiMode,
          hasBanditArm: Boolean(banditArmId),
          hasOfferToken: Boolean(appliedOfferToken),
          isAuthenticated,
          ...attributionProps,
        });

        // On mobile viewports (<768px) the Stripe embedded form can be cramped
        // or fail to render correctly. Use the hosted redirect path instead so
        // mobile users land on Stripe's own mobile-optimised checkout page.
        if (checkoutUiMode === 'hosted') {
          const hostedResponse = await createSession({
            uiMode: 'hosted',
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          });

          if (timedOut) return;

          analytics.track('checkout_session_created', {
            priceId,
            uiMode: 'hosted',
            loadTimeMs: Date.now() - sessionLoadStart,
            isAuthenticated,
            hasUrl: Boolean(hostedResponse.url),
            ...attributionProps,
          });

          if (hostedResponse.url) {
            window.location.href = hostedResponse.url;
            // Keep loading state until navigation completes
            return;
          }
          trackCheckoutFailure(
            'hosted_checkout_url_missing',
            'network_error',
            'No hosted checkout URL returned from checkout session'
          );
          // Fall through to embedded if hosted URL is not returned
          metadata.checkout_ui_mode = 'embedded';
        }

        // Don't pass successUrl - let the server construct it with proper type & credits params
        const response = await createSession({
          uiMode: 'embedded',
          offerToken: appliedOfferToken ?? undefined,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        });

        if (timedOut) return; // Timeout already fired, discard result

        analytics.track('checkout_session_created', {
          priceId,
          uiMode: 'embedded',
          loadTimeMs: Date.now() - sessionLoadStart,
          isAuthenticated,
          hasClientSecret: Boolean(response.clientSecret),
          checkoutOfferApplied: Boolean(response.checkoutOfferApplied),
          engagementDiscountApplied: Boolean(response.engagementDiscountApplied),
          ...attributionProps,
        });

        if (response.clientSecret) {
          rescueOfferAppliedRef.current = Boolean(response.checkoutOfferApplied);
          engagementDiscountAppliedRef.current = Boolean(response.engagementDiscountApplied);
          setClientSecret(response.clientSecret);
          // Track stripe_embed step viewed with load time
          const loadTimeMs = Date.now() - sessionLoadStart;
          trackStepViewed('stripe_embed', loadTimeMs);
        } else {
          const missingSecretMessage = 'No client secret returned from checkout session';
          setError(missingSecretMessage);
          trackCheckoutFailure(
            'embedded_client_secret_missing',
            'network_error',
            missingSecretMessage
          );
          showToast({
            message: missingSecretMessage,
            type: 'error',
          });
        }
      } catch (err) {
        if (timedOut) return; // Timeout already handled the error state
        console.error('Failed to create checkout session:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load checkout';
        const code = (err as { code?: string })?.code ?? null;
        setError(errorMessage);
        setErrorCode(code);
        trackCheckoutFailure('checkout_session_create_failed', 'network_error', errorMessage);
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
    trackCheckoutFailure,
    banditArmId,
    regionLoading,
    appliedOfferToken,
    isAuthenticated,
    autoTopUp,
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
