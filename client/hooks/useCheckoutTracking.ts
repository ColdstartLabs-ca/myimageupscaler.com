'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import type {
  TCheckoutStep,
  TDeviceType,
  ICheckoutStepViewedProperties,
  ICheckoutStepTimeProperties,
  ICheckoutExitIntentProperties,
  ICheckoutErrorProperties,
  TCheckoutErrorType,
  TCheckoutExitMethod,
} from '@server/analytics/types';

// =============================================================================
// Types
// =============================================================================

export interface IUseCheckoutTrackingOptions {
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
}

export interface ICheckoutTracking {
  trackStepViewed: (step: TCheckoutStep, loadTimeMs?: number) => void;
  trackStepTime: (step: TCheckoutStep) => void;
  trackError: (errorType: TCheckoutErrorType, errorMessage: string, step: TCheckoutStep) => void;
  trackExitIntent: (step: TCheckoutStep, method: TCheckoutExitMethod) => void;
  getDeviceType: () => TDeviceType;
  getCurrentStep: () => TCheckoutStep;
  getTimeSpentMs: () => number;
  setStep: (step: TCheckoutStep) => void;
}

// =============================================================================
// Constants
// =============================================================================

const STEP_TIME_REPORT_INTERVAL_MS = 5000; // Report time every 5 seconds

// =============================================================================
// Helpers
// =============================================================================

function detectDeviceType(): TDeviceType {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();

  // Tablet detection
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua) || width >= 768 && width < 1024;
  if (isTablet) return 'tablet';

  // Mobile detection
  const isMobile = /iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua) || width < 768;
  if (isMobile) return 'mobile';

  return 'desktop';
}

// =============================================================================
// Hook
// =============================================================================

export function useCheckoutTracking({
  priceId,
  purchaseType,
}: IUseCheckoutTrackingOptions): ICheckoutTracking {
  const startTimeRef = useRef<number>(Date.now());
  const [currentStep, setCurrentStep] = useState<TCheckoutStep>('plan_selection');
  const stepStartRef = useRef<number>(Date.now());
  const cumulativeTimeRef = useRef<Record<TCheckoutStep, number>>({
    plan_selection: 0,
    stripe_embed: 0,
    payment_details: 0,
    confirmation: 0,
  });
  const deviceTypeRef = useRef<TDeviceType>(detectDeviceType());

  // Track step time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSpentMs = Date.now() - stepStartRef.current;

      // Update cumulative time
      cumulativeTimeRef.current[currentStep] += STEP_TIME_REPORT_INTERVAL_MS;

      const props: ICheckoutStepTimeProperties = {
        step: currentStep,
        timeSpentMs,
        priceId,
        cumulativeTimeMs: Date.now() - startTimeRef.current,
      };

      analytics.track('checkout_step_time', { ...props });
    }, STEP_TIME_REPORT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [currentStep, priceId]);

  const trackStepViewed = useCallback(
    (step: TCheckoutStep, loadTimeMs?: number) => {
      const props: ICheckoutStepViewedProperties = {
        step,
        loadTimeMs,
        priceId,
        purchaseType,
        deviceType: deviceTypeRef.current,
      };

      analytics.track('checkout_step_viewed', { ...props });
      setCurrentStep(step);
      stepStartRef.current = Date.now();
    },
    [priceId, purchaseType]
  );

  const trackStepTime = useCallback(
    (step: TCheckoutStep) => {
      const timeSpentMs = Date.now() - stepStartRef.current;
      const props: ICheckoutStepTimeProperties = {
        step,
        timeSpentMs,
        priceId,
        cumulativeTimeMs: Date.now() - startTimeRef.current,
      };

      analytics.track('checkout_step_time', { ...props });
    },
    [priceId]
  );

  const trackError = useCallback(
    (errorType: TCheckoutErrorType, errorMessage: string, step: TCheckoutStep) => {
      // Sanitize error message - remove any potential card numbers or sensitive data
      const sanitizedMessage = errorMessage
        .replace(/\d{13,16}/g, '[CARD]') // Remove card numbers
        .replace(/cvc|cvv|cv2/gi, '[CVC]') // Remove CVC mentions
        .slice(0, 200); // Limit length

      const props: ICheckoutErrorProperties = {
        errorType,
        errorMessage: sanitizedMessage,
        step,
        priceId,
      };

      analytics.track('checkout_error', { ...props });
    },
    [priceId]
  );

  const trackExitIntent = useCallback(
    (step: TCheckoutStep, method: TCheckoutExitMethod) => {
      const timeSpentMs = Date.now() - startTimeRef.current;

      const props: ICheckoutExitIntentProperties = {
        step,
        timeSpentMs,
        priceId,
        method,
      };

      analytics.track('checkout_exit_intent', { ...props });
    },
    [priceId]
  );

  const getDeviceType = useCallback(() => deviceTypeRef.current, []);

  const getCurrentStep = useCallback((): TCheckoutStep => currentStep, [currentStep]);

  const getTimeSpentMs = useCallback(() => Date.now() - startTimeRef.current, []);

  const setStep = useCallback((step: TCheckoutStep) => {
    setCurrentStep(step);
    stepStartRef.current = Date.now();
  }, []);

  return {
    trackStepViewed,
    trackStepTime,
    trackError,
    trackExitIntent,
    getDeviceType,
    getCurrentStep,
    getTimeSpentMs,
    setStep,
  };
}
