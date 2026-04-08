'use client';

import { useEffect, useState } from 'react';
import { cn } from '@client/utils/cn';
import { analytics } from '@client/analytics';
import { ONBOARDING_COMPLETED_KEY } from '@shared/config/sample-images.config';
import { useTranslations } from 'next-intl';
import { Sparkles, Upload, ArrowRight, X } from 'lucide-react';

const CELEBRATION_SHOWN_KEY = 'miu_celebration_shown';
const ONBOARDING_STARTED_KEY = 'miu_onboarding_started';

export interface IFirstDownloadCelebrationProps {
  /** Whether the is a free user (to show premium upsell) */
  isFreeUser: boolean;
  /** Callback when user wants to upload another image */
  onUploadAnother?: () => void;
  /** Callback when celebration is dismissed */
  onDismiss?: () => void;
  /** Callback when user clicks "Explore Models" */
  onExploreModels?: () => void;
  /** Source of the download - sample or user upload */
  source?: 'sample' | 'upload';
}

interface IConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
}

function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

function markCelebrationShown(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CELEBRATION_SHOWN_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

function markOnboardingCompleted(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * FirstDownloadCelebration Component
 *
 * A celebratory modal/overlay that shows after a first-time user
 * completes their first download.
 *
 * Features:
 * - CSS-based confetti animation (no heavy JS libraries)
 * - "Upload Another" and "Explore Models" buttons
 * - Only shows once per user (localStorage flag)
 * - Tracks `onboarding_completed` event
 */
export const FirstDownloadCelebration = ({
  isFreeUser,
  onUploadAnother,
  onDismiss,
  onExploreModels,
  source = 'upload',
}: IFirstDownloadCelebrationProps): JSX.Element | null => {
  const t = useTranslations('workspace.progressCelebration');
  const [isVisible, setIsVisible] = useState(true);

  // Check if celebration was already shown
  const shouldShow = () => {
    if (typeof window === 'undefined') return false;

    try {
      return !localStorage.getItem(CELEBRATION_SHOWN_KEY);
    } catch {
      return false;
    }
  };

  const [shouldRender] = useState(() => shouldShow() && !hasCompletedOnboarding());

  useEffect(() => {
    if (!shouldRender) return;

    const onboardingStartTime = parseInt(
      localStorage.getItem(ONBOARDING_STARTED_KEY) || Date.now().toString(),
      10
    );
    const totalDurationMs = Date.now() - onboardingStartTime;

    markOnboardingCompleted();
    markCelebrationShown();

    analytics.track('onboarding_completed', {
      totalDurationMs,
      source,
    });
  }, [shouldRender, source]);

  if (!shouldRender || !isVisible) {
    return null;
  }

  const handleDismiss = () => {
    markCelebrationShown();
    setIsVisible(false);
    onDismiss?.();
  };

  const handleUploadAnother = () => {
    handleDismiss();
    onUploadAnother?.();
  };

  const handleExploreModels = () => {
    // Mark as shown before triggering upgrade
    markCelebrationShown();

    analytics.track('upgrade_prompt_clicked', {
      trigger: 'celebration_explore',
      destination: 'model_gallery',
      currentPlan: isFreeUser ? 'free' : 'paid',
    });

    handleDismiss();
    onExploreModels?.();
  };

  // Generate confetti pieces
  const confettiPieces: IConfettiPiece[] = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    rotation: Math.random() * 360,
    color: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][
      Math.floor(Math.random() * 6)
    ],
    size: 6 + Math.random() * 8,
    delay: Math.random() * 0.5,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
    >
      {/* Confetti container */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confettiPieces.map(piece => (
          <div
            key={piece.id}
            className={cn('absolute rounded-sm animate-confetti-fall', 'left-0 top-0')}
            style={{
              left: `${piece.x}%`,
              top: `-${piece.size}px`,
              width: `${piece.size}px`,
              height: `${piece.size * 0.6}px`,
              backgroundColor: piece.color,
              transform: `rotate(${piece.rotation}deg)`,
              animationDelay: `${piece.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Main celebration card */}
      <div
        className={cn(
          'relative z-10 max-w-md w-full mx-4',
          'bg-surface rounded-2xl shadow-2xl border border-border',
          'p-6 sm:p-8 text-center',
          'animate-scale-in'
        )}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-4 top-4 text-text-muted hover:text-text transition-colors p-1"
          aria-label={t('dismiss')}
        >
          <X size={20} />
        </button>

        {/* Celebration icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent to-secondary shadow-lg shadow-accent/30">
          <Sparkles className="h-8 w-8 text-white" />
        </div>

        {/* Title */}
        <h2 id="celebration-title" className="text-xl sm:text-2xl font-bold text-text mb-2">
          {t('title')}
        </h2>

        {/* Subtitle */}
        <p className="text-text-muted mb-6">{t('subtitle')}</p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 justify-center sm:flex-row">
          {isFreeUser ? (
            <button
              onClick={handleExploreModels}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4',
                'gradient-cta shine-effect',
                'text-base font-bold text-white transition-all',
                'hover:scale-[1.02] active:scale-[0.98]',
                'shadow-lg shadow-accent/20 sm:flex-1'
              )}
            >
              {t('exploreModels')}
              <ArrowRight size={18} />
            </button>
          ) : null}

          <button
            onClick={handleUploadAnother}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-6 py-3.5',
              'bg-surface-hover hover:bg-surface-active border border-border',
              'text-text font-semibold transition-all',
              'hover:scale-[1.02] active:scale-[0.98]',
              isFreeUser && 'sm:min-w-[170px]'
            )}
          >
            <Upload size={18} />
            {t('uploadAnother')}
          </button>
        </div>

        {/* Skip text for free users */}
        {isFreeUser && <p className="mt-4 text-sm text-text-muted">{t('skipText')}</p>}
      </div>
    </div>
  );
};

/**
 * Helper to check if celebration should be shown
 */
export const shouldShowCelebration = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(CELEBRATION_SHOWN_KEY);
};

/**
 * Helper to manually trigger celebration (for testing)
 */
export const triggerCelebration = (source: 'sample' | 'upload' = 'upload'): void => {
  if (typeof window === 'undefined' || hasCompletedOnboarding()) return;

  // This would be called by the parent component when download completes
  markOnboardingCompleted();

  analytics.track('onboarding_completed', {
    totalDurationMs:
      Date.now() -
      parseInt(localStorage.getItem(ONBOARDING_STARTED_KEY) || Date.now().toString(), 10),
    source,
  });

  // Note: We don't set the celebration shown key here
  // The FirstDownloadCelebration component will do that when it renders
};
