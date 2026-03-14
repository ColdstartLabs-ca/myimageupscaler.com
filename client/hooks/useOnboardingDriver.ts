'use client';

/**
 * useOnboardingDriver
 *
 * Manages the first-time user onboarding tour using Driver.js.
 * Auto-starts once when the user has a completed result for the first time.
 * State is persisted in localStorage so the tour never shows twice.
 */

import { useCallback, useEffect, useRef } from 'react';

export const TOUR_COMPLETED_KEY = 'miu_onboarding_tour_completed';
export const TOUR_SKIPPED_KEY = 'miu_onboarding_tour_skipped';

function hasSeenTour(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return (
      localStorage.getItem(TOUR_COMPLETED_KEY) === 'true' ||
      localStorage.getItem(TOUR_SKIPPED_KEY) === 'true'
    );
  } catch {
    return true;
  }
}

function markTourSeen(key: typeof TOUR_COMPLETED_KEY | typeof TOUR_SKIPPED_KEY): void {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // ignore
  }
}

export function useOnboardingDriver(): {
  startTour: () => Promise<void>;
  hasSeenTour: () => boolean;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverRef = useRef<any>(null);
  const startedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  const startTour = useCallback(async () => {
    if (startedRef.current || hasSeenTour()) return;
    startedRef.current = true;

    // Lazy-load driver.js (avoids SSR issues and keeps bundle lean)
    const { driver } = await import('driver.js');

    driverRef.current = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 8,
      allowClose: true,
      onDestroyStarted: () => {
        markTourSeen(TOUR_SKIPPED_KEY);
        driverRef.current?.destroy();
      },
      steps: [
        {
          element: '[data-driver="upload-zone"]',
          popover: {
            title: 'Upload Your Image',
            description: 'Drag & drop any JPG, PNG or WEBP here — or click to browse.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-driver="quality-selector"]',
          popover: {
            title: 'Choose Quality Tier',
            description:
              'Pick the AI model that fits your image. <em>Quick</em> is free and fast — premium tiers unlock sharper detail.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '[data-driver="download-button"]',
          popover: {
            title: 'Download Your Result',
            description: 'Once processing is done, click here to save your upscaled image.',
            side: 'bottom',
            align: 'end',
          },
        },
      ],
      onDestroyed: () => {
        markTourSeen(TOUR_COMPLETED_KEY);
      },
    });

    // Small delay so the DOM is settled before driver.js measures elements
    setTimeout(() => {
      driverRef.current?.drive();
    }, 400);
  }, []);

  return { startTour, hasSeenTour };
}
