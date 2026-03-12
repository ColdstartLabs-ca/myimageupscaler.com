'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { analytics } from '@client/analytics/analyticsClient';

export type PreCheckoutEmailCaptureSource =
  | 'pricing_page'
  | 'upgrade_prompt'
  | 'out_of_credits'
  | 'premium_upsell';

export interface IPreCheckoutEmailCaptureProps {
  /** Source where the capture was triggered */
  source: PreCheckoutEmailCaptureSource;
  /** Pre-selected plan ID if any */
  planId?: string;
  /** Callback when email is successfully captured */
  onCaptured?: (email: string, consent: boolean) => void;
  /** Callback when modal is dismissed */
  onDismiss?: () => void;
  /** Callback when modal is shown */
  onShown?: () => void;
}

export interface IPreCheckoutEmailCaptureState {
  email: string;
  consent: boolean;
  isValid: boolean;
  isSubmitting: boolean;
  error?: string;
}

/**
 * Pre-checkout email capture modal for anonymous users.
 *
 * Shows an optional email capture form when anonymous users
 * click "Upgrade" or navigate to pricing. This allows us to
 * re-engage users who abandon checkout.
 *
 * @example
 * ```tsx
 * const { showModal, closeModal } = usePreCheckoutEmailCapture();
 *
 * {showModal && (
 *   <PreCheckoutEmailCapture
 *     source="pricing_page"
 *     planId="pro"
 *     onCaptured={(email) => console.log('Captured:', email)}
 *     onDismiss={() => closeModal()}
 *   />
 * )}
 * ```
 */
export function PreCheckoutEmailCapture({
  source,
  planId,
  onCaptured,
  onDismiss,
  onShown,
}: IPreCheckoutEmailCaptureProps): JSX.Element | null {
  const [state, setState] = useState<IPreCheckoutEmailCaptureState>({
    email: '',
    consent: false,
    isValid: true,
    isSubmitting: false,
    error: undefined,
  });

  // Track shown event on mount
  useState(() => {
    analytics.track('pre_checkout_email_shown', {
      source,
      hasPlanId: Boolean(planId),
    });
    onShown?.();
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (email: string) => {
    setState(prev => ({
      ...prev,
      email,
      isValid: email === '' || validateEmail(email),
      error: undefined,
    }));
  };

  const handleConsentChange = (consent: boolean) => {
    setState(prev => ({ ...prev, consent }));
  };

  const handleSubmit = async () => {
    if (!state.email || !validateEmail(state.email)) {
      setState(prev => ({ ...prev, error: 'Please enter a valid email address' }));
      return;
    }

    setState(prev => ({ ...prev, isSubmitting: true, error: undefined }));

    try {
      // Store email in localStorage
      localStorage.setItem(
        'miu_checkout_email',
        JSON.stringify({
          email: state.email,
          consent: state.consent,
          timestamp: Date.now(),
        })
      );

      // Track analytics
      analytics.track('pre_checkout_email_captured', {
        source,
        consent: state.consent,
      });

      setState(prev => ({ ...prev, isSubmitting: false }));
      onCaptured?.(state.email, state.consent);
    } catch (_error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: 'Failed to save email. Please try again.',
      }));
    }
  };

  const handleSkip = () => {
    analytics.track('pre_checkout_email_dismissed', { source });
    onDismiss?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md mx-4 bg-surface-elevated rounded-xl shadow-2xl border border-border-default">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-text-muted hover:text-white transition-colors p-2 rounded-full hover:bg-white/5"
          aria-label="Close"
        >
          <span className="sr-only">Close</span>×
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">Complete Your Purchase</h2>
          </div>
          <p className="text-sm text-text-secondary">
            Enter your email to save your cart and receive recovery updates.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSubmit();
          }}
          className="px-6 pb-6 space-y-4"
        >
          {/* Email input */}
          <div>
            <label
              htmlFor="pre-checkout-email"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Email address
            </label>
            <input
              id="pre-checkout-email"
              type="email"
              value={state.email}
              onChange={e => handleEmailChange(e.target.value)}
              placeholder="you@example.com"
              disabled={state.isSubmitting}
              className={`w-full px-4 py-2.5 rounded-lg border bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-colors ${
                state.isValid ? 'border-border-default' : 'border-red-500'
              } ${state.isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {state.error && <p className="text-sm text-red-500 mt-1">{state.error}</p>}
          </div>

          {/* Marketing consent checkbox */}
          <div className="flex items-start gap-3">
            <input
              id="pre-checkout-consent"
              type="checkbox"
              checked={state.consent}
              onChange={e => handleConsentChange(e.target.checked)}
              disabled={state.isSubmitting}
              className="mt-0.5 w-4 h-4 rounded border-border-default bg-surface text-accent focus:ring-accent focus:ring-2"
            />
            <label
              htmlFor="pre-checkout-consent"
              className="text-sm text-text-secondary cursor-pointer"
            >
              Send me product updates and special offers
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSkip}
              disabled={state.isSubmitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-text-secondary bg-surface-hover rounded-lg hover:bg-surface-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue without email
            </button>
            <button
              type="submit"
              disabled={!state.email || !state.isValid || state.isSubmitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state.isSubmitting ? (
                'Saving...'
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Save & Continue
                </>
              )}
            </button>
          </div>
        </form>

        {/* Privacy notice */}
        <div className="px-6 pb-4">
          <p className="text-xs text-text-muted">
            We&apos;ll only use this email to help you complete your purchase and send recovery
            reminders. You can unsubscribe from marketing emails at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
