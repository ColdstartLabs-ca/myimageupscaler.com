/**
 * Unit tests for client-side file validation
 * Tests dimension checking, pixel limits, and async file processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exceedsMaxPixels,
  validateImageFile,
  processFiles,
  processFilesAsync,
} from '@client/utils/file-validation';

describe('file-validation', () => {
  describe('exceedsMaxPixels', () => {
    it('should return false for images within limit', () => {
      // Default limit is 1.5M pixels
      expect(exceedsMaxPixels(1000, 1000)).toBe(false); // 1M pixels
      expect(exceedsMaxPixels(1200, 1200)).toBe(false); // 1.44M pixels
      expect(exceedsMaxPixels(1224, 1224)).toBe(false); // ~1.498M pixels
    });

    it('should return true for images exceeding limit', () => {
      expect(exceedsMaxPixels(2000, 2000)).toBe(true); // 4M pixels
      expect(exceedsMaxPixels(4000, 3000)).toBe(true); // 12M pixels
      expect(exceedsMaxPixels(1300, 1300)).toBe(true); // 1.69M > 1.5M
    });

    it('should respect custom maxPixels parameter', () => {
      expect(exceedsMaxPixels(2000, 2000, 5_000_000)).toBe(false); // 4M < 5M
      expect(exceedsMaxPixels(3000, 3000, 5_000_000)).toBe(true); // 9M > 5M
    });

    it('should use default IMAGE_VALIDATION.MAX_PIXELS when not specified', () => {
      // Default is 1.5M pixels
      expect(exceedsMaxPixels(1200, 1200)).toBe(false); // 1.44M < 1.5M
      expect(exceedsMaxPixels(1300, 1300)).toBe(true); // 1.69M > 1.5M
    });
  });

  describe('validateImageFile', () => {
    it('should accept valid image types', () => {
      const jpegFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const pngFile = new File([''], 'test.png', { type: 'image/png' });
      const webpFile = new File([''], 'test.webp', { type: 'image/webp' });

      expect(validateImageFile(jpegFile, false)).toEqual({ valid: true });
      expect(validateImageFile(pngFile, false)).toEqual({ valid: true });
      expect(validateImageFile(webpFile, false)).toEqual({ valid: true });
    });

    it('should reject invalid image types', () => {
      const gifFile = new File([''], 'test.gif', { type: 'image/gif' });
      const bmpFile = new File([''], 'test.bmp', { type: 'image/bmp' });
      const txtFile = new File([''], 'test.txt', { type: 'text/plain' });

      expect(validateImageFile(gifFile, false)).toEqual({ valid: false, reason: 'type' });
      expect(validateImageFile(bmpFile, false)).toEqual({ valid: false, reason: 'type' });
      expect(validateImageFile(txtFile, false)).toEqual({ valid: false, reason: 'type' });
    });

    it('should reject files exceeding free tier size limit', () => {
      // Free tier limit is 5MB
      const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.jpg', {
        type: 'image/jpeg',
      });

      const result = validateImageFile(largeFile, false);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('size');
    });

    it('should accept larger files for paid users', () => {
      // Paid tier limit is 25MB
      const mediumFile = new File(['x'.repeat(10 * 1024 * 1024)], 'medium.jpg', {
        type: 'image/jpeg',
      });

      const result = validateImageFile(mediumFile, true);
      expect(result.valid).toBe(true);
    });

    it('should reject files exceeding paid tier size limit', () => {
      // Paid tier limit is 25MB
      const hugeFile = new File(['x'.repeat(30 * 1024 * 1024)], 'huge.jpg', {
        type: 'image/jpeg',
      });

      const result = validateImageFile(hugeFile, true);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('size');
    });
  });

  describe('processFiles', () => {
    it('should separate valid, oversized, and invalid type files', () => {
      const validFile = new File(['x'.repeat(1000)], 'valid.jpg', { type: 'image/jpeg' });
      const oversizedFile = new File(['x'.repeat(6 * 1024 * 1024)], 'oversized.jpg', {
        type: 'image/jpeg',
      });
      const invalidFile = new File(['x'.repeat(1000)], 'invalid.gif', { type: 'image/gif' });

      const result = processFiles([validFile, oversizedFile, invalidFile], false);

      expect(result.validFiles).toEqual([validFile]);
      expect(result.oversizedFiles).toEqual([oversizedFile]);
      expect(result.invalidTypeFiles).toEqual([invalidFile]);
      expect(result.oversizedDimensionFiles).toEqual([]);
      expect(result.errorMessage).toBeTruthy();
    });

    it('should return no error message when all files are valid', () => {
      const file1 = new File(['x'.repeat(1000)], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['x'.repeat(1000)], 'test2.jpg', { type: 'image/jpeg' });

      const result = processFiles([file1, file2], false);

      expect(result.validFiles).toHaveLength(2);
      expect(result.oversizedFiles).toHaveLength(0);
      expect(result.invalidTypeFiles).toHaveLength(0);
      expect(result.errorMessage).toBeNull();
    });
  });
});

/**
 * Tests for processFilesAsync with mocked browser Image API
 * Mocks URL.createObjectURL and Image to control dimension responses
 */
