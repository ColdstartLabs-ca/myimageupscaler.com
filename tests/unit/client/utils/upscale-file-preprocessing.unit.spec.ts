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

  it('keeps Quick 2x originals that fit the scale-preserving fallback', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 2048, height: 2048 });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
    expect(result.maxPixels).toBeNull();
    expect(result.dimensions).toEqual({
      width: 2048,
      height: 2048,
      pixels: 4_194_304,
    });
    expect(compressImage).not.toHaveBeenCalled();
  });

  it('auto-resizes Quick 2x images outside the scale-preserving fallback envelope', async () => {
    const file = new File(['image'], 'katie-photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/jpeg' }),
      originalSize: 1000,
      compressedSize: 800,
      reductionPercent: 20,
      dimensions: { width: 1375, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImage).toHaveBeenCalledWith(file, {
      maxPixels: 4_194_304,
      maxWidth: 2048,
      maxHeight: 2048,
      format: 'jpeg',
      maintainAspectRatio: true,
    });
    expect(result.resized).toBe(true);
    expect(result.dimensions).toEqual({
      width: 1375,
      height: 2048,
      pixels: 2_816_000,
    });
  });

  it('auto-resizes Quick 2x images that only exceed the verified fallback side', async () => {
    const file = new File(['image'], 'tall-photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2300 });
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/jpeg' }),
      originalSize: 1000,
      compressedSize: 800,
      reductionPercent: 20,
      dimensions: { width: 1514, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImage).toHaveBeenCalled();
    expect(result.resized).toBe(true);
  });

  it('uses the Real-ESRGAN limit when auto-resizing oversized Quick 4x inputs', async () => {
    const file = new File(['image'], 'quick-4x.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/jpeg' }),
      originalSize: 1000,
      compressedSize: 700,
      reductionPercent: 30,
      dimensions: { width: 1186, height: 1767 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 4);

    expect(compressImage).toHaveBeenCalledWith(file, {
      maxPixels: 2_096_704,
      format: 'jpeg',
      maintainAspectRatio: true,
    });
    expect(result.resized).toBe(true);
  });

  it('keeps unsupported Quick originals when auto-resize is disabled', async () => {
    const file = new File(['image'], 'quick-original.png', { type: 'image/png' });
    vi.mocked(isAutoResizeEnabled).mockReturnValue(false);
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
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
