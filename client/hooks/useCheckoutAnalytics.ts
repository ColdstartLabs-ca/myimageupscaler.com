'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { analytics } from '@client/analytics';
import { detectDeviceType } from '@client/utils/detectDeviceType';
import { determinePlanFromPriceId } from '@shared/config/stripe';
import type {
  TCheckoutStep,
  TCheckoutExitMethod,
  TCheckoutErrorType,
} from '@server/analytics/types';

export function useCheckoutAnalytics(
  priceId: string,
  pricingRegion: string
): {
  trackStepViewed: (step: TCheckoutStep, loadTimeMs?: number) => void;
  trackExitIntent: (step: TCheckoutStep, method: TCheckoutExitMethod) => void;
  trackCheckoutAbandoned: (step: TCheckoutStep) => void;
  trackError: (errorType: TCheckoutErrorType, errorMessage: string, step: TCheckoutStep) => void;
  markCompleted: () => void;
  resetLoadStart: () => void;
  checkoutCompletedRef: React.MutableRefObject<boolean>;
  exitIntentTrackedRef: React.MutableRefObject<boolean>;
  currentStepRef: React.MutableRefObject<TCheckoutStep>;
  loadStartRef: React.MutableRefObject<number>;
  modalOpenedAtRef: React.MutableRefObject<number>;
} {
  const modalOpenedAtRef = useRef(Date.now());
  const checkoutCompletedRef = useRef(false);
  const exitIntentTrackedRef = useRef(false);
  const currentStepRef = useRef<TCheckoutStep>('plan_selection');
  const loadStartRef = useRef(Date.now());

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

  const trackCheckoutAbandoned = useCallback(
    (step: TCheckoutStep) => {
      analytics.track('checkout_abandoned', {
        priceId,
        step,
        timeSpentMs: Date.now() - modalOpenedAtRef.current,
        plan: determinePlanFromPriceId(priceId),
        pricingRegion,
      });
    },
    [priceId, pricingRegion]
  );

  const trackError = useCallback(
    (errorType: TCheckoutErrorType, errorMessage: string, step: TCheckoutStep) => {
      const sanitizedMessage = errorMessage
        .replace(/\d{13,16}/g, '[CARD]')
        .replace(/cvc|cvv|cv2/gi, '[CVC]')
        .slice(0, 200);
      analytics.track('checkout_error', {
        errorType,
        errorMessage: sanitizedMessage,
        step,
        priceId,
      });
    },
    [priceId]
  );

  const markCompleted = useCallback(() => {
    checkoutCompletedRef.current = true;
  }, []);

  const resetLoadStart = useCallback(() => {
    loadStartRef.current = Date.now();
  }, []);

  // Track step viewed on mount; fire exit intent on unmount if not completed
  useEffect(() => {
    loadStartRef.current = Date.now();
    trackStepViewed('plan_selection');

    return () => {
      if (!checkoutCompletedRef.current && !exitIntentTrackedRef.current) {
        trackExitIntent(currentStepRef.current, 'close_button');
      }
    };
  }, [trackStepViewed, trackExitIntent]);

  // Track checkout_step_time every 5 seconds
  useEffect(() => {
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

      const currentStep = currentStepRef.current;
      stepTimeAccumulator[currentStep] += elapsed;

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

    return () => clearInterval(intervalId);
  }, [priceId]);

  return {
    trackStepViewed,
    trackExitIntent,
    trackCheckoutAbandoned,
    trackError,
    markCompleted,
    resetLoadStart,
    checkoutCompletedRef,
    exitIntentTrackedRef,
    currentStepRef,
    loadStartRef,
    modalOpenedAtRef,
  };
}
