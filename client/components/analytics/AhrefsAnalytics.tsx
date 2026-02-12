'use client';

import Script from 'next/script';
import { clientEnv, isDevelopment } from '@shared/config/env';

/**
 * Ahrefs Analytics Integration
 *
 * Loads the Ahrefs analytics.js script for website traffic tracking.
 * Only active when AHREFS_ANALYTICS_KEY is set and not in development.
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * <body>
 *   <AhrefsAnalytics />
 *   {children}
 * </body>
 * ```
 */
export function AhrefsAnalytics(): JSX.Element | null {
  const analyticsKey = clientEnv.AHREFS_ANALYTICS_KEY;

  // Skip Ahrefs in development or if no key
  if (!analyticsKey || isDevelopment()) {
    return null;
  }

  return (
    <Script
      src="https://analytics.ahrefs.com/analytics.js"
      data-key={analyticsKey}
      strategy="lazyOnload"
    />
  );
}
