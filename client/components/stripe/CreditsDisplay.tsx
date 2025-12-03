'use client';

import { useEffect, useState } from 'react';
import { StripeService } from '@client/services/stripeService';
import type { IUserProfile } from '@shared/types/stripe';

/**
 * Component to display user's current credits balance
 *
 * Usage:
 * ```tsx
 * <CreditsDisplay />
 * ```
 */
export function CreditsDisplay(): JSX.Element {
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[CreditsDisplay] useEffect - calling loadProfile');
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      console.log('[CreditsDisplay] Calling StripeService.getUserProfile');
      const data = await StripeService.getUserProfile();
      setProfile(data);
      setError(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load profile';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
        <svg
          className="animate-spin h-3 w-3 text-indigo-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="text-xs font-medium text-slate-700">Loading...</span>
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

  return (
    <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-indigo-600"
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
      <span className="text-sm font-semibold text-slate-900">{profile?.credits_balance || 0}</span>
      <span className="text-xs font-medium text-slate-600">credits</span>
      <button
        onClick={loadProfile}
        className="ml-1 text-slate-500 hover:text-indigo-600 transition-colors"
        title="Refresh credits"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5"
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
}
