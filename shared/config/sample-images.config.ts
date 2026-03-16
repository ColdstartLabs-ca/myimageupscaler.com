/**
 * Sample Images Configuration
 *
 * Pre-configured sample images for first-time users to try the upscaler
 * without having their own image ready.
 *
 * @see docs/PRDs/first-time-user-activation.md - Phase 2: Sample Images
 */

import { QualityTier } from '@shared/types/coreflow.types';

/**
 * Sample image types available for first-time users
 */
export type SampleImageType = 'photo' | 'illustration' | 'old_photo';

/**
 * Configuration for a sample image that users can try
 */
export interface ISampleImage {
  /** Unique identifier for the sample */
  id: string;
  /** Type of sample (determines optimal processing settings) */
  type: SampleImageType;
  /** Path to the before/original version (shown as thumbnail) */
  beforeSrc: string;
  /** Path to the after/upscaled version (pre-processed result) */
  afterSrc: string;
  /** Optimal quality tier for this sample type */
  qualityTier: QualityTier;
  /** Scale factor applied to this sample */
  scaleFactor: 2 | 4 | 8;
  /** Short title for the sample card */
  title: string;
  /** Brief description of what this sample demonstrates */
  description: string;
}

/**
 * All available sample images for first-time users.
 *
 * These are displayed in the SampleImageSelector component when:
 * - User has no upload history (first-time visitor)
 * - Queue is empty
 *
 * Clicking a sample automatically:
 * - Loads the pre-processed result
 * - Shows before/after comparison
 * - Tracks analytics event
 */
export const SAMPLE_IMAGES: ISampleImage[] = [
  {
    id: 'sample-photo',
    type: 'photo',
    beforeSrc: '/before-after/quick/before.webp',
    afterSrc: '/before-after/quick/after.webp',
    qualityTier: 'quick',
    scaleFactor: 4,
    title: 'Photo',
    description: 'Portrait and general photos',
  },
  {
    id: 'sample-illustration',
    type: 'illustration',
    beforeSrc: '/before-after/anime-upscale/before.webp',
    afterSrc: '/before-after/anime-upscale/after.webp',
    qualityTier: 'anime-upscale',
    scaleFactor: 4,
    title: 'Illustration',
    description: 'Digital art and vectors',
  },
  {
    id: 'sample-old-photo',
    type: 'old_photo',
    beforeSrc: '/before-after/face-restore/before.webp',
    afterSrc: '/before-after/face-restore/after.webp',
    qualityTier: 'face-restore',
    scaleFactor: 4,
    title: 'Old Photo',
    description: 'Restoration of vintage photos',
  },
];

/**
 * Get a sample image by its ID
 */
export function getSampleImageById(id: string): ISampleImage | undefined {
  return SAMPLE_IMAGES.find(sample => sample.id === id);
}

/**
 * Get all sample images of a specific type
 */
export function getSampleImagesByType(type: SampleImageType): ISampleImage[] {
  return SAMPLE_IMAGES.filter(sample => sample.type === type);
}

/**
 * LocalStorage key for tracking which samples have been used
 */
export const SAMPLE_IMAGES_USED_KEY = 'miu_sample_images_used';

/**
 * LocalStorage key for tracking onboarding completion
 */
export const ONBOARDING_COMPLETED_KEY = 'miu_onboarding_completed';
