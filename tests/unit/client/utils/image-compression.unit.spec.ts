import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  compressImage,
  compressImageWithinByteLimit,
  getConstrainedDimensions,
} from '@client/utils/image-compression';

function mockCanvasEnvironment(
  imageWidth: number,
  imageHeight: number,
  createBlob?: (input: {
    canvasWidth: number;
    canvasHeight: number;
    type?: string;
    quality?: unknown;
    callIndex: number;
  }) => Blob
) {
  let callIndex = 0;
  const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: unknown) => {
    callback(
      createBlob?.({
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        type,
        quality,
        callIndex: callIndex++,
      }) ?? new Blob(['compressed'], { type: type ?? 'image/jpeg' })
    );
    return quality;
  });

  const drawImage = vi.fn();
  const revokeObjectURL = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:mock');

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage,
    })),
    toBlob,
  };

  const image = {
    width: imageWidth,
    height: imageHeight,
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.();
      });
    },
  };

  vi.stubGlobal('URL', {
    createObjectURL,
    revokeObjectURL,
  });

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas as unknown as HTMLCanvasElement;
    }
    if (tagName === 'img') {
      return image as unknown as HTMLImageElement;
    }

    return document.createElement(tagName);
  });

  return { canvas, toBlob, drawImage, revokeObjectURL, createObjectURL };
}

describe('image-compression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calculates the actual constrained size when max side and max pixels both apply', () => {
    expect(
      getConstrainedDimensions({
        width: 1700,
        height: 2532,
        maxWidth: 2048,
        maxHeight: 2048,
        maxPixels: 4_194_304,
        maintainAspectRatio: true,
      })
    ).toEqual({
      width: 1375,
      height: 2048,
    });
  });

  it('keeps PNG output lossless with matching MIME and extension behavior', async () => {
    const { toBlob } = mockCanvasEnvironment(3200, 1600);
    const file = new File(['png'], 'transparent.png', { type: 'image/png' });

    const result = await compressImage(file, {
      maxWidth: 2048,
      maxHeight: 2048,
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
    expect(result.blob.type).toBe('image/png');
    expect(result.dimensions).toEqual({ width: 2048, height: 1024 });
  });

  it('uses quality 80 by default for generic lossy compression', async () => {
    const { toBlob } = mockCanvasEnvironment(2000, 1000);
    const file = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });

    const result = await compressImage(file, {
      maxWidth: 1500,
      maxHeight: 1500,
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.dimensions).toEqual({ width: 1500, height: 750 });
  });

  it('uses near-lossless quality when preprocessing JPEG inputs', async () => {
    const { toBlob } = mockCanvasEnvironment(1700, 2532);
    const file = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });

    const result = await compressImage(file, {
      maxWidth: 2048,
      maxHeight: 2048,
      maxPixels: 4_194_304,
      quality: 95,
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.dimensions).toEqual({ width: 1375, height: 2048 });
  });

  it('uses near-lossless quality when preprocessing WebP inputs', async () => {
    const { toBlob } = mockCanvasEnvironment(1700, 2532);
    const file = new File(['webp'], 'photo.webp', { type: 'image/webp' });

    const result = await compressImage(file, {
      maxWidth: 2048,
      maxHeight: 2048,
      maxPixels: 4_194_304,
      quality: 95,
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.95);
    expect(result.blob.type).toBe('image/webp');
    expect(result.dimensions).toEqual({ width: 1375, height: 2048 });
  });

  it('converts byte-target PNG compression to JPEG to preserve the upload byte contract', async () => {
    const { toBlob } = mockCanvasEnvironment(1600, 1200);
    const file = new File(['png'], 'transparent.png', { type: 'image/png' });

    const result = await compressImage(file, {
      targetSizeBytes: 1024,
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', expect.any(Number));
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.dimensions).toEqual({ width: 1600, height: 1200 });
  });

  it('reports the actual fallback canvas dimensions when byte-target scaling rounds down by 1px', async () => {
    const targetBytes = 1000;
    const { toBlob } = mockCanvasEnvironment(1700, 2532, ({ canvasWidth, canvasHeight, type }) => {
      const isFallbackPass = canvasWidth === 687 && canvasHeight === 1023;
      const size = isFallbackPass ? 900 : 4000;
      return new Blob(['x'.repeat(size)], { type: type ?? 'image/jpeg' });
    });
    const file = new File(['jpg'], 'portrait.jpg', { type: 'image/jpeg' });

    const result = await compressImage(file, {
      targetSizeBytes: targetBytes,
      maxWidth: 1375,
      maxHeight: 2048,
    });

    expect(toBlob).toHaveBeenLastCalledWith(expect.any(Function), 'image/jpeg', 0.75);
    expect(result.dimensions).toEqual({ width: 687, height: 1023 });
  });

  it('applies the pixel cap on the byte-target path', async () => {
    const { canvas } = mockCanvasEnvironment(3000, 3000);
    const file = new File(['jpg'], 'huge.jpg', { type: 'image/jpeg' });

    await compressImage(file, {
      targetSizeBytes: 5_000_000,
      maxPixels: 1_000_000,
    });

    // 3000x3000 scaled to fit 1M pixels => 1000x1000, not left at source size.
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(1000);
  });

  it('re-encodes as JPEG when a lossless resize blows past the byte ceiling', async () => {
    const maxBytes = 1000;
    // Canvas PNG encodes of photographic content routinely exceed the tier limit
    // even as the image shrinks in pixels; JPEG stays comfortably under it.
    const { toBlob } = mockCanvasEnvironment(
      4000,
      4000,
      ({ type }) =>
        new Blob(['x'.repeat(type === 'image/png' ? 4000 : 500)], { type: type ?? 'image/jpeg' })
    );
    const file = new File(['png'], 'screenshot.png', { type: 'image/png' });

    const result = await compressImageWithinByteLimit(
      file,
      { maxPixels: 4_194_304, format: 'png', quality: 95, maintainAspectRatio: true },
      maxBytes
    );

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blob.size).toBeLessThanOrEqual(maxBytes);
  });

  it('keeps the lossless encode when it already fits the byte ceiling', async () => {
    const { toBlob } = mockCanvasEnvironment(
      4000,
      4000,
      ({ type }) => new Blob(['x'.repeat(200)], { type: type ?? 'image/jpeg' })
    );
    const file = new File(['png'], 'icon.png', { type: 'image/png' });

    const result = await compressImageWithinByteLimit(
      file,
      { maxPixels: 4_194_304, format: 'png', maintainAspectRatio: true },
      1000
    );

    expect(result.blob.type).toBe('image/png');
    expect(toBlob).toHaveBeenCalledTimes(1);
  });
});
