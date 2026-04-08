import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareFileForProcessing } from '@client/utils/upscale-file-preprocessing';
import { compressImage } from '@client/utils/image-compression';
import { loadImageDimensions } from '@client/utils/file-validation';
import { isAutoResizeEnabled } from '@client/utils/auto-resize-preference';

vi.mock('@client/utils/file-validation', () => ({
  loadImageDimensions: vi.fn(),
}));

vi.mock('@client/utils/image-compression', () => ({
  compressImage: vi.fn(),
}));

vi.mock('@client/utils/auto-resize-preference', () => ({
  isAutoResizeEnabled: vi.fn(),
}));

describe('prepareFileForProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAutoResizeEnabled).mockReturnValue(true);
  });

  it('keeps the original file when it already fits the current tier limit', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1000, height: 1000 });

    const result = await prepareFileForProcessing(file, 'quick');

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(result.maxPixels).toBe(1_500_000);
    expect(result.dimensions).toEqual({
      width: 1000,
      height: 1000,
      pixels: 1_000_000,
    });
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('auto-resizes files that exceed the selected tier limit', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 3006, height: 1994 });
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/jpeg' }),
      originalSize: file.size,
      compressedSize: 1234,
      reductionPercent: 50,
      dimensions: { width: 1503, height: 997 },
    });

    const result = await prepareFileForProcessing(file, 'quick');

    expect(result.resized).toBe(true);
    expect(result.file).not.toBe(file);
    expect(result.file.name).toBe('photo.jpg');
    expect(result.file.type).toBe('image/jpeg');
    expect(result.maxPixels).toBe(1_500_000);
    expect(result.dimensions).toEqual({
      width: 1503,
      height: 997,
      pixels: 1_498_491,
    });
    expect(compressImage).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        maxPixels: 1_500_000,
        format: 'jpeg',
        maintainAspectRatio: true,
      })
    );
  });

  it('skips pixel resizing for tiers without a processing pixel cap', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 3006, height: 1994 });

    const result = await prepareFileForProcessing(file, 'bg-removal');

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(result.maxPixels).toBeNull();
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('respects the auto-resize preference when it is disabled', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(isAutoResizeEnabled).mockReturnValue(false);
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 3006, height: 1994 });

    const result = await prepareFileForProcessing(file, 'quick');

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(result.maxPixels).toBe(1_500_000);
    expect(compressImage).not.toHaveBeenCalled();
  });
});
