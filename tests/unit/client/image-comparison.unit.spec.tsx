/**
 * Unit tests for ImageComparison component
 * Tests transparency detection and checkerboard background handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeftRight: () => null,
  Download: () => null,
  ZoomIn: () => null,
  ZoomOut: () => null,
}));

// Mock Button component
vi.mock('@client/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} data-testid="download-button">
      {children}
    </button>
  ),
}));

// Mock useRegionTier to prevent fetch('/api/geo') in tests
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    pricingRegion: 'standard',
    discountPercent: 0,
    isRestricted: false,
    isLoading: false,
  }),
}));

describe('ImageComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transparency handling', () => {
    it('should detect blob URLs as having transparency', async () => {
      const { ImageComparison } =
        await import('@/client/components/features/image-processing/ImageComparison');

      const { container } = render(
        <ImageComparison
          beforeUrl="https://example.com/before.jpg"
          afterUrl="blob:https://example.com/abc123"
          onDownload={() => {}}
        />
      );

      // The component should apply bg-checkerboard when showTransparency is true
      // Look for the bg-checkerboard class in the container
      const checkerboardElements = container.querySelectorAll('.bg-checkerboard');
      expect(checkerboardElements.length).toBeGreaterThan(0);
    });

    it('should not apply checkerboard for regular URLs when hasTransparency is false', async () => {
      const { ImageComparison } =
        await import('@/client/components/features/image-processing/ImageComparison');

      const { container } = render(
        <ImageComparison
          beforeUrl="https://example.com/before.jpg"
          afterUrl="https://example.com/after.jpg"
          onDownload={() => {}}
          hasTransparency={false}
        />
      );

      // The inner container should use bg-surface-light, not bg-checkerboard
      const imagesContainer = container.querySelector('[class*="bg-surface-light"]');
      expect(imagesContainer).toBeTruthy();
    });

    it('should apply checkerboard when hasTransparency is explicitly true', async () => {
      const { ImageComparison } =
        await import('@/client/components/features/image-processing/ImageComparison');

      const { container } = render(
        <ImageComparison
          beforeUrl="https://example.com/before.jpg"
          afterUrl="https://example.com/after.png"
          onDownload={() => {}}
          hasTransparency={true}
        />
      );

      // The component should apply bg-checkerboard when hasTransparency is true
      const checkerboardElements = container.querySelectorAll('.bg-checkerboard');
      expect(checkerboardElements.length).toBeGreaterThan(0);
    });

    it('should export ImageComparison component', async () => {
      const { ImageComparison } =
        await import('@/client/components/features/image-processing/ImageComparison');
      expect(ImageComparison).toBeDefined();
      expect(typeof ImageComparison).toBe('function');
    });
  });
});