describe('processFilesAsync', () => {
  let mockImageInstances: Array<{ onload?: () => void; onerror?: () => void; src?: string }>;
  // Map filename -> dimensions to return
  let dimensionMap: Map<string, { width: number; height: number }>;
  // Set of filenames that should trigger onerror
  let errorFileNames: Set<string>;

  // Track createObjectURL calls to map URLs back to file names
  let urlToFileName: Map<string, string>;
  let urlCounter: number;

  beforeEach(() => {
    mockImageInstances = [];
    dimensionMap = new Map();
    errorFileNames = new Set();
    urlToFileName = new Map();
    urlCounter = 0;

    // Mock URL.createObjectURL to return a trackable URL
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      const file = blob as File;
      const url = `blob:mock-${urlCounter++}`;
      urlToFileName.set(url, file.name);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock the global Image constructor
    vi.stubGlobal(
      'Image',
      class MockImage {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';

        get src() {
          return this._src;
        }

        set src(url: string) {
          this._src = url;
          const fileName = urlToFileName.get(url) ?? '';

          // Simulate async image load
          setTimeout(() => {
            if (errorFileNames.has(fileName)) {
              this.onerror?.();
              return;
            }
            const dims = dimensionMap.get(fileName) ?? { width: 100, height: 100 };
            this.naturalWidth = dims.width;
            this.naturalHeight = dims.height;
            this.onload?.();
          }, 0);
        }

        constructor() {
          mockImageInstances.push(this);
        }
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should classify dimension-oversized files separately from valid files', async () => {
    dimensionMap.set('big.jpg', { width: 3000, height: 2000 }); // 6MP > 1.5MP
    dimensionMap.set('small.jpg', { width: 800, height: 600 }); // 0.48MP

    const smallFile = new File(['x'.repeat(100)], 'small.jpg', { type: 'image/jpeg' });
    const bigFile = new File(['x'.repeat(100)], 'big.jpg', { type: 'image/jpeg' });

    const result = await processFilesAsync([smallFile, bigFile], false);

    expect(result.validFiles).toHaveLength(1);
    expect(result.validFiles[0].name).toBe('small.jpg');
    expect(result.oversizedDimensionFiles).toHaveLength(1);
    expect(result.oversizedDimensionFiles[0].file.name).toBe('big.jpg');
    expect(result.oversizedDimensionFiles[0].dimensions.pixels).toBe(6_000_000);
    expect(result.oversizedFiles).toHaveLength(0);
  });

  it('should return dimension-specific error message when only dimension files rejected', async () => {
    dimensionMap.set('big.jpg', { width: 2000, height: 2000 }); // 4MP > 1.5MP

    const file = new File(['x'.repeat(100)], 'big.jpg', { type: 'image/jpeg' });
    const result = await processFilesAsync([file], false);

    expect(result.errorMessage).toContain('pixel limit');
    expect(result.errorMessage).toContain('1.5MP');
  });

  it('should use custom maxPixels parameter for dimension validation', async () => {
    dimensionMap.set('test.jpg', { width: 1500, height: 1500 }); // 2.25MP

    const file = new File(['x'.repeat(100)], 'test.jpg', { type: 'image/jpeg' });

    // With 4MP limit, 2.25MP should pass
    const resultHigh = await processFilesAsync([file], false, 4_000_000);
    expect(resultHigh.validFiles).toHaveLength(1);
    expect(resultHigh.oversizedDimensionFiles).toHaveLength(0);

    // With 1MP limit, 2.25MP should fail
    const resultLow = await processFilesAsync([file], false, 1_000_000);
    expect(resultLow.validFiles).toHaveLength(0);
    expect(resultLow.oversizedDimensionFiles).toHaveLength(1);
  });

  it('should skip dimension validation when maxPixels is null', async () => {
    dimensionMap.set('large.jpg', { width: 3000, height: 3000 }); // 9MP

    const file = new File(['x'.repeat(100)], 'large.jpg', { type: 'image/jpeg' });
    const result = await processFilesAsync([file], false, null);

    expect(result.validFiles).toHaveLength(1);
    expect(result.oversizedDimensionFiles).toHaveLength(0);
    expect(result.errorMessage).toBeNull();
  });

  it('should let files through when dimension loading fails', async () => {
    errorFileNames.add('broken.jpg');

    const file = new File(['x'.repeat(100)], 'broken.jpg', { type: 'image/jpeg' });
    const result = await processFilesAsync([file], false);

    expect(result.validFiles).toHaveLength(1);
    expect(result.oversizedDimensionFiles).toHaveLength(0);
    expect(result.errorMessage).toBeNull();
  });

  it('should handle mixed rejection reasons (size + dimensions + type)', async () => {
    dimensionMap.set('huge-dims.jpg', { width: 3000, height: 2000 }); // 6MP
    dimensionMap.set('ok.jpg', { width: 100, height: 100 });

    const validFile = new File(['x'.repeat(100)], 'ok.jpg', { type: 'image/jpeg' });
    const oversizedSizeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big-bytes.jpg', {
      type: 'image/jpeg',
    });
    const oversizedDimFile = new File(['x'.repeat(100)], 'huge-dims.jpg', {
      type: 'image/jpeg',
    });
    const invalidTypeFile = new File(['x'.repeat(100)], 'doc.pdf', {
      type: 'application/pdf',
    });

    const result = await processFilesAsync(
      [validFile, oversizedSizeFile, oversizedDimFile, invalidTypeFile],
      false
    );

    expect(result.validFiles).toHaveLength(1);
    expect(result.oversizedFiles).toHaveLength(1);
    expect(result.oversizedDimensionFiles).toHaveLength(1);
    expect(result.invalidTypeFiles).toHaveLength(1);
    expect(result.errorMessage).toBeTruthy();
    expect(result.errorMessage).toContain('rejected');
  });

  it('should return null errorMessage when all files are valid', async () => {
    dimensionMap.set('a.jpg', { width: 800, height: 600 });
    dimensionMap.set('b.png', { width: 640, height: 480 });

    const file1 = new File(['x'.repeat(100)], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['x'.repeat(100)], 'b.png', { type: 'image/png' });

    const result = await processFilesAsync([file1, file2], false);

    expect(result.validFiles).toHaveLength(2);
    expect(result.errorMessage).toBeNull();
  });
});
