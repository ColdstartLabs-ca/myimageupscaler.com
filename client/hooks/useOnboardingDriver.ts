'use client';

/**
 * useOnboardingDriver
 *
 * Two-phase onboarding tour using Driver.js.
 *
 * Phase 1 (empty state / page load):
 *   - Single step pointing at the upload dropzone
 *   - Auto-starts on first visit
 *
 * Phase 2 (active state / after first result):
 *   - Two steps: quality tier + download button
 *   - Triggered after first download/celebration
 *
 * State is persisted in localStorage so each phase never shows twice.
 */

import { useCallback, useEffect, useRef } from 'react';

export const TOUR_PHASE1_KEY = 'miu_onboarding_tour_phase1_done';
export const TOUR_PHASE3_KEY = 'miu_onboarding_tour_phase3_done';
export const TOUR_COMPLETED_KEY = 'miu_onboarding_tour_completed';
export const TOUR_SKIPPED_KEY = 'miu_onboarding_tour_skipped';

function hasSeenPhase1(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(TOUR_PHASE1_KEY) === 'true';
  } catch {
    return true;
  }
}

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

function markSeen(key: string): void {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // ignore
  }
}

const DRIVER_BASE_CONFIG = {
  animate: true,
  overlayOpacity: 0.6,
  stagePadding: 6,
  stageRadius: 8,
  allowClose: true,
};

export function useOnboardingDriver(): {
  startTourPhase1: () => Promise<void>;
  startTour: () => Promise<void>;
  startTourPhase3: () => Promise<void>;
  hasSeenTour: () => boolean;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverRef = useRef<any>(null);
  const phase1StartedRef = useRef(false);
  const phase2StartedRef = useRef(false);
  const phase3StartedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  /** Phase 1: single dropzone tip, auto-starts on empty state mount */
  const startTourPhase1 = useCallback(async () => {
    if (phase1StartedRef.current || hasSeenPhase1()) return;
    phase1StartedRef.current = true;

    const { driver } = await import('driver.js');

    driverRef.current = driver({
      ...DRIVER_BASE_CONFIG,
      showProgress: false,
      onDestroyStarted: () => {
        markSeen(TOUR_PHASE1_KEY);
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
      ],
      onDestroyed: () => {
        markSeen(TOUR_PHASE1_KEY);
      },
    });

    setTimeout(() => {
      driverRef.current?.drive();
    }, 600);
  }, []);

  /** Phase 2: quality tier + download, triggered after first result */
  const startTour = useCallback(async () => {
    if (phase2StartedRef.current || hasSeenTour()) return;
    phase2StartedRef.current = true;

    // Destroy any lingering phase 1 tour
    driverRef.current?.destroy();

    const { driver } = await import('driver.js');

    driverRef.current = driver({
      ...DRIVER_BASE_CONFIG,
      showProgress: true,
      onDestroyStarted: () => {
        markSeen(TOUR_SKIPPED_KEY);
        driverRef.current?.destroy();
      },
      steps: [
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
          element: '[data-driver="process-button"]',
          popover: {
            title: 'Process Your Image',
            description: 'Happy with the settings? Hit this to start upscaling.',
            side: 'top',
            align: 'center',
          },
        },
      ],
      onDestroyed: () => {
        markSeen(TOUR_COMPLETED_KEY);
      },
    });

    setTimeout(() => {
      driverRef.current?.drive();
    }, 400);
  }, []);

  /** Phase 3: download button tip, triggered after first processing result */
  const startTourPhase3 = useCallback(async () => {
    if (phase3StartedRef.current || localStorage.getItem(TOUR_PHASE3_KEY) === 'true') return;
    phase3StartedRef.current = true;

    driverRef.current?.destroy();

    const { driver } = await import('driver.js');

    driverRef.current = driver({
      ...DRIVER_BASE_CONFIG,
      showProgress: false,
      onDestroyStarted: () => {
        markSeen(TOUR_PHASE3_KEY);
        driverRef.current?.destroy();
      },
      steps: [
        {
          element: '[data-driver="download-button"]',
          popover: {
            title: 'Download Your Result',
            description: 'Your image is ready! Click here to save it.',
            side: 'bottom',
            align: 'end',
          },
        },
      ],
      onDestroyed: () => {
        markSeen(TOUR_PHASE3_KEY);
        markSeen(TOUR_COMPLETED_KEY);
      },
    });

    setTimeout(() => {
      driverRef.current?.drive();
    }, 400);
  }, []);

  return { startTourPhase1, startTour, startTourPhase3, hasSeenTour };
}
