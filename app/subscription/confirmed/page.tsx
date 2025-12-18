'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Calendar, CreditCard, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { getPlanByPriceId } from '@shared/config/subscription.utils';
import { resolvePlanOrPack } from '@shared/config/stripe';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function SubscriptionConfirmedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = searchParams.get('type'); // 'upgrade' | 'downgrade'
  const newPriceId = searchParams.get('new_price_id');
  const oldPriceId = searchParams.get('old_price_id');
  const effectiveDate = searchParams.get('effective_date');
  const prorationAmount = searchParams.get('proration_amount');

  // Use unified resolver first for consistent plan lookup
  const resolvedNewPlan = newPriceId ? resolvePlanOrPack(newPriceId) : null;
  const resolvedOldPlan = oldPriceId ? resolvePlanOrPack(oldPriceId) : null;

  // Fallback to legacy format for display compatibility
  const newPlan = newPriceId ? getPlanByPriceId(newPriceId) : null;
  const oldPlan = oldPriceId ? getPlanByPriceId(oldPriceId) : null;

  // Enhanced error handling for invalid price IDs
  useEffect(() => {
    if (newPriceId && !resolvedNewPlan) {
      console.error('[SUBSCRIPTION_CONFIRMED] Invalid new price ID:', newPriceId);
    }
    if (oldPriceId && !resolvedOldPlan) {
      console.error('[SUBSCRIPTION_CONFIRMED] Invalid old price ID:', oldPriceId);
    }
  }, [newPriceId, oldPriceId, resolvedNewPlan, resolvedOldPlan]);

  const isDowngrade = type === 'downgrade';

  // Redirect if missing required params
  useEffect(() => {
    if (!type || !newPriceId) {
      router.push('/pricing');
    }
  }, [type, newPriceId, router]);

  if (!newPlan) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
              isDowngrade ? 'bg-orange-100' : 'bg-green-100'
            } mb-4`}
          >
            <CheckCircle
              className={`w-8 h-8 ${isDowngrade ? 'text-orange-600' : 'text-green-600'}`}
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isDowngrade ? 'Downgrade Scheduled' : 'Upgrade Complete!'}
          </h1>
          <p className="text-slate-600">
            {isDowngrade
              ? 'Your plan change has been scheduled successfully.'
              : 'Your plan has been upgraded successfully.'}
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {/* Plan Change Summary */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                  {isDowngrade ? 'Current Plan' : 'Previous Plan'}
                </p>
                <p className="font-semibold text-slate-700">
                  {resolvedOldPlan?.name || oldPlan?.name || 'N/A'}
                </p>
                {(resolvedOldPlan || oldPlan) && (
                  <p className="text-sm text-slate-500">
                    {resolvedOldPlan?.creditsPerCycle || oldPlan?.creditsPerCycle} credits/mo
                  </p>
                )}
              </div>

              <ArrowRight className="w-5 h-5 text-slate-400 mx-4" />

              <div className="text-center flex-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                  {isDowngrade ? 'Scheduled Plan' : 'New Plan'}
                </p>
                <p
                  className={`font-semibold ${isDowngrade ? 'text-orange-600' : 'text-green-600'}`}
                >
                  {resolvedNewPlan?.name || newPlan?.name}
                </p>
                <p className="text-sm text-slate-500">
                  {resolvedNewPlan?.creditsPerCycle || newPlan?.creditsPerCycle} credits/mo
                </p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            {isDowngrade ? (
              <>
                {/* Downgrade Info */}
                <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
                  <Calendar className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900">
                    Keep using {resolvedOldPlan?.name || oldPlan?.name || 'Current Plan'} until
                  </p>
                    <p className="text-lg font-semibold text-orange-600">
                      {effectiveDate ? formatDate(effectiveDate) : 'End of billing period'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                  <CreditCard className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900">No charges today</p>
                    <p className="text-sm text-slate-600">
                      Your next bill will be {formatCurrency(newPlan?.priceInCents || 0)}/month for the{' '}
                      {resolvedNewPlan?.name || newPlan?.name} plan.
                    </p>
                  </div>
                </div>

                <div className="text-sm text-slate-600 bg-blue-50 p-4 rounded-lg">
                  <p className="font-medium text-slate-900 mb-1">What happens next?</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Continue using all {resolvedOldPlan?.name || oldPlan?.name || 'Current'} features until the change date</li>
                    <li>Your credits will reset to {resolvedNewPlan?.creditsPerCycle || newPlan?.creditsPerCycle || 0} on the change date</li>
                    <li>You can cancel this change anytime before it takes effect</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                {/* Upgrade Info */}
                <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                  <Sparkles className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900">Your new plan is active now!</p>
                    <p className="text-sm text-slate-600">
                      You now have access to {resolvedNewPlan?.creditsPerCycle || newPlan?.creditsPerCycle || 0} credits per month.
                    </p>
                  </div>
                </div>

                {prorationAmount && Number(prorationAmount) !== 0 && (
                  <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                    <CreditCard className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Prorated charge</p>
                      <p className="text-sm text-slate-600">
                        {Number(prorationAmount) > 0
                          ? `You were charged ${formatCurrency(Number(prorationAmount))} for the remainder of this billing period.`
                          : `You received a ${formatCurrency(Math.abs(Number(prorationAmount)))} credit for unused time.`}
                      </p>
                    </div>
                  </div>
                )}

                <div className="text-sm text-slate-600 bg-blue-50 p-4 rounded-lg">
                  <p className="font-medium text-slate-900 mb-1">What&apos;s included?</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>{resolvedNewPlan?.creditsPerCycle || newPlan?.creditsPerCycle || 0} credits per month</li>
                    <li>Credits refresh at the start of each billing cycle</li>
                    <li>Unused credits don&apos;t roll over</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="p-6 bg-slate-50 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/dashboard"
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-center font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Go to Dashboard
              </Link>
              <Link
                href="/pricing"
                className="flex-1 px-4 py-2.5 bg-white text-slate-700 text-center font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                View Plans
              </Link>
            </div>
          </div>
        </div>

        {/* Help Link */}
        <p className="text-center text-sm text-slate-500 mt-6">
          Questions?{' '}
          <Link href="/help" className="text-indigo-600 hover:text-indigo-700">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function SubscriptionConfirmedPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscriptionConfirmedContent />
    </Suspense>
  );
}
