import { describe, test, expect } from 'vitest';
import {
  IMAGE_VALIDATION,
  decodeImageDimensions,
  getBase64PayloadLength,
  getBase64PayloadOffset,
  getBase64Size,
  readBase64Prefix,
  upscaleSchema,
  validateMagicBytes,
} from '../../../shared/validation/upscale.schema';

/**
 * Regression: Cloudflare Worker `exceededMemory` (~300/day) returned a non-JSON
 * 503 that the client could only classify as `edge_error`.
 *
 * The upscale payload is base64 inside a JSON body. Every validation helper
 * called `imageData.split(',')[1]`, allocating a full copy of a multi-megabyte
 * string — and JS strings are UTF-16, so each copy costs ~2 bytes per character
 * against the Worker's 128MB limit. Four copies plus the raw and parsed request
 * text exceeded the limit before the size check could reject anything.
 *
 * These tests pin the zero-copy contract: helpers read what they need by offset.
 */

const PNG_HEADER_B64 = 'iVBORw0KGgoAAAANSUhEUg==';

function dataUrl(base64: string, mime = 'image/png'): string {
  return `data:${mime};base64,${base64}`;
}

describe('upscale request memory guards', () => {
  describe('getBase64PayloadOffset', () => {
    test('returns 0 for raw base64 with no data URL prefix', () => {
      expect(getBase64PayloadOffset(PNG_HEADER_B64)).toBe(0);
    });

    test('points past the comma for a data URL', () => {
      const url = dataUrl(PNG_HEADER_B64);
      expect(getBase64PayloadOffset(url)).toBe(url.indexOf(',') + 1);
      expect(url.slice(getBase64PayloadOffset(url))).toBe(PNG_HEADER_B64);
    });

    test('treats a data URL with no comma as raw payload rather than throwing', () => {
      expect(getBase64PayloadOffset('data:image/png;base64')).toBe(0);
    });

    test('ignores commas that appear inside the payload region', () => {
      // Only the first comma delimits a data URL; later ones belong to the body.
      const url = 'data:image/png;base64,AAAA,BBBB';
      expect(url.slice(getBase64PayloadOffset(url))).toBe('AAAA,BBBB');
    });
  });

  describe('getBase64PayloadLength', () => {
    test('measures the payload without the prefix', () => {
      expect(getBase64PayloadLength(dataUrl(PNG_HEADER_B64))).toBe(PNG_HEADER_B64.length);
      expect(getBase64PayloadLength(PNG_HEADER_B64)).toBe(PNG_HEADER_B64.length);
    });

    test('reports 0 for a prefix with an empty payload', () => {
      expect(getBase64PayloadLength('data:image/png;base64,')).toBe(0);
    });
  });

  describe('readBase64Prefix', () => {
    test('reads only the requested characters', () => {
      expect(readBase64Prefix(dataUrl(PNG_HEADER_B64), 8)).toBe(PNG_HEADER_B64.slice(0, 8));
    });

    test('does not read past the end of a short payload', () => {
      expect(readBase64Prefix(dataUrl('AAAA'), 44000)).toBe('AAAA');
    });
  });

  describe('getBase64Size', () => {
    test('counts padding from the tail, matching the decoded byte count', () => {
      // "AAAA" -> 3 bytes, "AAA=" -> 2 bytes, "AA==" -> 1 byte
      expect(getBase64Size('AAAA')).toBe(3);
      expect(getBase64Size('AAA=')).toBe(2);
      expect(getBase64Size('AA==')).toBe(1);
    });

    test('ignores the data URL prefix when sizing', () => {
      expect(getBase64Size(dataUrl('AAAA'))).toBe(getBase64Size('AAAA'));
    });

    test('does not count "=" characters inside the payload as padding', () => {
      // The old implementation matched /=/g across the whole payload, so an
      // interior "=" under-reported the size and allocated a match array.
      expect(getBase64Size('AA=A')).toBe(3);
    });

    test('returns 0 for an empty payload', () => {
      expect(getBase64Size('data:image/png;base64,')).toBe(0);
    });
  });

  describe('MAX_REQUEST_BYTES', () => {
    test('caps the request body below what the 128MB Worker can buffer', () => {
      // Peak is ~4 bytes per body byte (raw text + parsed string, both UTF-16).
      expect(IMAGE_VALIDATION.MAX_REQUEST_BYTES).toBe(24 * 1024 * 1024);
      expect(IMAGE_VALIDATION.MAX_REQUEST_BYTES * 4).toBeLessThan(128 * 1024 * 1024);
    });

    test('leaves the free tier limit comfortably inside the body cap', () => {
      const base64Overhead = 4 / 3;
      expect(IMAGE_VALIDATION.MAX_SIZE_FREE * base64Overhead).toBeLessThan(
        IMAGE_VALIDATION.MAX_REQUEST_BYTES
      );
    });
  });

  describe('helpers still behave correctly after the zero-copy rewrite', () => {
    test('validateMagicBytes detects PNG through a data URL', () => {
      const result = validateMagicBytes(dataUrl(PNG_HEADER_B64));
      expect(result.valid).toBe(true);
      expect(result.detectedMimeType).toBe('image/png');
    });

    test('validateMagicBytes rejects a payload too short to identify', () => {
      expect(validateMagicBytes(dataUrl('AAAA')).valid).toBe(false);
    });

    test('decodeImageDimensions reads a PNG header from a data URL', () => {
      // 1x1 PNG
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      expect(decodeImageDimensions(dataUrl(png))).toEqual({ width: 1, height: 1 });
    });

    test('upscaleSchema accepts a data URL and rejects an empty payload', () => {
      const config = { qualityTier: 'quick', scale: 2 };
      expect(
        upscaleSchema.safeParse({
          imageData: dataUrl(PNG_HEADER_B64),
          mimeType: 'image/png',
          config,
        }).success
      ).toBe(true);
      expect(
        upscaleSchema.safeParse({
          imageData: 'data:image/png;base64,',
          mimeType: 'image/png',
          config,
        }).success
      ).toBe(false);
    });
  });
});
