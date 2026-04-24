/**
 * Extension Image Utils Tests
 *
 * Tests image utility functions used by the extension.
 */

import { describe, it, expect } from 'vitest';

const { isDataUrl } = await import('@extension/shared/image-utils');

describe('Extension Image Utils', () => {
  describe('isDataUrl', () => {
    it('returns true for valid data URLs', () => {
      expect(isDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
      expect(isDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
      expect(isDataUrl('data:image/webp;base64,UklGR')).toBe(true);
    });

    it('returns false for non-data URLs', () => {
      expect(isDataUrl('https://example.com/image.png')).toBe(false);
      expect(isDataUrl('http://localhost:3000/img.jpg')).toBe(false);
      expect(isDataUrl('')).toBe(false);
      expect(isDataUrl('data:text/html;base64,abc')).toBe(false);
    });

    it('is case insensitive for image type', () => {
      expect(isDataUrl('data:IMAGE/PNG;base64,abc')).toBe(true);
    });
  });
});
