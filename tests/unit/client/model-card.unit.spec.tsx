/**
 * Unit tests for ModelCard image handling behavior.
 * Tests before/after image rendering, error fallback to placeholder,
 * and null previewImages rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon">Check</span>,
  Lock: () => <span data-testid="lock-icon">Lock</span>,
  Image: () => <span data-testid="image-icon">Image</span>,
}));

vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

import { ModelCard } from '@/client/components/features/workspace/ModelCard';
import { QUALITY_TIER_CONFIG, QualityTier } from '@/shared/types/coreflow.types';

describe('ModelCard image handling', () => {
  const mockOnSelect = vi.fn();
  const mockOnLockedClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render placeholder when previewImages is null', () => {
    const nullPreviewConfig = { ...QUALITY_TIER_CONFIG['quick'], previewImages: null };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={nullPreviewConfig}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    // When previewImages is null, the placeholder should render with the Image icon
    expect(screen.getByTestId('image-icon')).toBeInTheDocument();
    // No <img> tags should be present
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('should render before/after images when previewImages is set', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', '/before-after/quick/before.webp');
    expect(images[1]).toHaveAttribute('src', '/before-after/quick/after.webp');
  });

  it('should fall back to placeholder when before image fails to load', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    // Before error, images should be present
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);

    // Trigger error on the before image
    fireEvent.error(images[0]);

    // After error, placeholder should appear (with image-icon) and images should be gone
    expect(screen.getByTestId('image-icon')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('should fall back to placeholder when after image fails to load', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);

    // Trigger error on the after image
    fireEvent.error(images[1]);

    // After error, placeholder should appear
    expect(screen.getByTestId('image-icon')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('should show tier label in placeholder when images fail', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    const images = screen.getAllByRole('img');
    fireEvent.error(images[0]);

    // After error, the PlaceholderGradient renders a <span> with class
    // "text-[10px] font-medium text-text-muted" containing the tier name.
    // "Quick" also appears in the card content section, so use querySelectorAll.
    const placeholderLabels = document.querySelectorAll('span.font-medium.text-text-muted');
    const hasPlaceholderLabel = Array.from(placeholderLabels).some(
      el => el.textContent === QUALITY_TIER_CONFIG['quick'].label
    );
    expect(hasPlaceholderLabel).toBe(true);
  });

  it('should set lazy loading on images', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'lazy');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
  });

  it('should have correct alt text on before/after images', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByAltText('Before')).toBeInTheDocument();
    expect(screen.getByAltText('After')).toBeInTheDocument();
  });

  it('should allow card selection when clicking slider area without dragging', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );

    // A simple click (no drag) on the card button should still trigger selection
    const card = screen.getByRole('button');
    fireEvent.click(card);
    expect(mockOnSelect).toHaveBeenCalledWith('quick');
  });

  it('should render slider with pro badge for locked cards', () => {
    const configWithImages = {
      ...QUALITY_TIER_CONFIG['quick'],
      previewImages: {
        before: '/before-after/quick/before.webp',
        after: '/before-after/quick/after.webp',
      },
    };
    render(
      <ModelCard
        tier={'quick' as QualityTier}
        config={configWithImages}
        isSelected={false}
        isLocked={true}
        onSelect={mockOnSelect}
        onLockedClick={mockOnLockedClick}
      />
    );

    // Locked cards should still have the slider handle
    const sliderHandle = document.querySelector('.cursor-ew-resize');
    expect(sliderHandle).not.toBeNull();
    // And still render images
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    // Should show lock icon
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('should render images for all tiers that have previewImages configured', () => {
    const tiers = Object.keys(QUALITY_TIER_CONFIG) as QualityTier[];

    for (const tier of tiers) {
      const config = QUALITY_TIER_CONFIG[tier];
      if (config.previewImages !== null) {
        const { unmount } = render(
          <ModelCard
            tier={tier}
            config={config}
            isSelected={false}
            isLocked={false}
            onSelect={mockOnSelect}
          />
        );

        const images = screen.getAllByRole('img');
        if (config.previewImages!.displayMode === 'static') {
          // Static mode renders a single image
          expect(images).toHaveLength(1);
          expect(images[0]).toHaveAttribute('src', config.previewImages!.before);
        } else if (config.previewImages!.displayMode === 'flip') {
          // Flip mode renders after first, then before
          expect(images).toHaveLength(2);
          expect(images[0]).toHaveAttribute('src', config.previewImages!.after);
          expect(images[1]).toHaveAttribute('src', config.previewImages!.before);
        } else {
          // Slider mode renders before first, then after
          expect(images).toHaveLength(2);
          expect(images[0]).toHaveAttribute('src', config.previewImages!.before);
          expect(images[1]).toHaveAttribute('src', config.previewImages!.after);
        }

        unmount();
      }
    }
  });
});
