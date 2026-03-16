'use client';

import { cn } from '@client/utils/cn';
import { analytics } from '@client/analytics';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

// localStorage key for tracking first-time users
export const FIRST_UPLOAD_COMPLETED_KEY = 'miu_first_upload_completed';
export const ONBOARDING_STARTED_KEY = 'miu_onboarding_started';

export interface IProgressState {
  currentStep: 1 | 2 | 3;
  isFirstUpload: boolean;
}

export interface IProgressStepsProps {
  /** Current active step (1-3) */
  currentStep: 1 | 2 | 3;
  /** Whether this is the user's first upload experience */
  isFirstUpload: boolean;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * ProgressSteps Component
 *
 * A 3-step horizontal progress indicator that guides first-time users through
 * the upload -> configure -> download flow.
 *
 * Steps:
 * 1. Upload - Active when no image is selected
 * 2. Configure - Active when image is uploaded, before processing starts
 * 3. Download - Active when processing is complete
 *
 * Only shows to first-time users (checks localStorage).
 * Tracks `onboarding_step_viewed` event for each step.
 */
export const ProgressSteps = ({
  currentStep,
  isFirstUpload,
  className,
}: IProgressStepsProps): JSX.Element | null => {
  const t = useTranslations('workspace.progressSteps');
  const stepViewedRef = useRef<Set<number>>(new Set());
  const onboardingStartedRef = useRef(false);

  // Track onboarding started and step viewed events
  useEffect(() => {
    // Only track for first-time users
    if (!isFirstUpload) return;

    // Track onboarding started on first render
    if (!onboardingStartedRef.current) {
      onboardingStartedRef.current = true;

      // Check if onboarding has already been started
      const onboardingStarted = localStorage.getItem(ONBOARDING_STARTED_KEY);
      if (!onboardingStarted) {
        localStorage.setItem(ONBOARDING_STARTED_KEY, Date.now().toString());
        analytics.track('onboarding_started', {
          timestamp: Date.now(),
        });
      }
    }

    // Track step viewed if not already tracked for this step
    if (!stepViewedRef.current.has(currentStep)) {
      stepViewedRef.current.add(currentStep);

      const onboardingStartTime = parseInt(
        localStorage.getItem(ONBOARDING_STARTED_KEY) || Date.now().toString(),
        10
      );
      const durationToStepMs = Date.now() - onboardingStartTime;

      analytics.track('onboarding_step_viewed', {
        step: currentStep,
        durationToStepMs,
      });
    }
  }, [currentStep, isFirstUpload]);

  const steps = [
    { number: 1, label: t('step1'), key: 'upload' },
    { number: 2, label: t('step2'), key: 'configure' },
    { number: 3, label: t('step3'), key: 'download' },
  ] as const;

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 sm:gap-4 py-3 px-4',
        'bg-surface/50 rounded-xl',
        className
      )}
      role="navigation"
      aria-label={t('ariaLabel')}
    >
      {steps.map((step, index) => {
        const isActive = currentStep === step.number;
        const isCompleted = currentStep > step.number;
        const isPending = currentStep < step.number;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Circle */}
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300',
                  isActive && 'bg-accent text-white shadow-lg shadow-accent/25',
                  isCompleted && 'bg-secondary text-white',
                  isPending && 'border-2 border-border/40 text-text-muted bg-transparent'
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {isCompleted ? (
                  <Check className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                ) : (
                  step.number
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-xs sm:text-sm font-medium transition-all duration-300 hidden sm:inline',
                  isActive && 'text-accent font-semibold',
                  isCompleted && 'text-secondary',
                  isPending && 'text-text-muted'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-6 sm:w-10 h-0.5 mx-2 sm:mx-3 transition-all duration-300',
                  isCompleted && 'bg-secondary',
                  !isCompleted && 'bg-border'
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Helper function to check if user is a first-time user
 * (hasn't completed their first upload yet)
 */
export const checkIsFirstTimeUser = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(FIRST_UPLOAD_COMPLETED_KEY);
};

/**
 * Helper function to mark first upload as completed
 */
export const markFirstUploadCompleted = (source: 'sample' | 'upload', durationMs: number): void => {
  if (typeof window === 'undefined') return;

  const wasFirstTime = !localStorage.getItem(FIRST_UPLOAD_COMPLETED_KEY);

  if (wasFirstTime) {
    localStorage.setItem(FIRST_UPLOAD_COMPLETED_KEY, Date.now().toString());

    analytics.track('first_upload_completed', {
      source,
      durationMs,
    });
  }
};
