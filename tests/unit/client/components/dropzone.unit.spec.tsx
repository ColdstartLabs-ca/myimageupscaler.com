import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dropzone } from '@client/components/features/image-processing/Dropzone';

const { showToast, track, processFilesAsync, compressImage } = vi.hoisted(() => ({
  showToast: vi.fn(),
  track: vi.fn(),
  processFilesAsync: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
          format: 'jpeg',
          maintainAspectRatio: true,
        })
      );
    });
  });
});
