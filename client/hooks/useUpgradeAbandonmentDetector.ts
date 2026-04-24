/**
 * Upgrade Abandonment Detector Hook
 *
 * Listens for `upgrade_prompt_clicked` via the analytics event bus.
 * If the user does NOT open the checkout within 10 minutes, checks eligibility
 * for the engagement discount and shows the toast banner with source='abandonment'.
 *
 * Guards:
 * - Only runs for free users.
 * - Fires at most once per browser session (sessionStorage key).
 * - Cancelled immediately if `checkout_opened` fires before the timeout.
 *
 * @see docs/PRDs/click-to-checkout-conversion-fix.md — Phase 5
 */

import { useEffect, useRef } from 'react';
import { onAnalyticsEvent, offAnalyticsEvent } from '@client/analytics/analyticsClient';
import { useEngagementDiscountStore } from '@client/store/engagementDiscountStore';
import { createClient } from '@shared/utils/supabase/client';

// sessionStorage key to enforce once-per-session firing
const ABANDONMENT_FIRED_KEY = 'abandonment_detector_fired';

// 10 minutes in milliseconds
const ABANDONMENT_TIMEOUT_MS = 10 * 60 * 1000;

export interface IUseUpgradeAbandonmentDetectorOptions {
  /** Whether the current user is on the free tier. Hook is a no-op for paid users. */
  isFreeUser: boolean;
  /** The authenticated user's ID (used in eligibility response storage). */
  userId?: string;
}

/**
 * Mount once in Workspace to enable checkout-abandonment discount recovery.
 */
export function useUpgradeAbandonmentDetector({
  isFreeUser,
  userId,
}: IUseUpgradeAbandonmentDetectorOptions): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    setIsEligible,
    setOffer,
    setCountdownEndTime,
    setShowToast,
    setHasCheckedEligibility,
    setDiscountSource,
    wasDismissed,
    hasCheckedEligibility,
  } = useEngagementDiscountStore();

  useEffect(() => {
    // Only run for free users
    if (!isFreeUser) return;

    // Check once-per-session guard
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(ABANDONMENT_FIRED_KEY)) {
      return;
    }

    /**
     * Called when the 10-minute timeout fires without a checkout_opened event.
     * Fetches eligibility and shows the discount banner if the user qualifies.
     */
    const checkAndOffer = async () => {
      // Mark as fired for this session — before any async work to avoid double-fire
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(ABANDONMENT_FIRED_KEY, '1');
      }

      // Don't show if already dismissed or already offered
      if (wasDismissed || hasCheckedEligibility) return;

      try {
        let accessToken: string | null = null;

        if (
          typeof window !== 'undefined' &&
          (window as Window & { playwrightTest?: boolean }).playwrightTest === true
        ) {
          accessToken = 'test_auth_token_for_testing_only';
        } else {
          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token) return;
          accessToken = session.access_token;
        }

        const response = await fetch('/api/engagement-discount/eligibility', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) return;

        const data = (await response.json()) as {
          eligible: boolean;
          discountExpiresAt?: string;
          discountPercent?: number;
          targetPackKey?: string;
          originalPriceCents?: number;
          discountedPriceCents?: number;
          couponId?: string;
        };

        setHasCheckedEligibility(true);

        if (data.eligible && data.discountExpiresAt) {
          setIsEligible(true);
          setOffer({
            userId: userId ?? '',
            offeredAt: new Date().toISOString(),
            expiresAt: data.discountExpiresAt,
            discountPercent: data.discountPercent ?? 0,
            targetPackKey: data.targetPackKey ?? '',
            originalPriceCents: data.originalPriceCents ?? 0,
            discountedPriceCents: data.discountedPriceCents ?? 0,
            couponId: data.couponId ?? '',
            redeemed: false,
          });
          const expiresAt = new Date(data.discountExpiresAt).getTime();
          setCountdownEndTime(expiresAt);
          // Tag the source so the banner can pass it to analytics
          setDiscountSource('abandonment');
          // Show the banner — EngagementDiscountBanner reads from this store
          setShowToast(true);
        } else {
          setIsEligible(false);
        }
      } catch {
        // Silently ignore — abandonment recovery is best-effort
      }
    };

    /**
     * Starts (or restarts) the 10-minute abandonment timer.
     */
    const onUpgradePromptClicked = () => {
      // Clear any existing timer so overlapping clicks reset the countdown
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        void checkAndOffer();
      }, ABANDONMENT_TIMEOUT_MS);
    };

    /**
     * Cancels the timer when the user actually opens checkout.
     */
    const onCheckoutOpened = () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    onAnalyticsEvent('upgrade_prompt_clicked', onUpgradePromptClicked);
    onAnalyticsEvent('checkout_opened', onCheckoutOpened);

    return () => {
      offAnalyticsEvent('upgrade_prompt_clicked', onUpgradePromptClicked);
      offAnalyticsEvent('checkout_opened', onCheckoutOpened);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeUser]);
  // Note: store actions are stable refs from zustand; userId and store state
  // values (wasDismissed, hasCheckedEligibility) are intentionally captured at
  // subscription time to avoid re-registering listeners on every render.
}
