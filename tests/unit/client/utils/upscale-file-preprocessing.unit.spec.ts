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
    expect(result.maxPixels).toBeNull();
    expect(result.dimensions).toEqual({
      width: 1000,
      height: 1000,
      pixels: 1_000_000,
    });
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('never downsizes Quick inputs because scale is relative to the original', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 3006, height: 1994 });

    const result = await prepareFileForProcessing(file, 'quick');

    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
    expect(result.maxPixels).toBeNull();
    expect(result.dimensions).toEqual({
      width: 3006,
      height: 1994,
      pixels: 5_993_964,
    });
    expect(compressImage).not.toHaveBeenCalled();
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

    const result = await prepareFileForProcessing(file, 'face-restore');

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(result.maxPixels).toBe(1_500_000);
    expect(compressImage).not.toHaveBeenCalled();
  });
});
