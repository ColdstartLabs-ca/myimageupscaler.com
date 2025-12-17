'use client';

import { useState, useEffect, useRef } from 'react';
import { useCredits, useUserStore } from '@client/store/userStore';
import { SmartTooltip } from '@client/components/ui/SmartTooltip';

// Low credit threshold - show warning when credits fall below this amount
const LOW_CREDIT_THRESHOLD = 5;

/**
 * Component to display user's current credits balance with low credit warning
 *
 * Usage:
 * ```tsx
 * <CreditsDisplay />
 * ```
 */
export function CreditsDisplay(): JSX.Element {
  const { total: creditBalance } = useCredits();
  const { isLoading, error, invalidate, user, isAuthenticated, lastFetched } = useUserStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const prevLastFetched = useRef(lastFetched);

  // Detect when fetch completes after refresh
  useEffect(() => {
    if (isRefreshing && lastFetched !== prevLastFetched.current) {
      setIsRefreshing(false);
    }
    prevLastFetched.current = lastFetched;
  }, [lastFetched, isRefreshing]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    invalidate();
    // Fallback timeout in case fetch fails silently
    setTimeout(() => setIsRefreshing(false), 5000);
  };

  // Show loading if: explicitly loading, or authenticated but profile not yet fetched
  const isProfileLoading = isLoading || (isAuthenticated && !user?.profile);

  const isLowCredits = creditBalance > 0 && creditBalance <= LOW_CREDIT_THRESHOLD;
  const isNoCredits = creditBalance === 0 && !isProfileLoading;

  // Should show tooltip?
  const showTooltip = isLowCredits || isNoCredits;

  if (isProfileLoading) {
    return (
      <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="h-4 w-4 bg-slate-200 rounded-full animate-pulse"></div>
          <div className="h-4 w-10 bg-slate-200 rounded animate-pulse"></div>
          <div className="h-3 w-12 bg-slate-200 rounded animate-pulse"></div>
        </div>
        <div className="h-3.5 w-3.5 bg-slate-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-full">
        <span className="text-xs font-medium text-red-600">Error loading credits</span>
      </div>
    );
  }

  // Determine background color and icon based on credit level
  const bgColor = isNoCredits ? 'bg-red-100' : isLowCredits ? 'bg-amber-100' : 'bg-slate-100';
  const iconColor = isNoCredits
    ? 'text-red-600'
    : isLowCredits
      ? 'text-amber-600'
      : 'text-indigo-600';
  const textColor = isNoCredits
    ? 'text-red-900'
    : isLowCredits
      ? 'text-amber-900'
      : 'text-slate-900';
  const subtitleColor = isNoCredits
    ? 'text-red-700'
    : isLowCredits
      ? 'text-amber-700'
      : 'text-slate-600';

  // Tooltip content
  const tooltipContent = (
    <div className="space-y-2">
      {(isLowCredits || isNoCredits) && (
        <>
          <div>
            {isNoCredits ? 'No credits remaining' : `Low credits: ${creditBalance} remaining`}
          </div>
          <a
            href="/dashboard/billing"
            className="block text-indigo-400 hover:text-indigo-300 underline text-center"
            onClick={e => e.stopPropagation()}
          >
            Buy more credits →
          </a>
        </>
      )}
    </div>
  );

  const creditsElement = (
    <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full relative">
      {/* Warning indicator for low/no credits */}
      {(isLowCredits || isNoCredits) && (
        <div className="absolute -top-1 -right-1 z-10">
          <div className="relative">
            <svg className="h-2 w-2 animate-pulse" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="4" fill={isNoCredits ? '#DC2626' : '#F59E0B'} />
            </svg>
          </div>
        </div>
      )}

      <a
        href="/dashboard/billing"
        className={`flex items-center gap-2 ${bgColor} px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity cursor-pointer`}
      >
        {/* Credits icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 ${iconColor}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Credits amount */}
        <span className={`text-sm font-semibold ${textColor}`}>{creditBalance}</span>
        <span className={`text-xs font-medium ${subtitleColor}`}>credits</span>
      </a>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
        title="Refresh credits"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>
  );

  return (
    <SmartTooltip content={tooltipContent} enabled={showTooltip}>
      {creditsElement}
    </SmartTooltip>
  );
}
