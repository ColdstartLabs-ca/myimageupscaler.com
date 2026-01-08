/**
 * Scroll Depth Tracker for pSEO Pages
 * Tracks when users reach 25%, 50%, 75%, and 100% scroll depth
 */

'use client';

import { useEffect, useRef, ReactElement } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import type { IPSEOScrollProperties } from '@server/analytics/types';

interface IScrollTrackerProps {
  pageType: IPSEOScrollProperties['pageType'];
  slug: string;
}

export function ScrollTracker({ pageType, slug }: IScrollTrackerProps): ReactElement {
  const trackedDepths = useRef<Set<number>>(new Set());
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    // Reset tracked depths on slug change
    trackedDepths.current.clear();
    startTime.current = Date.now();

    function handleScroll(): void {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;

      // Calculate scroll percentage
      const scrollableHeight = documentHeight - windowHeight;
      const scrollPercentage = (scrollTop / scrollableHeight) * 100;

      // Track depth milestones
      const depths: Array<25 | 50 | 75 | 100> = [25, 50, 75, 100];

      for (const depth of depths) {
        if (scrollPercentage >= depth && !trackedDepths.current.has(depth)) {
          trackedDepths.current.add(depth);

          const timeToDepthMs = Date.now() - startTime.current;

          analytics.track('pseo_scroll_depth', {
            pageType,
            slug,
            depth,
            timeToDepthMs,
          });
        }
      }
    }

    // Throttle scroll events
    let ticking = false;
    function throttledHandleScroll(): void {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', throttledHandleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
    };
  }, [pageType, slug]);

  return <></>;
}
