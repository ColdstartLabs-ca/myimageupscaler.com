/**
 * Unit tests for OversizedImageModal component
 * Tests dimension warnings, size warnings, and resize behavior
 *
 * Note: Auto-resize localStorage preference tests are intentionally skipped here
 * because they require complex module mocking that conflicts with the component's
 * internal helper function imports. The localStorage functionality is tested
 * via E2E tests instead.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'oversizedImage.yourImageIs': 'Your image is',
      'oversizedImage.whichExceeds': 'which exceeds the',
      'oversizedImage.limitBy': 'limit by',
      'oversizedImage.imageTooLarge': 'Image Too Large',
      'oversizedImage.processingFailed':
        'Processing failed. Please try a smaller file or upgrade to Pro.',
      'oversizedImage.compressing': 'Compressing',
      'oversizedImage.optimizingQuality': 'Optimizing quality while reducing file size...',
      'oversizedImage.resizeAndContinue': 'Resize & Continue',
      'oversizedImage.automaticallyCompress': 'Automatically compress to fit under',
      'oversizedImage.processingImage': 'Processing image...',
      'oversizedImage.upgradeToPro': 'Upgrade to Pro',
      'oversizedImage.upgradeToProDescription': 'Upload images up to 64MB with full resolution',
      'oversizedImage.skipThisImage': 'Skip This Image',
      'oversizedImage.useDifferentImage': 'Use a Different Image',
      'oversizedImage.whatHappens': 'What happens when you resize?',
      'oversizedImage.imageCompressed': 'Image is compressed to fit under the size limit',
      'oversizedImage.qualityOptimized': 'Quality is automatically optimized for best results',
      'oversizedImage.processingInstantly': 'Processing happens instantly in your browser',
      'oversizedImage.aspectRatioMaintained': 'Original aspect ratio is maintained',
      'oversizedImage.autoResizeToggle': 'Always auto-resize images for me',
      'oversizedImage.autoResizeToast': 'Image automatically resized to fit processing limits',
      'oversizedImage.autoResizeToPixelLimit':
        'Automatically resize to fit within {maxPixels}MP pixel limit.',
    };
    return translations[key] || key;
  },
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt, 'data-testid': 'next-image' }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock the Modal component
vi.mock('@client/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
  }) => {
    if (!isOpen) return null;
    return React.createElement(
      'div',
      { role: 'dialog', 'aria-label': title },
      React.createElement('h2', null, title),
      children
    );
  },
}));

// Mock image-compression module
vi.mock('@client/utils/image-compression', () => ({
  compressImage: vi.fn().mockResolvedValue({
    blob: new Blob(['compressed'], { type: 'image/jpeg' }),
    originalSize: 10000,
    compressedSize: 5000,
    reductionPercent: 50,
    dimensions: { width: 1000, height: 1000 },
  }),
  formatBytes: (bytes: number) => {
    if (bytes < 1024) return `${bytes} Bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },
}));

// Import after mocks are set up
import {
  AUTO_RESIZE_STORAGE_KEY,
  OversizedImageModal,
} from '@client/components/features/image-processing/OversizedImageModal';

describe('OversizedImageModal', () => {
  const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
  const mockOnClose = vi.fn();
  const mockOnResizeAndContinue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Warning Messages', () => {
    it('should show dimension warning when reason is dimensions', () => {
      const dimensions = { width: 4000, height: 3000, pixels: 12000000 }; // 12MP

      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024}
          dimensions={dimensions}
        />
      );

      // Should show pixel-based warning with dimensions
      expect(screen.getByText(/4000x3000/)).toBeTruthy();
      expect(screen.getByText(/12\.0MP/)).toBeTruthy();
      expect(screen.getByText(/exceeds the/)).toBeTruthy();
    });

    it('should show size warning when reason is size', () => {
      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024} // 5MB
        />
      );

      // Should show file size-based warning
      expect(screen.getByText(/Your image is/)).toBeTruthy();
      expect(screen.getByText(/which exceeds the/)).toBeTruthy();
    });
  });

  describe('Auto-Resize Toggle UI', () => {
    it('should render the auto-resize toggle checkbox', () => {
      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024}
        />
      );

      expect(screen.getByText('Always auto-resize images for me')).toBeTruthy();
      expect(screen.getByRole('checkbox')).toBeTruthy();
    });

    it('should toggle checkbox when clicked', async () => {
      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024}
        />
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      // Click to check
      fireEvent.click(checkbox);
      await waitFor(() => {
        expect(checkbox.checked).toBe(true);
      });

      // Click to uncheck
      fireEvent.click(checkbox);
      await waitFor(() => {
        expect(checkbox.checked).toBe(false);
      });
    });
  });

  describe('Resize Button Behavior', () => {
    it('should call onResizeAndContinue with resized file when clicking resize', async () => {
      const { compressImage } = await import('@client/utils/image-compression');

      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024}
        />
      );

      const resizeButton = screen.getByText('Resize & Continue').closest('button');
      if (resizeButton) {
        fireEvent.click(resizeButton);
      }

      await waitFor(() => {
        expect(compressImage).toHaveBeenCalled();
        expect(mockOnResizeAndContinue).toHaveBeenCalled();
      });
    });

    it('should call compressImage with maxPixels when resizing for dimensions', async () => {
      const { compressImage } = await import('@client/utils/image-compression');
      const mockCompress = compressImage as ReturnType<typeof vi.fn>;
      mockCompress.mockClear();

      const dimensions = { width: 4000, height: 3000, pixels: 12000000 };

      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024}
          dimensions={dimensions}
        />
      );

      const resizeButton = screen.getByText('Resize & Continue').closest('button');
      if (resizeButton) {
        fireEvent.click(resizeButton);
      }

      await waitFor(() => {
        expect(mockCompress).toHaveBeenCalledWith(
          expect.any(File),
          expect.objectContaining({
            maxPixels: expect.any(Number),
            format: 'jpeg',
            maintainAspectRatio: true,
          })
        );
      });
    });

    it('should call compressImage with targetSizeBytes when resizing for file size', async () => {
      const { compressImage } = await import('@client/utils/image-compression');
      const mockCompress = compressImage as ReturnType<typeof vi.fn>;
      mockCompress.mockClear();

      render(
        <OversizedImageModal
          file={mockFile}
          isOpen={true}
          onClose={mockOnClose}
          onResizeAndContinue={mockOnResizeAndContinue}
          currentLimit={5 * 1024 * 1024}
        />
      );

      const resizeButton = screen.getByText('Resize & Continue').closest('button');
      if (resizeButton) {
        fireEvent.click(resizeButton);
      }

      await waitFor(() => {
        expect(mockCompress).toHaveBeenCalledWith(
          expect.any(File),
          expect.objectContaining({
            targetSizeBytes: expect.any(Number),
            format: 'jpeg',
            maintainAspectRatio: true,
          })
        );
      });
    });
  });
});

describe('AUTO_RESIZE_STORAGE_KEY constant', () => {
  it('should have the correct storage key value', () => {
    expect(AUTO_RESIZE_STORAGE_KEY).toBe('image-upscaler-auto-resize');
  });
});
