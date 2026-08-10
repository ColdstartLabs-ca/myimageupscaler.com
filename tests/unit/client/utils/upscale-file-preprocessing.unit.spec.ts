import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareFileForProcessing } from '@client/utils/upscale-file-preprocessing';
import { compressImageWithinByteLimit } from '@client/utils/image-compression';
import { loadImageDimensions } from '@client/utils/file-validation';
import { isAutoResizeEnabled } from '@client/utils/auto-resize-preference';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

vi.mock('@client/utils/file-validation', () => ({
  loadImageDimensions: vi.fn(),
}));

vi.mock('@client/utils/image-compression', () => ({
  compressImageWithinByteLimit: vi.fn(),
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
    expect(compressImageWithinByteLimit).not.toHaveBeenCalled();
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
    expect(compressImageWithinByteLimit).not.toHaveBeenCalled();
  });

  it('auto-resizes Quick 2x images outside the scale-preserving fallback envelope', async () => {
    const file = new File(['image'], 'katie-photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/png' }),
      originalSize: 1000,
      compressedSize: 800,
      reductionPercent: 20,
      dimensions: { width: 1375, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      {
        maxPixels: 4_194_304,
        maxWidth: 2048,
        maxHeight: 2048,
        format: 'png',
        quality: 95,
        maintainAspectRatio: true,
      },
      IMAGE_VALIDATION.MAX_SIZE_FREE
    );
    expect(result.resized).toBe(true);
    expect(result.file.type).toBe('image/png');
    expect(result.file.name).toBe('katie-photo.png');
    expect(result.dimensions).toEqual({
      width: 1375,
      height: 2048,
      pixels: 2_816_000,
    });
  });

  it('auto-resizes Quick 2x images that only exceed the verified fallback side', async () => {
    const file = new File(['image'], 'tall-photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2300 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/png' }),
      originalSize: 1000,
      compressedSize: 800,
      reductionPercent: 20,
      dimensions: { width: 1514, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImageWithinByteLimit).toHaveBeenCalled();
    expect(result.resized).toBe(true);
  });

  it('uses the Real-ESRGAN limit when auto-resizing oversized Quick 4x inputs', async () => {
    const file = new File(['image'], 'quick-4x.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/png' }),
      originalSize: 1000,
      compressedSize: 700,
      reductionPercent: 30,
      dimensions: { width: 1186, height: 1767 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 4);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      {
        maxPixels: 2_096_704,
        format: 'png',
        quality: 95,
        maintainAspectRatio: true,
      },
      IMAGE_VALIDATION.MAX_SIZE_FREE
    );
    expect(result.resized).toBe(true);
  });

  it('preserves JPEG output metadata while using near-lossless quality', async () => {
    const file = new File(['image'], 'portrait.jpg', { type: 'image/jpeg' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/jpeg' }),
      originalSize: 1000,
      compressedSize: 750,
      reductionPercent: 25,
      dimensions: { width: 1375, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      {
        maxPixels: 4_194_304,
        maxWidth: 2048,
        maxHeight: 2048,
        format: 'jpeg',
        quality: 95,
        maintainAspectRatio: true,
      },
      IMAGE_VALIDATION.MAX_SIZE_FREE
    );
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.name).toBe('portrait.jpg');
  });

  it('preserves WebP output metadata while using near-lossless quality', async () => {
    const file = new File(['image'], 'artwork.webp', { type: 'image/webp' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/webp' }),
      originalSize: 1000,
      compressedSize: 760,
      reductionPercent: 24,
      dimensions: { width: 1375, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      {
        maxPixels: 4_194_304,
        maxWidth: 2048,
        maxHeight: 2048,
        format: 'webp',
        quality: 95,
        maintainAspectRatio: true,
      },
      IMAGE_VALIDATION.MAX_SIZE_FREE
    );
    expect(result.file.type).toBe('image/webp');
    expect(result.file.name).toBe('artwork.webp');
  });

  it('falls back HEIC preprocessing to high-quality JPEG output', async () => {
    const file = new File(['image'], 'camera.heic', { type: 'image/heic' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/jpeg' }),
      originalSize: 1000,
      compressedSize: 780,
      reductionPercent: 22,
      dimensions: { width: 1375, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      {
        maxPixels: 4_194_304,
        maxWidth: 2048,
        maxHeight: 2048,
        format: 'jpeg',
        quality: 95,
        maintainAspectRatio: true,
      },
      IMAGE_VALIDATION.MAX_SIZE_FREE
    );
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.name).toBe('camera.jpg');
  });

  it('keeps unsupported Quick originals when auto-resize is disabled', async () => {
    const file = new File(['image'], 'quick-original.png', { type: 'image/png' });
    vi.mocked(isAutoResizeEnabled).mockReturnValue(false);
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(compressImageWithinByteLimit).not.toHaveBeenCalled();
  });

  it('skips pixel resizing for tiers without a processing pixel cap', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 3006, height: 1994 });

    const result = await prepareFileForProcessing(file, 'bg-removal');

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(result.maxPixels).toBeNull();
    expect(compressImageWithinByteLimit).not.toHaveBeenCalled();
  });

  it('respects the auto-resize preference when it is disabled', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(isAutoResizeEnabled).mockReturnValue(false);
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 3006, height: 1994 });

    const result = await prepareFileForProcessing(file, 'face-restore');

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(result.maxPixels).toBe(1_500_000);
    expect(compressImageWithinByteLimit).not.toHaveBeenCalled();
  });

  it('caps the resized upload at the paid byte limit when the caller is a paid user', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 1700, height: 2532 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['resized'], { type: 'image/png' }),
      originalSize: 1000,
      compressedSize: 800,
      reductionPercent: 20,
      dimensions: { width: 1375, height: 2048 },
    });

    await prepareFileForProcessing(file, 'quick', 2, IMAGE_VALIDATION.MAX_SIZE_PAID);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ format: 'png' }),
      IMAGE_VALIDATION.MAX_SIZE_PAID
    );
  });

  it('re-encodes an oversized Quick 2x fallback PNG before upload', async () => {
    const file = new File(
      [new Uint8Array(IMAGE_VALIDATION.MAX_SIZE_FREE + 1)],
      'fallback-sized.png',
      { type: 'image/png' }
    );
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 2048, height: 2048 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob(['under-limit'], { type: 'image/jpeg' }),
      originalSize: file.size,
      compressedSize: 11,
      reductionPercent: 99,
      dimensions: { width: 2048, height: 2048 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 2);

    expect(compressImageWithinByteLimit).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ format: 'png' }),
      IMAGE_VALIDATION.MAX_SIZE_FREE
    );
    expect(result.file.size).toBeLessThanOrEqual(IMAGE_VALIDATION.MAX_SIZE_FREE);
  });

  it('keeps a 12MP PNG under the free-tier byte ceiling for Quick 4x', async () => {
    const file = new File(
      [new Uint8Array(IMAGE_VALIDATION.MAX_SIZE_FREE + 1)],
      'twelve-megapixel.png',
      { type: 'image/png' }
    );
    vi.mocked(loadImageDimensions).mockResolvedValue({ width: 4000, height: 3000 });
    vi.mocked(compressImageWithinByteLimit).mockResolvedValue({
      blob: new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }),
      originalSize: file.size,
      compressedSize: 1024,
      reductionPercent: 99,
      dimensions: { width: 1448, height: 1086 },
    });

    const result = await prepareFileForProcessing(file, 'quick', 4);

    expect(result.file.size).toBeLessThanOrEqual(IMAGE_VALIDATION.MAX_SIZE_FREE);
    expect(result.dimensions?.width).toBe(1448);
    expect(result.dimensions?.height).toBe(1086);
  });
});
