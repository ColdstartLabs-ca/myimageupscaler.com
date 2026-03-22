/**
 * Engagement Tracking Hook
 *
 * Tracks user engagement signals (upscales, downloads, model switches)
 * in session storage. When 2/3 thresholds are met, checks eligibility
 * for the engagement-based first-purchase discount.
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  ENGAGEMENT_DISCOUNT_CONFIG,
  createEmptyEngagementSignals,
  checkEngagementEligibility,
} from '@shared/config/engagement-discount';
import { useEngagementDiscountStore } from '@client/store/engagementDiscountStore';
import { analytics } from '@client/analytics';
import { useUserData, useUserStore } from '@client/store/userStore';
import { createClient } from '@shared/utils/supabase/client';
import type { IEngagementSignals, IThresholdsStatus } from '@shared/types/engagement-discount';

/**
 * Load signals from session storage or create new ones.
 */
function loadSignals(): IEngagementSignals {
  if (typeof window === 'undefined') {
    return createEmptyEngagementSignals();
  }

  try {
    const stored = sessionStorage.getItem(ENGAGEMENT_DISCOUNT_CONFIG.sessionKey);
    if (stored) {
      const parsed = JSON.parse(stored) as IEngagementSignals;
      // Validate structure
      if (
        typeof parsed.upscales === 'number' &&
        typeof parsed.downloads === 'number' &&
        typeof parsed.modelSwitches === 'number' &&
        typeof parsed.sessionStartedAt === 'number'
      ) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }

  return createEmptyEngagementSignals();
}

/**
 * Save signals to session storage.
 */
function saveSignals(signals: IEngagementSignals): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(ENGAGEMENT_DISCOUNT_CONFIG.sessionKey, JSON.stringify(signals));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook return type.
 */
export interface IUseEngagementTrackerReturn {
  /** Current engagement signals */
  signals: IEngagementSignals;
  /** Increment the upscale counter */
  trackUpscale: () => void;
  /** Increment the download counter */
  trackDownload: () => void;
  /** Increment the model switch counter */
  trackModelSwitch: () => void;
  /** Manually check eligibility (called automatically when thresholds may be met) */
  checkEligibility: () => Promise<void>;
  /** Whether the user is eligible for the discount */
  isEligible: boolean;
  /** Status of each threshold */
  thresholdsStatus: IThresholdsStatus;
  /** Number of thresholds met */
  thresholdsMet: number;
}

/**
 * Hook to track user engagement and check eligibility for first-purchase discount.
 *
 * @example
 * ```tsx
 * const { trackUpscale, trackDownload, trackModelSwitch } = useEngagementTracker();
 *
 * // When user completes an upscale
 * trackUpscale();
 *
 * // When user downloads an image
 * trackDownload();
 *
 * // When user switches AI model
 * trackModelSwitch();
 * ```
 */
export function useEngagementTracker(): IUseEngagementTrackerReturn {
  const { isFreeUser } = useUserData();
  const userId = useUserStore(state => state.user?.id);
  const {
    signals,
    setSignals,
    isEligible,
    setIsEligible,
    hasCheckedEligibility,
    setHasCheckedEligibility,
    setShowToast,
    setOffer,
    setCountdownEndTime,
  } = useEngagementDiscountStore();

  const eligibilityCheckInProgress = useRef(false);

  // Load signals on mount
  useEffect(() => {
    const loaded = loadSignals();
    setSignals(loaded);
  }, [setSignals]);

  /**
   * Check eligibility with the server.
   * Only called when thresholds may be met and user is free.
   */
  const checkEligibilityServer = useCallback(async () => {
    // Don't check if already ineligible, already checked, or not a free user
    if (hasCheckedEligibility || !isFreeUser || eligibilityCheckInProgress.current) {
      return;
    }

    eligibilityCheckInProgress.current = true;

    try {
      let accessToken: string | null = null;

      // In Playwright test mode, bypass Supabase session (cookie-based auth doesn't
      // work reliably in test environments). Use the test token accepted by verifyApiAuth
      // when ENV=test.
      if (
        typeof window !== 'undefined' &&
        (window as Window & { playwrightTest?: boolean }).playwrightTest === true
      ) {
        accessToken = 'test_auth_token_for_testing_only';
      } else {
        // Get the Supabase access token for Bearer auth
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          // Not authenticated - skip silently
          setHasCheckedEligibility(true);
          return;
        }
        accessToken = session.access_token;
      }

      const response = await fetch('/api/engagement-discount/eligibility', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      setHasCheckedEligibility(true);

      if (data.eligible) {
        setIsEligible(true);
        setOffer({
          userId: userId || '',
          offeredAt: new Date().toISOString(),
          expiresAt: data.discountExpiresAt,
          discountPercent: data.discountPercent,
          targetPackKey: data.targetPackKey,
          originalPriceCents: data.originalPriceCents,
          discountedPriceCents: data.discountedPriceCents,
          couponId: data.couponId,
          redeemed: false,
        });

        // Set countdown end time
        const expiresAt = new Date(data.discountExpiresAt).getTime();
        setCountdownEndTime(expiresAt);

        // Show the toast
        setShowToast(true);

        // Track analytics
        analytics.track('engagement_discount_eligible', {
          thresholdsMet: checkEngagementEligibility(signals).thresholdsMet,
          thresholdsStatus: checkEngagementEligibility(signals).thresholdsStatus,
        });
      } else {
        setIsEligible(false);
      }
    } catch (error) {
      console.error('[EngagementTracker] Error checking eligibility:', error);
    } finally {
      eligibilityCheckInProgress.current = false;
    }
  }, [
    hasCheckedEligibility,
    isFreeUser,
    userId,
    setHasCheckedEligibility,
    setIsEligible,
    setOffer,
    setCountdownEndTime,
    setShowToast,
    signals,
  ]);

  /**
   * Update signals and check eligibility if thresholds may be met.
   */
  const updateSignals = useCallback(
    (updater: (prev: IEngagementSignals) => IEngagementSignals) => {
      setSignals(prev => {
        const next = updater(prev);
        saveSignals(next);

        // Check if we might be eligible now
        const eligibility = checkEngagementEligibility(next);
        if (eligibility.isEligible && isFreeUser && !hasCheckedEligibility) {
          // Defer eligibility check to next tick to avoid state updates during render
          setTimeout(() => {
            checkEligibilityServer();
          }, 0);
        }

        return next;
      });
    },
    [setSignals, isFreeUser, hasCheckedEligibility, checkEligibilityServer]
  );

  /**
   * Track an upscale event.
   */
  const trackUpscale = useCallback(() => {
    updateSignals(prev => ({
      ...prev,
      upscales: prev.upscales + 1,
    }));
  }, [updateSignals]);

  /**
   * Track a download event.
   */
  const trackDownload = useCallback(() => {
    updateSignals(prev => ({
      ...prev,
      downloads: prev.downloads + 1,
    }));
  }, [updateSignals]);

  /**
   * Track a model switch event.
   */
  const trackModelSwitch = useCallback(() => {
    updateSignals(prev => ({
      ...prev,
      modelSwitches: prev.modelSwitches + 1,
    }));
  }, [updateSignals]);

  // Calculate eligibility status from current signals
  const eligibility = checkEngagementEligibility(signals);

  return {
    signals,
    trackUpscale,
    trackDownload,
    trackModelSwitch,
    checkEligibility: checkEligibilityServer,
    isEligible: isEligible || eligibility.isEligible,
    thresholdsStatus: eligibility.thresholdsStatus,
    thresholdsMet: eligibility.thresholdsMet,
  };
}
