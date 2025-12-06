'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Calendar, Info } from 'lucide-react';
import { StripeService } from '@client/services/stripeService';
import { getPlanForPriceId } from '@shared/config/stripe';
import { ModalHeader } from './ModalHeader';
import { PlanComparisonCard } from './PlanComparisonCard';
import { ProrationCard } from './ProrationCard';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorAlert } from './ErrorAlert';

/**
 * Format a date string for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface IPlanChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPriceId: string;
  currentPriceId?: string;
  onComplete?: () => void;
}

interface IPreviewData {
  proration: {
    amount_due: number;
    currency: string;
    period_start: string;
    period_end: string;
  };
  current_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  } | null;
  new_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  };
  effective_immediately: boolean;
  effective_date?: string;
  is_downgrade: boolean;
}

export function PlanChangeModal({
  isOpen,
  onClose,
  targetPriceId,
  currentPriceId,
  onComplete,
}: IPlanChangeModalProps): JSX.Element {
  const router = useRouter();
  const [preview, setPreview] = useState<IPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetPlan = getPlanForPriceId(targetPriceId);
  const currentPlan = currentPriceId ? getPlanForPriceId(currentPriceId) : null;

  const loadPreview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const previewData = await StripeService.previewSubscriptionChange(targetPriceId);
      setPreview(previewData);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to preview subscription change';
      setError(errorMessage);
      console.error('Preview error:', err);
    } finally {
      setLoading(false);
    }
  }, [targetPriceId]);

  useEffect(() => {
    if (isOpen && targetPriceId) {
      loadPreview();
    }
  }, [isOpen, targetPriceId, loadPreview]);

  const handleConfirmChange = async () => {
    try {
      setChanging(true);
      setError(null);

      await StripeService.changeSubscription(targetPriceId);

      // Build confirmation URL with details
      const params = new URLSearchParams({
        type: preview?.is_downgrade ? 'downgrade' : 'upgrade',
        new_price_id: targetPriceId,
        old_price_id: currentPriceId || '',
      });

      if (preview?.effective_date) {
        params.set('effective_date', preview.effective_date);
      }

      if (preview?.proration?.amount_due) {
        params.set('proration_amount', String(preview.proration.amount_due));
      }

      // Close modal and redirect to confirmation page
      onClose();
      onComplete?.();
      router.push(`/subscription/confirmed?${params.toString()}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change subscription';
      setError(errorMessage);
      console.error('Change error:', err);
    } finally {
      setChanging(false);
    }
  };

  if (!isOpen || !targetPlan) return <></>;

  const isUpgrade = currentPlan ? targetPlan.creditsPerMonth > currentPlan.creditsPerMonth : true;
  const Icon = isUpgrade ? TrendingUp : TrendingDown;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <ModalHeader
          title={currentPlan ? 'Change Plan' : 'Select Plan'}
          icon={Icon}
          iconClassName={isUpgrade ? 'text-green-600' : 'text-orange-600'}
          onClose={onClose}
          disabled={changing}
        />

        <div className="p-6">
          {loading && <LoadingSpinner message="Calculating plan changes..." />}

          {error && <ErrorAlert message={error} className="mb-6" />}

          {preview && !loading && preview.new_plan && (
            <>
              {/* Plan Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {preview.current_plan && (
                  <PlanComparisonCard
                    title="Current Plan"
                    name={preview.current_plan.name}
                    creditsPerMonth={preview.current_plan.credits_per_month}
                    variant="current"
                  />
                )}

                <PlanComparisonCard
                  title="New Plan"
                  name={preview.new_plan.name}
                  creditsPerMonth={preview.new_plan.credits_per_month}
                  variant={isUpgrade ? 'upgrade' : 'downgrade'}
                  effectiveText={
                    preview.effective_immediately
                      ? 'Immediately'
                      : preview.effective_date
                        ? formatDate(preview.effective_date)
                        : 'Next billing cycle'
                  }
                />
              </div>

              {/* Upgrade: Show Proration Details */}
              {preview.current_plan && !preview.is_downgrade && (
                <ProrationCard amountDue={preview.proration.amount_due} />
              )}

              {/* Downgrade: Show Scheduled Change Info */}
              {preview.is_downgrade && preview.effective_date && (
                <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-medium text-slate-900 mb-1">Scheduled Downgrade</h3>
                      <p className="text-sm text-slate-600 mb-3">
                        Your plan will change to <strong>{preview.new_plan.name}</strong> on{' '}
                        <strong>{formatDate(preview.effective_date)}</strong>.
                      </p>
                      <div className="flex items-start gap-2 text-sm text-slate-500 bg-white/50 rounded p-2">
                        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>
                          You&apos;ll keep your current {preview.current_plan?.name} plan benefits
                          until then. No refund or additional charges.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  disabled={changing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmChange}
                  className={`px-6 py-2 text-white rounded-lg transition-colors ${
                    isUpgrade
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-orange-600 hover:bg-orange-700'
                  } ${changing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={changing}
                >
                  {changing
                    ? 'Processing...'
                    : isUpgrade
                      ? 'Confirm Upgrade'
                      : 'Schedule Downgrade'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
