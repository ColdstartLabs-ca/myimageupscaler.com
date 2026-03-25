/**
 * @jest/globals
 */
import { describe, it, expect } from 'vitest';

// Import the utility
import { getSafeLocale } from '@/lib/seo/locale-utils';

describe('pSEO Internal Links', () => {
  describe('getSafeLocale utility', () => {
    it('should return empty string for undefined locale', () => {
      expect(getSafeLocale(undefined)).toBe('');
    });

    it('should return empty string for "undefined" string literal', () => {
      expect(getSafeLocale('undefined')).toBe('');
    });

    it('should return the locale for valid locale string', () => {
      expect(getSafeLocale('en')).toBe('en');
      expect(getSafeLocale('es')).toBe('es');
      expect(getSafeLocale('pt')).toBe('pt');
      expect(getSafeLocale('de')).toBe('de');
      expect(getSafeLocale('fr')).toBe('fr');
      expect(getSafeLocale('it')).toBe('it');
      expect(getSafeLocale('ja')).toBe('ja');
    });

    it('should return empty string for null locale', () => {
      expect(getSafeLocale(null as unknown as string)).toBe('');
    });

    it('should return empty string for empty string locale', () => {
      expect(getSafeLocale('')).toBe('');
    });

    it('should return empty string for whitespace-only locale', () => {
      expect(getSafeLocale('   ')).toBe('');
    });
  });

  describe('URL generation patterns', () => {
    it('should never produce /undefined/ in URL paths', () => {
      const testCases = [
        { locale: undefined, expected: '' },
        { locale: 'undefined', expected: '' },
        { locale: null, expected: '' },
        { locale: '', expected: '' },
        { locale: 'en', expected: 'en' },
        { locale: 'es', expected: 'es' },
      ];

      testCases.forEach(({ locale, expected }) => {
        const safeLocale = getSafeLocale(locale as unknown as string);
        expect(safeLocale).toBe(expected);

        // Verify no /undefined/ in paths
        if (expected) {
          const path = `/${safeLocale}/tools/test`;
          expect(path).not.toContain('/undefined/');
        } else {
          const path = '/tools/test';
          expect(path).not.toContain('/undefined/');
        }
      });
    });
  });
});
