'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, Suspense } from 'react';
import { analytics } from '@client/analytics';
import { clientEnv, isDevelopment } from '@shared/config/env';

interface IAnalyticsProviderProps {
  children: ReactNode;
}

/**
 * Inner component that tracks page views.
 * Separated to use useSearchParams which requires Suspense boundary.
 */
function PageViewTracker(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Track page view on route change
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    analytics.trackPageView(url);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Analytics Provider
 *
 * Initializes Amplitude analytics and tracks page views on route changes.
 * Respects user consent preferences and development mode.
 *
 * @example
 * ```tsx
 * // In ClientProviders.tsx
 * <AnalyticsProvider>
 *   <BaselimeProvider>
 *     {children}
 *   </BaselimeProvider>
 * </AnalyticsProvider>
 * ```
 */
export function AnalyticsProvider({ children }: IAnalyticsProviderProps): ReactNode {
  const apiKey = clientEnv.AMPLITUDE_API_KEY;

  useEffect(() => {
    // Skip analytics in development or if no API key
    if (!apiKey || isDevelopment()) {
      return;
    }

    // Initialize Amplitude (respects stored consent internally)
    analytics.init(apiKey);

    // Set consent to granted by default (can be changed via consent UI)
    // In production, you'd want to check for a cookie consent banner first
    const storedConsent = analytics.getConsent();
    if (storedConsent === 'pending') {
      // Auto-grant for now - replace with consent banner logic
      analytics.setConsent('granted', apiKey);
    }
  }, [apiKey]);

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  );
}
