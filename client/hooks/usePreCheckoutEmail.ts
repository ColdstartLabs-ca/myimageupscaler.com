'use client';

import { useState, useCallback, useEffect } from 'react';
import { analytics } from '@client/analytics/analyticsClient';

/**
 * LocalStorage key for pre-checkout email capture
 */
const PRE_CHECKOUT_EMAIL_KEY = 'miu_checkout_email';

/**
 * Data structure for pre-checkout email
 */
interface IPreCheckoutEmailData {
  email: string;
  consent: boolean;
  timestamp: number;
}

function getStorage(): Storage | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  return globalThis.localStorage;
}

function readStoredEmail(): string | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  try {
    const stored = storage.getItem(PRE_CHECKOUT_EMAIL_KEY);
    if (!stored) {
      return undefined;
    }

    const data: IPreCheckoutEmailData = JSON.parse(stored);
    return data.email;
  } catch {
    return undefined;
  }
}

/**
 * Hook for managing pre-checkout email capture in localStorage.
 *
 * This hook is used when anonymous users click "Upgrade" or navigate to pricing.
 * It persists email across sessions for recovery emails.
 *
 * @example
 * ```tsx
 * const { email, saveEmail, clearEmail, hasEmail } = usePreCheckoutEmail();
 *
 * // Save email
 * saveEmail('user@example.com', true);
 *
 * // Check if email exists
 * if (hasEmail) {
 *   console.log('Email on file:', email);
 * }
 *
 * // Clear email
 * clearEmail();
 * ```
 */
export function usePreCheckoutEmail(): {
  email: string | undefined;
  saveEmail: (email: string, consent?: boolean) => void;
  getEmail: () => string | undefined;
  hasEmail: boolean;
  clearEmail: () => void;
  trackDismiss: (source: string) => void;
} {
  const [email, setEmailState] = useState<string | undefined>(() => readStoredEmail());

  useEffect(() => {
    setEmailState(readStoredEmail());
  }, []);

  /**
   * Save email to localStorage
   */
  const saveEmail = useCallback((email: string, consent: boolean = false) => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      const data: IPreCheckoutEmailData = {
        email,
        consent,
        timestamp: Date.now(),
      };

      storage.setItem(PRE_CHECKOUT_EMAIL_KEY, JSON.stringify(data));
      setEmailState(email);

      // Track analytics
      analytics.track('pre_checkout_email_captured', {
        consent,
      });
    } catch (_error) {
      console.error('Failed to save pre-checkout email:', _error);
    }
  }, []);

  /**
   * Get the stored email
   */
  const getEmail = useCallback((): string | undefined => {
    return readStoredEmail();
  }, []);

  /**
   * Check if email is stored
   */
  const hasEmail = typeof email !== 'undefined';

  /**
   * Clear email from localStorage
   */
  const clearEmail = useCallback(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(PRE_CHECKOUT_EMAIL_KEY);
      setEmailState(undefined);
    } catch (_error) {
      console.error('Failed to clear pre-checkout email:', _error);
    }
  }, []);

  /**
   * Track when email capture is dismissed
   */
  const trackDismiss = useCallback((source: string) => {
    analytics.track('pre_checkout_email_dismissed', { source });
  }, []);

  return {
    email,
    saveEmail,
    getEmail,
    hasEmail,
    clearEmail,
    trackDismiss,
  };
}
