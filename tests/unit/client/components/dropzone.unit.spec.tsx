import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dropzone } from '@client/components/features/image-processing/Dropzone';
import enWorkspace from '../../../../locales/en/workspace.json';

const { showToast, track, processFilesAsync, compressImage, compressImageWithinByteLimit } =
  vi.hoisted(() => ({
    showToast: vi.fn(),
    track: vi.fn(),
    processFilesAsync: vi.fn(),
    compressImage: vi.fn(),
    compressImageWithinByteLimit: vi.fn(),
  }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (key === 'oversizedImage.autoResizeToastUpload') {
      return enWorkspace.oversizedImage.autoResizeToastUpload
        .replace('{resizedWidth}', String(values?.resizedWidth))
        .replace('{resizedHeight}', String(values?.resizedHeight));
    }

    if (key === 'oversizedImage.autoResizeToastUploadBatch') {
      return `${values?.count} images were resized to fit upload limits before processing.`;
    }

    return key;
  },
}));

vi.mock('@client/store/userStore', () => ({
  useUserData: () => ({
    subscription: null,
    isFreeUser: true,
  }),
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: () => ({
    showToast,
  }),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track,
  },
}));

vi.mock('@client/utils/file-validation', () => ({
  processFilesAsync,
}));

vi.mock('@client/utils/image-compression', () => ({
  compressImage,
  compressImageWithinByteLimit,
}));

vi.mock('@client/utils/auto-resize-preference', () => ({
  isAutoResizeEnabled: () => true,
}));

vi.mock('@client/components/features/image-processing/OversizedImageModal', () => ({
  OversizedImageModal: () => null,
}));

describe('Dropzone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes maxPixels when auto-compressing files rejected for size', async () => {
    const file = new File(['oversized'], 'large.png', { type: 'image/png' });
    processFilesAsync.mockResolvedValue({
      validFiles: [],
      oversizedFiles: [file],
      oversizedDimensionFiles: [],
      invalidTypeFiles: [],
      errorMessage: 'Some files exceed the size limit.',
    });
    compressImage.mockResolvedValue({
      blob: new Blob(['compressed'], { type: 'image/jpeg' }),
      originalSize: 6 * 1024 * 1024,
      compressedSize: 1024,
      reductionPercent: 90,
      dimensions: { width: 1200, height: 1000 },
    });

    render(<Dropzone onFilesSelected={vi.fn()} maxPixels={1_500_000} />);

    const input = screen.getByLabelText('dropzone.clickOrDragImages');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(compressImage).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          targetSizeBytes: expect.any(Number),
          maxPixels: 1_500_000,
          maintainAspectRatio: true,
        })
      );
    });
  });

  it('shows a truthful upload auto-resize toast with resized dimensions', async () => {
    const file = new File(['oversized'], 'large.png', { type: 'image/png' });
    processFilesAsync.mockResolvedValue({
      validFiles: [],
      oversizedFiles: [],
      oversizedDimensionFiles: [
        {
          file,
          dimensions: { width: 1700, height: 2532, pixels: 4_304_400 },
        },
      ],
      invalidTypeFiles: [],
      errorMessage: 'Some files exceed the dimension limit.',
    });
    compressImageWithinByteLimit.mockResolvedValue({
      blob: new Blob(['compressed'], { type: 'image/png' }),
      originalSize: 6 * 1024 * 1024,
      compressedSize: 1024,
      reductionPercent: 90,
      dimensions: { width: 1375, height: 2048 },
    });

    render(<Dropzone onFilesSelected={vi.fn()} maxPixels={4_194_304} />);

    const input = screen.getByLabelText('dropzone.clickOrDragImages');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Image resized to 1375×2048 so it fits upload limits before processing.',
          type: 'info',
        })
      );
    });
  });

  it('uses a count-based upload toast when multiple files auto-resize', async () => {
    const fileA = new File(['oversized-a'], 'large-a.png', { type: 'image/png' });
    const fileB = new File(['oversized-b'], 'large-b.jpg', { type: 'image/jpeg' });
    processFilesAsync.mockResolvedValue({
      validFiles: [],
      oversizedFiles: [],
      oversizedDimensionFiles: [
        {
          file: fileA,
          dimensions: { width: 1700, height: 2532, pixels: 4_304_400 },
        },
        {
          file: fileB,
          dimensions: { width: 3000, height: 2000, pixels: 6_000_000 },
        },
      ],
      invalidTypeFiles: [],
      errorMessage: 'Some files exceed the dimension limit.',
    });
    compressImageWithinByteLimit
      .mockResolvedValueOnce({
        blob: new Blob(['compressed-a'], { type: 'image/png' }),
        originalSize: 6 * 1024 * 1024,
        compressedSize: 1024,
        reductionPercent: 90,
        dimensions: { width: 1375, height: 2048 },
      })
      .mockResolvedValueOnce({
        blob: new Blob(['compressed-b'], { type: 'image/jpeg' }),
        originalSize: 8 * 1024 * 1024,
        compressedSize: 2048,
        reductionPercent: 88,
        dimensions: { width: 1448, height: 965 },
      });

    render(<Dropzone onFilesSelected={vi.fn()} maxPixels={4_194_304} />);

    const input = screen.getByLabelText('dropzone.clickOrDragImages');
    fireEvent.change(input, { target: { files: [fileA, fileB] } });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '2 images were resized to fit upload limits before processing.',
          type: 'info',
        })
      );
    });
  });

  it('keeps byte-limit PNG auto-compression on the legacy JPEG output branch', async () => {
    const onFilesSelected = vi.fn();
    const file = new File(['oversized'], 'large.png', { type: 'image/png' });
    processFilesAsync.mockResolvedValue({
      validFiles: [],
      oversizedFiles: [file],
      oversizedDimensionFiles: [],
      invalidTypeFiles: [],
      errorMessage: 'Some files exceed the size limit.',
    });
    compressImage.mockResolvedValue({
      blob: new Blob(['compressed'], { type: 'image/jpeg' }),
      originalSize: 6 * 1024 * 1024,
      compressedSize: 1024,
      reductionPercent: 90,
      dimensions: { width: 1200, height: 900 },
    });

    render(<Dropzone onFilesSelected={onFilesSelected} maxPixels={1_500_000} />);

    const input = screen.getByLabelText('dropzone.clickOrDragImages');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            name: 'large.jpg',
            type: 'image/jpeg',
          }),
        ],
        'file_picker'
      );
    });
  });
});
