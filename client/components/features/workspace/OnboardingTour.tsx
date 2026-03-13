'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@client/utils/cn';
import { useTranslations } from 'next-intl';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ITourStep, IUseOnboardingTourReturn, TOUR_COMPLETED_KEY, TOUR_SKIPPED_KEY } from '@client/hooks/useOnboardingTour';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface IOnboardingTourProps {
  steps: ITourStep[];
  tourState: IUseOnboardingTourReturn;
}

// Re-export so consumers can import ITourStep from this module too
export type { ITourStep };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ITooltipPosition {
  top: number;
  left: number;
}

function getTooltipPosition(
  targetEl: Element | null,
  position: ITourStep['position'],
  tooltipWidth: number,
  tooltipHeight: number
): ITooltipPosition {
  if (!targetEl) {
    // Fallback: center of viewport
    return {
      top: window.innerHeight / 2 - tooltipHeight / 2,
      left: window.innerWidth / 2 - tooltipWidth / 2,
    };
  }

  const rect = targetEl.getBoundingClientRect();
  const gap = 12;

  switch (position) {
    case 'bottom':
      return {
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
      };
    case 'top':
      return {
        top: rect.top - tooltipHeight - gap,
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
      };
    case 'left':
      return {
        top: rect.top + rect.height / 2 - tooltipHeight / 2,
        left: rect.left - tooltipWidth - gap,
      };
    case 'right':
      return {
        top: rect.top + rect.height / 2 - tooltipHeight / 2,
        left: rect.right + gap,
      };
  }
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface IStepIndicatorProps {
  current: number;
  total: number;
  stepOfLabel: string;
}

function StepIndicator({ current, total, stepOfLabel }: IStepIndicatorProps) {
  return (
    <span className="text-xs text-text-muted">
      {stepOfLabel}
      <span className="sr-only">
        {current} of {total}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * OnboardingTour
 *
 * Renders a portal-based tooltip overlay that guides first-time users through
 * key UI elements. Controlled entirely by the `tourState` prop (from
 * `useOnboardingTour`).
 *
 * Usage:
 * ```tsx
 * const tourState = useOnboardingTour();
 * <OnboardingTour steps={TOUR_STEPS} tourState={tourState} />
 * ```
 */
export function OnboardingTour({ steps, tourState }: IOnboardingTourProps) {
  const t = useTranslations('workspace.onboardingTour');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<ITooltipPosition>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  // Ensure portal renders only on client
  useEffect(() => {
    setMounted(true);
  }, []);

  const { isActive, currentStepIndex, nextStep, prevStep, completeTour, skipTour } = tourState;

  const currentStep = steps[currentStepIndex];

  // Reposition tooltip whenever the active step changes
  useEffect(() => {
    if (!isActive || !currentStep) return;

    const targetEl = document.querySelector(currentStep.target);
    const tooltipEl = tooltipRef.current;

    const width = tooltipEl?.offsetWidth ?? 280;
    const height = tooltipEl?.offsetHeight ?? 160;

    const pos = getTooltipPosition(targetEl, currentStep.position, width, height);
    setTooltipPos(pos);
  }, [isActive, currentStep, currentStepIndex]);

  // Don't render when tour is not active
  if (!isActive) return null;
  if (!mounted) return null;

  // Guard: don't show if already completed or skipped (SSR-safe re-check)
  if (typeof window !== 'undefined') {
    try {
      const done =
        localStorage.getItem(TOUR_COMPLETED_KEY) === 'true' ||
        localStorage.getItem(TOUR_SKIPPED_KEY) === 'true';
      if (done) return null;
    } catch {
      // Ignore localStorage errors
    }
  }

  if (!currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const stepOfLabel = t('stepOf', {
    current: currentStepIndex + 1,
    total: steps.length,
  });

  const content = (
    <>
      {/* Semi-transparent overlay */}
      <div
        data-testid="tour-overlay"
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[1px]"
        onClick={() => skipTour(currentStepIndex)}
        aria-hidden="true"
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-label={currentStep.title}
        className={cn(
          'fixed z-[9999] w-72 rounded-xl p-4 shadow-2xl',
          'bg-surface border border-border',
          'flex flex-col gap-3'
        )}
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
        }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <h3
            data-testid={`tooltip-title-${currentStep.id}`}
            className="text-sm font-semibold text-text leading-snug"
          >
            {currentStep.title}
          </h3>

          <button
            onClick={() => skipTour(currentStepIndex)}
            className={cn(
              'flex-shrink-0 rounded-md p-1 text-text-muted transition-colors',
              'hover:bg-surface-hover hover:text-text'
            )}
            aria-label={t('skip')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <p className="text-xs text-text-muted leading-relaxed">{currentStep.content}</p>

        {/* Footer: step indicator + navigation */}
        <div className="flex items-center justify-between">
          <StepIndicator
            current={currentStepIndex + 1}
            total={steps.length}
            stepOfLabel={stepOfLabel}
          />

          <div className="flex items-center gap-2">
            {/* Skip link (not shown on last step) */}
            {!isLastStep && (
              <button
                onClick={() => skipTour(currentStepIndex)}
                className="text-xs text-text-muted underline-offset-2 hover:underline"
              >
                {t('skip')}
              </button>
            )}

            {/* Previous */}
            {!isFirstStep && (
              <button
                onClick={prevStep}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                  'text-text-muted border border-border',
                  'hover:bg-surface-hover transition-colors'
                )}
                aria-label={t('previous')}
              >
                <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                {t('previous')}
              </button>
            )}

            {/* Next / Finish */}
            {isLastStep ? (
              <button
                onClick={completeTour}
                className={cn(
                  'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold',
                  'bg-accent text-white',
                  'hover:bg-accent/90 transition-colors'
                )}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
                {t('finish')}
              </button>
            ) : (
              <button
                onClick={nextStep}
                className={cn(
                  'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold',
                  'bg-accent text-white',
                  'hover:bg-accent/90 transition-colors'
                )}
              >
                {t('next')}
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
