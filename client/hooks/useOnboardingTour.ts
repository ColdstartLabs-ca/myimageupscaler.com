/**
 * useOnboardingTour Hook
 *
 * Manages the onboarding tooltip tour state for first-time users.
 * Tracks completion and skip state in localStorage, and fires analytics events.
 *
 * @see docs/PRDs/first-time-user-activation.md - Phase 4: Onboarding Tooltips
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { analytics } from '@client/analytics';

// ---------------------------------------------------------------------------
// LocalStorage keys
// ---------------------------------------------------------------------------

export const TOUR_COMPLETED_KEY = 'miu_onboarding_tour_completed';
export const TOUR_SKIPPED_KEY = 'miu_onboarding_tour_skipped';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ITourStep {
  id: string;
  target: string; // CSS selector
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export interface IUseOnboardingTourReturn {
  isActive: boolean;
  currentStepIndex: number;
  trigger: 'auto' | 'manual' | null;
  shouldShowTour: boolean;
  startTour: (trigger: 'auto' | 'manual') => void;
  nextStep: () => void;
  prevStep: () => void;
  completeTour: () => void;
  skipTour: (atStep: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readTourFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for managing the onboarding tooltip tour.
 *
 * @example
 * ```tsx
 * const tourState = useOnboardingTour();
 *
 * useEffect(() => {
 *   if (tourState.shouldShowTour) {
 *     tourState.startTour('auto');
 *   }
 * }, []);
 *
 * return <OnboardingTour steps={TOUR_STEPS} tourState={tourState} />;
 * ```
 */
export function useOnboardingTour(): IUseOnboardingTourReturn {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [trigger, setTrigger] = useState<'auto' | 'manual' | null>(null);
  const [shouldShowTour, setShouldShowTour] = useState(true);

  // Determine shouldShowTour from localStorage on mount
  useEffect(() => {
    const completed = readTourFlag(TOUR_COMPLETED_KEY);
    const skipped = readTourFlag(TOUR_SKIPPED_KEY);
    if (completed || skipped) {
      setShouldShowTour(false);
    }
  }, []);

  // Track step viewed whenever the active step index changes
  useEffect(() => {
    if (!isActive) return;

    analytics.track('onboarding_tour_step_viewed', {
      step: currentStepIndex + 1,
      trigger,
    });
  }, [isActive, currentStepIndex, trigger]);

  const startTour = useCallback((tourTrigger: 'auto' | 'manual') => {
    setIsActive(true);
    setCurrentStepIndex(0);
    setTrigger(tourTrigger);

    analytics.track('onboarding_tour_started', {
      trigger: tourTrigger,
    });
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev: number) => prev + 1);
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev: number) => Math.max(0, prev - 1));
  }, []);

  const completeTour = useCallback(() => {
    setIsActive(false);
    setShouldShowTour(false);

    try {
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    } catch {
      // Ignore localStorage errors
    }

    analytics.track('onboarding_tour_completed', {});
  }, []);

  const skipTour = useCallback((atStep: number) => {
    setIsActive(false);
    setShouldShowTour(false);

    try {
      localStorage.setItem(TOUR_SKIPPED_KEY, 'true');
    } catch {
      // Ignore localStorage errors
    }

    analytics.track('onboarding_tour_skipped', {
      atStep,
    });
  }, []);

  return {
    isActive,
    currentStepIndex,
    trigger,
    shouldShowTour,
    startTour,
    nextStep,
    prevStep,
    completeTour,
    skipTour,
  };
}
