/**
 * SampleImageSelector Component
 *
 * Shows 3 pre-configured sample images that users can click to instantly
 * experience upscaling without having their own image ready.
 *
 * Only shows to first-time users (no upload history / queue is empty).
 *
 * @see docs/PRDs/first-time-user-activation.md - Phase 2: Sample Images
 */

'use client';

import { useTranslations } from 'next-intl';
import React, { useEffect, useRef } from 'react';
import { analytics } from '@client/analytics';
import { useSampleImages } from '@client/hooks/useSampleImages';
import { cn } from '@client/utils/cn';
import { ISampleImage } from '@shared/config/sample-images.config';
import { Image, Sparkles, Clock, Palette } from 'lucide-react';

/**
 * Props for the SampleImageSelector component
 */
export interface ISampleImageSelectorProps {
  /** Callback when a sample is selected */
  onSampleSelect: (sample: ISampleImage) => void;
  /** Whether to show the component (usually: queue is empty and user is first-time) */
  isVisible: boolean;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Get icon component for sample type
 */
function getSampleIcon(type: ISampleImage['type']) {
  switch (type) {
    case 'photo':
      return Image;
    case 'illustration':
      return Palette;
    case 'old_photo':
      return Clock;
    default:
      return Image;
  }
}

/**
 * Individual sample card component
 */
interface ISampleCardProps {
  sample: ISampleImage;
  onSelect: () => void;
  title: string;
  description: string;
  tryLabel: string;
}

function SampleCard({ sample, onSelect, title, description, tryLabel }: ISampleCardProps) {
  const Icon = getSampleIcon(sample.type);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col items-center p-4 rounded-xl',
        'bg-surface border border-border hover:border-accent/50',
        'transition-all duration-200 ease-out',
        'hover:shadow-lg hover:shadow-accent/10',
        'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-main'
      )}
      aria-label={`${tryLabel}: ${title} - ${description}`}
    >
      {/* Thumbnail with before/after preview */}
      <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 bg-black/20">
        {/* Show before image with hover transition to after */}
        <img
          src={sample.beforeSrc}
          alt=""
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            'transition-opacity duration-300',
            'group-hover:opacity-0'
          )}
          loading="lazy"
        />
        <img
          src={sample.afterSrc}
          alt=""
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            'transition-opacity duration-300 opacity-0',
            'group-hover:opacity-100'
          )}
          loading="lazy"
        />

        {/* Quality tier badge */}
        <div
          className={cn(
            'absolute top-2 right-2 px-2 py-0.5 rounded-full',
            'bg-black/60 backdrop-blur-sm text-white text-xs font-medium',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
          )}
        >
          {sample.scaleFactor}x
        </div>

        {/* Icon overlay */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'bg-black/40 opacity-0 group-hover:opacity-100',
            'transition-opacity duration-200'
          )}
        >
          <Icon className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>

      {/* Description */}
      <p className="text-xs text-text-muted text-center mb-3">{description}</p>

      {/* Try button */}
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
          'bg-accent/20 text-accent text-xs font-medium',
          'group-hover:bg-accent group-hover:text-white',
          'transition-colors duration-200'
        )}
      >
        <Sparkles className="w-3 h-3" />
        {tryLabel}
      </span>
    </button>
  );
}

/**
 * SampleImageSelector - Shows sample images for first-time users to try
 *
 * @example
 * ```tsx
 * <SampleImageSelector
 *   isVisible={queue.length === 0}
 *   onSampleSelect={(sample) => {
 *     // Handle sample selection
 *     loadSampleImage(sample);
 *   }}
 * />
 * ```
 */
export function SampleImageSelector({
  onSampleSelect,
  isVisible,
  className,
}: ISampleImageSelectorProps): JSX.Element | null {
  const t = useTranslations('workspace.sampleImages');
  const { samples, selectSample } = useSampleImages();
  const hasTrackedView = useRef(false);

  // Track view event once when component becomes visible
  useEffect(() => {
    if (isVisible && !hasTrackedView.current) {
      hasTrackedView.current = true;
      analytics.track('sample_image_selector_viewed', {
        availableSamples: samples.length,
      });
    }
  }, [isVisible, samples.length]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  const handleSampleSelect = (sample: ISampleImage) => {
    selectSample(sample.id);
    onSampleSelect(sample);
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">{t('title')}</h2>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </div>

      {/* Sample cards grid */}
      <div className="grid grid-cols-3 gap-4">
        {samples.map(sample => (
          <SampleCard
            key={sample.id}
            sample={sample}
            onSelect={() => handleSampleSelect(sample)}
            title={t(`types.${sample.type}.title`)}
            description={t(`types.${sample.type}.description`)}
            tryLabel={t('tryThis')}
          />
        ))}
      </div>
    </div>
  );
}

// Re-export types for convenience
export type { ISampleImage } from '@shared/config/sample-images.config';
