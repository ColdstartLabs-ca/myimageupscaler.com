'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import type {
  CancellationReasonKey,
  RetentionPlanKey,
} from '@shared/config/cancellation-retention';
import { supabase } from '@server/supabase/supabaseClient';
import { ModalHeader } from './ModalHeader';

interface ICancelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
  planName: string;
  periodEnd: string;
  onAcceptRetentionOffer?: (targetPlanKey: RetentionPlanKey) => void;
}

function getCancellationReasons(t: ReturnType<typeof useTranslations>) {
  return [
    { key: 'too_expensive', label: t('reasons.tooExpensive') },
    { key: 'not_using_enough', label: t('reasons.notUsingEnough') },
    { key: 'missing_features', label: t('reasons.missingFeatures') },
    { key: 'switching_competitor', label: t('reasons.switchingCompetitor') },
    { key: 'technical_issues', label: t('reasons.technicalIssues') },
    { key: 'other', label: t('reasons.other') },
  ] as const satisfies ReadonlyArray<{ key: CancellationReasonKey; label: string }>;
}

/**
 * Modal for canceling a subscription with optional reason
 *
 * Features:
 * - Shows clear information about cancellation (keeps access until period end)
 * - Optional reason selection with custom text input
 * - Confirmation step to prevent accidental cancellations
 */
