'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense, type ReactElement } from 'react';
import { clientEnv, isDevelopment } from '@shared/config/env';

// Extend window for gtag
declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/**
 * Send a page view to Google Analytics.
 */
export function gaSendPageView(url: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('config', clientEnv.GA_MEASUREMENT_ID, {
    page_path: url,
  });
}

/**
 * Send an event to Google Analytics.
 */
export function gaSendEvent(
  action: string,
  category: string,
  label?: string,
  value?: number
): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
}

/**
 * Inner component to track page views.
 */
function GAPageViewTracker(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    gaSendPageView(url);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Google Analytics 4 Integration
 *
 * Loads the gtag.js script and tracks page views on route changes.
 * Only active when GA_MEASUREMENT_ID is set and not in development.
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * <body>
 *   <GoogleAnalytics />
 *   {children}
 * </body>
 * ```
 */
export function GoogleAnalytics(): ReactElement | null {
  const measurementId = clientEnv.GA_MEASUREMENT_ID;

  // Skip GA in development or if no measurement ID
  if (!measurementId || isDevelopment()) {
    return null;
  }

  return (
    <>
      {/* Load gtag.js with lazyOnload to defer blocking */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="lazyOnload"
      />
      {/* Initialize gtag */}
      <Script
        id="google-analytics-init"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}', {
              page_path: window.location.pathname,
              send_page_view: false
            });
          `,
        }}
      />
      {/* Track page views on route change */}
      <Suspense fallback={null}>
        <GAPageViewTracker />
      </Suspense>
    </>
  );
}
