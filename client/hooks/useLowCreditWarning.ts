'use client';

import { useEffect, useCallback } from 'react';
import { useToastStore } from '@client/store/toastStore';
import { useCredits } from '@client/store/userStore';
import { getLowCreditWarningConfig } from '@shared/config/subscription.utils';

// Get warning configuration from centralized config
const warningConfig = getLowCreditWarningConfig();
const LOW_CREDIT_THRESHOLD = warningConfig.threshold;

// Store if we've already shown a warning for current session to avoid spam
const warningShownKey = 'low-credit-warning-shown';
const warningShownCreditsKey = 'low-credit-warning-credits';

/**
 * Hook to monitor user credits and show toast notifications when credits are low
 *
 * Subscribes to credit changes from the unified user store and shows warnings when needed
 * Shows a warning toast when credits fall below threshold, but only once per credit level
 *
 * Usage:
 * ```tsx
 * useLowCreditWarning();
 * ```
 */
export const useLowCreditWarning = (): void => {
  const { showToast } = useToastStore();
  const { total: creditBalance } = useCredits();

  const checkCreditsAndShowWarning = useCallback((): void => {
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
  }, [creditBalance, showToast]);

  useEffect(() => {
    // Check credits whenever balance changes
    checkCreditsAndShowWarning();
  }, [checkCreditsAndShowWarning]);

  return;
};