export function CancelSubscriptionModal({
  isOpen,
  onClose,
  onConfirm,
  planName,
  periodEnd,
  onAcceptRetentionOffer,
}: ICancelSubscriptionModalProps): JSX.Element | null {
  const t = useTranslations('stripe.cancelSubscription');
  const billingT = useTranslations('dashboard.billing');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [selectedReasonKey, setSelectedReasonKey] = useState<CancellationReasonKey | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showRetentionOffer, setShowRetentionOffer] = useState(false);
  const [retentionOffer, setRetentionOffer] = useState<{
    targetPlanKey: RetentionPlanKey;
    targetPlanName: string;
  } | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const busyRef = useRef(false);

  const resetFlow = () => {
    setSelectedReason('');
    setSelectedReasonKey(null);
    setCustomReason('');
    setLoading(false);
    setShowConfirmation(false);
    setShowRetentionOffer(false);
    setRetentionOffer(null);
    setOfferLoading(false);
    busyRef.current = false;
  };

  useEffect(() => {
    if (!isOpen) {
      requestSequence.current += 1;
      resetFlow();
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleReasonChange = (reasonKey: CancellationReasonKey, reason: string) => {
    setSelectedReasonKey(reasonKey);
    setSelectedReason(reason);
    if (reasonKey !== 'other') {
      setCustomReason('');
    }
  };

  const handleContinue = async () => {
    if (!selectedReasonKey || !onAcceptRetentionOffer) {
      setShowConfirmation(true);
      return;
    }
    if (offerLoading) return;
    const sequence = ++requestSequence.current;
    setOfferLoading(true);
    busyRef.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error('User not authenticated');
      const response = await fetch('/api/subscriptions/retention-offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ reason: selectedReasonKey }),
      });
      const result = await response.json();
      if (sequence !== requestSequence.current) return;
      const offer = response.ok ? result.data?.offer : null;
      if (offer) {
        setRetentionOffer(offer);
        setShowRetentionOffer(true);
      } else {
        setShowConfirmation(true);
      }
    } catch {
      if (sequence !== requestSequence.current) return;
      setShowConfirmation(true);
    } finally {
      if (sequence === requestSequence.current) {
        setOfferLoading(false);
        busyRef.current = false;
      }
    }
  };

  const handleCancel = async () => {
    try {
      setLoading(true);
      busyRef.current = true;
      const reason = selectedReason === t('reasons.other') ? customReason : selectedReason;
      await onConfirm(reason || undefined);
      onClose();
    } catch (error) {
      console.error('Error canceling subscription:', error);
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  const formattedEndDate = dayjs(periodEnd).format('MMMM D, YYYY');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        tabIndex={-1}
        className="bg-surface rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <ModalHeader
          title={t('title')}
          icon={AlertTriangle}
          iconClassName="text-error"
          onClose={onClose}
          disabled={loading || offerLoading}
        />

        <div className="p-6 space-y-6">
          {showRetentionOffer && retentionOffer ? (
            <CancellationRetentionOffer
              targetPlanName={retentionOffer.targetPlanName}
              onAccept={() => onAcceptRetentionOffer?.(retentionOffer.targetPlanKey)}
              onContinueCancellation={() => {
                setShowRetentionOffer(false);
                setShowConfirmation(true);
              }}
              title={billingT('subscriptionBetterValue')}
              changePlanLabel={billingT('changePlan')}
              cancelLabel={billingT('cancelSubscription')}
            />
          ) : !showConfirmation ? (
            <CancellationReasonForm
              planName={planName}
              formattedEndDate={formattedEndDate}
              selectedReason={selectedReason}
              customReason={customReason}
              loading={loading}
              offerLoading={offerLoading}
              onReasonChange={handleReasonChange}
              onCustomReasonChange={setCustomReason}
              onClose={onClose}
              onContinue={handleContinue}
            />
          ) : (
            <CancellationConfirmation
              formattedEndDate={formattedEndDate}
              loading={loading}
              onGoBack={() => {
                setShowConfirmation(false);
                if (retentionOffer && onAcceptRetentionOffer) setShowRetentionOffer(true);
              }}
              onConfirm={handleCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface ICancellationReasonFormProps {
  planName: string;
  formattedEndDate: string;
  selectedReason: string;
  customReason: string;
  loading: boolean;
  offerLoading: boolean;
  onReasonChange: (reasonKey: CancellationReasonKey, reason: string) => void;
  onCustomReasonChange: (reason: string) => void;
  onClose: () => void;
  onContinue: () => void;
}

function CancellationReasonForm({
  planName,
  formattedEndDate,
  selectedReason,
  customReason,
  loading,
  offerLoading,
  onReasonChange,
  onCustomReasonChange,
  onClose,
  onContinue,
}: ICancellationReasonFormProps): JSX.Element {
  const t = useTranslations('stripe.cancelSubscription');
  const reasons = getCancellationReasons(t);

  return (
    <>
      {/* Cancellation Info */}
      <div className="bg-info/10 border border-info/20 rounded-lg p-4">
        <p className="text-sm text-info">
          <strong>{t('info', { planName, formattedEndDate })}</strong>
          <br />
          <br />
          {t('keepAccess')}
        </p>
      </div>

      {/* Optional Reason */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-3">
          {t('helpUsImprove')}
        </label>
        <div className="space-y-2">
          {reasons.map(reason => (
            <label
              key={reason.key}
              className="flex items-center p-3 border border-border rounded-lg hover:bg-surface cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="reason"
                value={reason.key}
                checked={selectedReason === reason.label}
                onChange={() => onReasonChange(reason.key, reason.label)}
                className="w-4 h-4 text-accent border-border focus:ring-accent"
              />
              <span className="ml-3 text-sm text-muted-foreground">{reason.label}</span>
            </label>
          ))}
        </div>

        {/* Custom Reason Input */}
        {selectedReason === t('reasons.other') && (
          <textarea
            value={customReason}
            onChange={e => onCustomReasonChange(e.target.value)}
            placeholder={t('otherPlaceholder')}
            className="mt-3 w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
            rows={3}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-surface-light hover:bg-surface-light text-muted-foreground font-medium rounded-lg transition-colors"
          disabled={loading || offerLoading}
        >
          {t('keepSubscription')}
        </button>
        <button
          onClick={onContinue}
          className="flex-1 px-4 py-3 bg-error hover:bg-error/80 text-white font-medium rounded-lg transition-colors"
          disabled={loading}
        >
          {offerLoading ? t('processing') : t('continue')}
        </button>
      </div>
    </>
  );
}

interface ICancellationRetentionOfferProps {
  targetPlanName: string;
  title: string;
  changePlanLabel: string;
  cancelLabel: string;
  onAccept: () => void;
  onContinueCancellation: () => void;
}

function CancellationRetentionOffer({
  targetPlanName,
  title,
  changePlanLabel,
  cancelLabel,
  onAccept,
  onContinueCancellation,
}: ICancellationRetentionOfferProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent/20 bg-accent/10 p-5 text-center">
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{targetPlanName}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onAccept}
          className="flex-1 rounded-lg bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {changePlanLabel}
        </button>
        <button
          onClick={onContinueCancellation}
          className="flex-1 rounded-lg bg-surface-light px-4 py-3 font-medium text-muted-foreground transition-colors hover:bg-surface-light"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

interface ICancellationConfirmationProps {
  formattedEndDate: string;
  loading: boolean;
  onGoBack: () => void;
  onConfirm: () => void;
}

function CancellationConfirmation({
  formattedEndDate,
  loading,
  onGoBack,
  onConfirm,
}: ICancellationConfirmationProps): JSX.Element {
  const t = useTranslations('stripe.cancelSubscription');

  return (
    <>
      {/* Confirmation Step */}
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="h-8 w-8 text-error" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-primary mb-2">{t('confirmationTitle')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('confirmationText', { formattedEndDate })}
          </p>
        </div>
      </div>

      {/* Final Actions */}
      <div className="flex gap-3">
        <button
          onClick={onGoBack}
          className="flex-1 px-4 py-3 bg-surface-light hover:bg-surface-light text-muted-foreground font-medium rounded-lg transition-colors"
          disabled={loading}
        >
          {t('goBack')}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-4 py-3 bg-error hover:bg-error/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? t('canceling') : t('yesCancel')}
        </button>
      </div>
    </>
  );
}
