/**
 * pSEO Page View Tracker
 * Tracks page views for pSEO pages with metadata
 */

'use client';

import { useEffect, ReactElement } from 'react';
import { usePathname } from 'next/navigation';
import { analytics } from '@client/analytics/analyticsClient';
import type { IPSEOPageViewProperties } from '@server/analytics/types';

interface IPSEOPageTrackerProps {
  pageType: IPSEOPageViewProperties['pageType'];
  slug: string;
  primaryKeyword?: string;
  tier?: number;
}

export function PSEOPageTracker({
  pageType,
  slug,
  primaryKeyword,
  tier,
}: IPSEOPageTrackerProps): ReactElement {
  const pathname = usePathname();

  useEffect(() => {
    // Track pSEO-specific page view
    analytics.track('pseo_page_view', {
      pageType,
      slug,
      primaryKeyword,
      tier,
      path: pathname,
    });

    // Also track standard page view for overall analytics
    analytics.trackPageView(pathname, {
      pageType,
      slug,
    });
  }, [pathname, pageType, slug, primaryKeyword, tier]);

  return <></>;
}
