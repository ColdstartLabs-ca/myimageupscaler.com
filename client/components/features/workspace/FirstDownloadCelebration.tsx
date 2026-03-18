'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@client/utils/cn';
import { analytics } from '@client/analytics';
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

/**
 * FirstDownloadCelebration Component
 *
 * A celebratory modal/overlay that shows after a first-time user
 * completes their first download.
 *
 * Features:
 * - CSS-based confetti animation (no heavy JS libraries)
 * - "Upload Another" and "See Premium Plans" buttons
 * - Only shows once per user (localStorage flag)
 * - Tracks `onboarding_completed` event
 */
export const FirstDownloadCelebration = ({
  isFreeUser,
  onUploadAnother,
  onDismiss,
  source = 'upload',
}: IFirstDownloadCelebrationProps): JSX.Element | null => {
  const t = useTranslations('workspace.progressCelebration');
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  // Check if celebration was already shown
  const shouldShow = () => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(CELEBRATION_SHOWN_KEY);
  };

  // Track onboarding completion — defined before hooks so it's in scope
  const trackCompletion = () => {
    const onboardingStartTime = parseInt(
      localStorage.getItem(ONBOARDING_STARTED_KEY) || Date.now().toString(),
      10
    );
    const totalDurationMs = Date.now() - onboardingStartTime;

    analytics.track('onboarding_completed', {
      totalDurationMs,
      source,
    });

    // Mark celebration as shown
    if (typeof window !== 'undefined') {
      localStorage.setItem(CELEBRATION_SHOWN_KEY, Date.now().toString());
    }
  };

  // Track completion + mark shown once on mount (must be before any early return)

  useEffect(() => {
    trackCompletion();
  }, []);

  if (!shouldShow() || !isVisible) {
    return null;
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(CELEBRATION_SHOWN_KEY, Date.now().toString());
    } catch {
      // ignore
    }
    setIsVisible(false);
    onDismiss?.();
  };

  const handleUploadAnother = () => {
    handleDismiss();
    onUploadAnother?.();
  };

  const handleViewPlans = () => {
    // Mark as shown before navigating away
    if (typeof window !== 'undefined') {
      localStorage.setItem(CELEBRATION_SHOWN_KEY, Date.now().toString());
    }

    analytics.track('upgrade_prompt_clicked', {
      trigger: 'celebration',
      destination: '/pricing',
      currentPlan: isFreeUser ? 'free' : 'paid',
    });

    handleDismiss();
    router.push('/pricing');
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
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleUploadAnother}
            className={cn(
              'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
              'bg-surface-hover hover:bg-surface-active border border-border',
              'text-text font-semibold transition-all',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            <Upload size={18} />
            {t('uploadAnother')}
          </button>

          {isFreeUser && (
            <button
              onClick={handleViewPlans}
              className={cn(
                'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
                'gradient-cta shine-effect',
                'text-white font-semibold transition-all',
                'hover:scale-[1.02] active:scale-[0.98]',
                'shadow-lg shadow-accent/20'
              )}
            >
              {t('seePlans')}
              <ArrowRight size={18} />
            </button>
          )}
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
  if (typeof window === 'undefined') return;

  // This would be called by the parent component when download completes
  analytics.track('onboarding_completed', {
    totalDurationMs:
      Date.now() -
      parseInt(localStorage.getItem(ONBOARDING_STARTED_KEY) || Date.now().toString(), 10),
    source,
  });

  // Note: We don't set the celebration shown key here
  // The FirstDownloadCelebration component will do that when it renders
};
