'use client';

import { useState, useCallback, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquare, X } from 'lucide-react';
import { analytics } from '@client/analytics';

/**
 * Exit survey reason type
 */
export type TExitSurveyReason =
  | 'price_too_high'
  | 'payment_method_not_accepted'
  | 'not_sure_needed'
  | 'technical_issue'
  | 'just_browsing'
  | 'other';

interface ICheckoutExitSurveyProps {
  priceId: string;
  timeSpentMs: number;
  onClose: () => void;
}

/**
 * Exit survey shown when user closes checkout without completing.
 * Only shown if user spent >5 seconds in checkout (filters accidental closes).
 *
 * Features:
 * - Single question: "What stopped you from completing your purchase?"
 * - Radio buttons for predefined options
 * - Text field for "Other" (conditionally shown)
 * - Submit and Skip buttons
 * - Frequency cap: Max 1 survey per user per week (localStorage)
 *
 * @example
 * ```tsx
 * <CheckoutExitSurvey
 *   priceId="price_123"
 *   timeSpentMs={15000}
 *   onClose={() => setShowSurvey(false)}
 * />
 * ```
 */
export function CheckoutExitSurvey({
  priceId,
  timeSpentMs,
  onClose,
}: ICheckoutExitSurveyProps): JSX.Element {
  const t = useTranslations('stripe.exitSurvey');
  const [selectedReason, setSelectedReason] = useState<TExitSurveyReason | ''>('');
  const [otherReason, setOtherReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const surveyOptions: { value: TExitSurveyReason; label: string }[] = [
    { value: 'price_too_high', label: t('options.price_too_high') },
    { value: 'payment_method_not_accepted', label: t('options.payment_method_not_accepted') },
    { value: 'not_sure_needed', label: t('options.not_sure_needed') },
    { value: 'technical_issue', label: t('options.technical_issue') },
    { value: 'just_browsing', label: t('options.just_browsing') },
    { value: 'other', label: t('options.other') },
  ];

  const handleSubmit = useCallback(() => {
    if (!selectedReason) return;

    analytics.track('checkout_exit_survey_response', {
      reason: selectedReason,
      otherReason: selectedReason === 'other' ? otherReason : undefined,
      priceId,
      timeSpentMs,
    });

    setSubmitted(true);

    // Auto-close after showing thanks message
    setTimeout(() => {
      onClose();
    }, 1500);
  }, [selectedReason, otherReason, priceId, timeSpentMs, onClose]);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-muted-foreground hover:text-primary transition-colors bg-surface rounded-full"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {submitted ? (
          <ThanksMessage />
        ) : (
          <SurveyForm
            title={t('title')}
            question={t('question')}
            options={surveyOptions}
            selectedReason={selectedReason}
            otherReason={otherReason}
            otherPlaceholder={t('otherPlaceholder')}
            submitLabel={t('submit')}
            skipLabel={t('skip')}
            onReasonChange={setSelectedReason}
            onOtherReasonChange={setOtherReason}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
          />
        )}
      </div>
    </div>
  );
}

interface ISurveyFormProps {
  title: string;
  question: string;
  options: { value: TExitSurveyReason; label: string }[];
  selectedReason: TExitSurveyReason | '';
  otherReason: string;
  otherPlaceholder: string;
  submitLabel: string;
  skipLabel: string;
  onReasonChange: (reason: TExitSurveyReason | '') => void;
  onOtherReasonChange: (reason: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}

function SurveyForm({
  title,
  question,
  options,
  selectedReason,
  otherReason,
  otherPlaceholder,
  submitLabel,
  skipLabel,
  onReasonChange,
  onOtherReasonChange,
  onSubmit,
  onSkip,
}: ISurveyFormProps): JSX.Element {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pr-8">
        <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-primary">{title}</h3>
          <p className="text-sm text-muted-foreground">{question}</p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map(option => (
          <label
            key={option.value}
            className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
              selectedReason === option.value
                ? 'border-accent bg-accent/5'
                : 'border-border hover:bg-surface/50'
            }`}
          >
            <input
              type="radio"
              name="exitReason"
              value={option.value}
              checked={selectedReason === option.value}
              onChange={e => onReasonChange(e.target.value as TExitSurveyReason)}
              className="w-4 h-4 text-accent border-border focus:ring-accent"
            />
            <span className="ml-3 text-sm text-muted-foreground">{option.label}</span>
          </label>
        ))}
      </div>

      {/* Other text field */}
      {selectedReason === 'other' && (
        <textarea
          value={otherReason}
          onChange={e => onOtherReasonChange(e.target.value)}
          placeholder={otherPlaceholder}
          className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent resize-none bg-surface text-primary placeholder:text-muted-foreground/50"
          rows={3}
        />
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 px-4 py-3 bg-surface-light hover:bg-surface-light/80 text-muted-foreground font-medium rounded-lg transition-colors"
        >
          {skipLabel}
        </button>
        <button
          onClick={onSubmit}
          disabled={!selectedReason}
          className="flex-1 px-4 py-3 bg-accent hover:bg-accent/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function ThanksMessage(): JSX.Element {
  const t = useTranslations('stripe.exitSurvey');

  return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-lg font-medium text-primary">{t('thanks')}</p>
    </div>
  );
}

/**
 * Check if the exit survey should be shown based on frequency cap.
 * Returns true if the survey hasn't been shown in the last week.
 */
export function shouldShowExitSurvey(timeSpentMs: number): boolean {
  // Only show if user spent more than 5 seconds
  if (timeSpentMs < 5000) return false;

  // Check frequency cap in localStorage
  if (typeof window === 'undefined') return false;

  const lastShownKey = 'checkout_survey_last_shown';
  const lastShown = localStorage.getItem(lastShownKey);

  if (lastShown) {
    const lastShownTime = parseInt(lastShown, 10);
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastShownTime < oneWeekMs) {
      return false;
    }
  }

  return true;
}

/**
 * Mark the exit survey as shown for frequency capping.
 */
export function markExitSurveyShown(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('checkout_survey_last_shown', Date.now().toString());
}
