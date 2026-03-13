/**
 * useSampleImages Hook
 *
 * Manages sample image selection and processing for first-time users.
 * Tracks usage in localStorage and fires analytics events.
 *
 * @see docs/PRDs/first-time-user-activation.md - Phase 2: Sample Images
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { analytics } from '@client/analytics';
import {
  getSampleImageById,
  ISampleImage,
  ONBOARDING_COMPLETED_KEY,
  SAMPLE_IMAGES,
  SAMPLE_IMAGES_USED_KEY,
  SampleImageType,
} from '@shared/config/sample-images.config';

/**
 * Return type for useSampleImages hook
 */
export interface IUseSampleImagesReturn {
  /** All available sample images */
  samples: ISampleImage[];
  /** IDs of samples that have been used by this user */
  usedSampleIds: string[];
  /** Whether the user has completed onboarding (used any sample) */
  hasCompletedOnboarding: boolean;
  /** Currently selected sample (if any) */
  selectedSample: ISampleImage | null;
  /** Handler for when a sample is selected */
  selectSample: (sampleId: string) => void;
  /** Handler for when a sample is processed (result shown) */
  markSampleProcessed: (sampleId: string, durationMs: number) => void;
  /** Reset all sample usage (for testing) */
  resetSampleUsage: () => void;
}

/**
 * Get the list of used sample IDs from localStorage
 */
function getUsedSampleIds(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(SAMPLE_IMAGES_USED_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Check if onboarding has been completed
 */
function checkOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Hook for managing sample images for first-time user activation.
 *
 * @example
 * ```tsx
 * const { samples, selectSample, selectedSample } = useSampleImages();
 *
 * return (
 *   <div>
 *     {samples.map(sample => (
 *       <button key={sample.id} onClick={() => selectSample(sample.id)}>
 *         {sample.title}
 *       </button>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useSampleImages(): IUseSampleImagesReturn {
  const [usedSampleIds, setUsedSampleIds] = useState<string[]>([]);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [selectedSample, setSelectedSample] = useState<ISampleImage | null>(null);

  // Load state from localStorage on mount
  useEffect(() => {
    setUsedSampleIds(getUsedSampleIds());
    setHasCompletedOnboarding(checkOnboardingCompleted());
  }, []);

  /**
   * Select a sample image to process
   */
  const selectSample = useCallback((sampleId: string) => {
    const sample = getSampleImageById(sampleId);
    if (!sample) {
      console.warn(`[useSampleImages] Sample not found: ${sampleId}`);
      return;
    }

    // Track analytics event
    analytics.track('sample_image_selected', {
      sampleType: sample.type,
      sampleId: sample.id,
      qualityTier: sample.qualityTier,
    });

    // Mark as used in localStorage
    try {
      const currentUsed = getUsedSampleIds();
      if (!currentUsed.includes(sampleId)) {
        const updated = [...currentUsed, sampleId];
        localStorage.setItem(SAMPLE_IMAGES_USED_KEY, JSON.stringify(updated));
        setUsedSampleIds(updated);
      }

      // Mark onboarding as completed on first sample selection
      if (!checkOnboardingCompleted()) {
        localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        setHasCompletedOnboarding(true);
      }
    } catch {
      // Ignore localStorage errors
    }

    setSelectedSample(sample);
  }, []);

  /**
   * Mark a sample as processed (when result is shown to user)
   */
  const markSampleProcessed = useCallback((sampleId: string, durationMs: number) => {
    const sample = getSampleImageById(sampleId);
    if (!sample) return;

    analytics.track('sample_image_processed', {
      sampleType: sample.type,
      sampleId: sample.id,
      durationMs,
      qualityTier: sample.qualityTier,
    });
  }, []);

  /**
   * Reset all sample usage (for testing)
   */
  const resetSampleUsage = useCallback(() => {
    try {
      localStorage.removeItem(SAMPLE_IMAGES_USED_KEY);
      localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
      setUsedSampleIds([]);
      setHasCompletedOnboarding(false);
      setSelectedSample(null);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return {
    samples: SAMPLE_IMAGES,
    usedSampleIds,
    hasCompletedOnboarding,
    selectedSample,
    selectSample,
    markSampleProcessed,
    resetSampleUsage,
  };
}

/**
 * Type guard to check if a string is a valid SampleImageType
 */
export function isSampleImageType(value: string): value is SampleImageType {
  return ['photo', 'illustration', 'old_photo'].includes(value);
}
