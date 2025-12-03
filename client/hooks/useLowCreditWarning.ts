'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useToastStore } from '@client/store/toastStore';
import { StripeService } from '@client/services/stripeService';

// Low credit threshold - show warning when credits fall below this amount
const LOW_CREDIT_THRESHOLD = 5;

// Time interval to check credits (in milliseconds)
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Store if we've already shown a warning for current session to avoid spam
const warningShownKey = 'low-credit-warning-shown';
const warningShownCreditsKey = 'low-credit-warning-credits';

/**
 * Hook to monitor user credits and show toast notifications when credits are low
 *
 * Automatically checks credits on mount and periodically thereafter
 * Shows a warning toast when credits fall below threshold, but only once per session
 *
 * Usage:
 * ```tsx
 * useLowCreditWarning();
 * ```
 */
export const useLowCreditWarning = (): void => {
  const { showToast } = useToastStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkCreditsAndShowWarning = useCallback(async (): Promise<void> => {
    try {
      const profile = await StripeService.getUserProfile();
      if (!profile) return;

      const creditBalance = profile.credits_balance || 0;

      // Only show warning if credits are low (>0 but <= threshold)
      if (creditBalance > 0 && creditBalance <= LOW_CREDIT_THRESHOLD) {
        const warningShown = localStorage.getItem(warningShownKey) === 'true';
        const lastWarningCredits = parseInt(localStorage.getItem(warningShownCreditsKey) || '0');

        // Show warning if we haven't shown it yet OR if credits changed since last warning
        if (!warningShown || lastWarningCredits !== creditBalance) {
          let message: string;

          if (creditBalance === 1) {
            message = `⚠️ Low credit warning: Only ${creditBalance} credit remaining. Upgrade your plan to avoid interruption!`;
          } else {
            message = `⚠️ Low credit warning: Only ${creditBalance} credits remaining. Consider upgrading your plan soon!`;
          }

          showToast({
            message,
            type: 'warning',
            duration: 8000, // Show for 8 seconds for warning
          });

          // Mark that we've shown the warning for these credits
          localStorage.setItem(warningShownKey, 'true');
          localStorage.setItem(warningShownCreditsKey, creditBalance.toString());
        }
      } else if (creditBalance > LOW_CREDIT_THRESHOLD) {
        // Reset warning flag if credits are back above threshold
        localStorage.removeItem(warningShownKey);
        localStorage.removeItem(warningShownCreditsKey);
      }
    } catch (error) {
      // Silently fail - don't show errors for credit checking
      console.log('[useLowCreditWarning] Failed to check credits:', error);
    }
  }, [showToast]);

  useEffect(() => {
    // Check credits immediately on mount
    checkCreditsAndShowWarning();

    // Set up periodic checking
    intervalRef.current = setInterval(checkCreditsAndShowWarning, CHECK_INTERVAL);

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkCreditsAndShowWarning]); // Dependency array - include the check function

  return;
};
