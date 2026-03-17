import { describe, it, expect } from 'vitest';
import {
  getRegionTier,
  getFreeCreditsForTier,
  PAYWALLED_COUNTRIES,
} from '@/lib/anti-freeloader/region-classifier';

describe('getRegionTier', () => {
  it('should return standard for US', () => {
    expect(getRegionTier('US')).toBe('standard');
  });

  it('should return standard for GB', () => {
    expect(getRegionTier('GB')).toBe('standard');
  });

  it('should return standard for JP', () => {
    expect(getRegionTier('JP')).toBe('standard');
  });

  it('should return restricted for PH', () => {
    expect(getRegionTier('PH')).toBe('restricted');
  });

  it('should return restricted for IN', () => {
    expect(getRegionTier('IN')).toBe('restricted');
  });

  it('should return restricted for BR', () => {
    expect(getRegionTier('BR')).toBe('restricted');
  });

  it('should be case-insensitive', () => {
    expect(getRegionTier('us')).toBe('standard');
  });

  it('should return restricted for empty string', () => {
    expect(getRegionTier('')).toBe('restricted');
  });

  it('should return restricted for Tor exit nodes (T1)', () => {
    expect(getRegionTier('T1')).toBe('restricted');
  });

  it('should return restricted for unknown IPs (XX)', () => {
    expect(getRegionTier('XX')).toBe('restricted');
  });
});

describe('paywalled tier', () => {
  it('should return paywalled for country in PAYWALLED_COUNTRIES', () => {
    // Temporarily add a test country
    const originalSize = PAYWALLED_COUNTRIES.size;
    PAYWALLED_COUNTRIES.add('XX'); // Test country code

    expect(getRegionTier('XX')).toBe('paywalled');

    // Cleanup
    PAYWALLED_COUNTRIES.delete('XX');
    expect(PAYWALLED_COUNTRIES.size).toBe(originalSize);
  });

  it('should prioritize paywalled over standard', () => {
    // US is in HIGH_PURCHASING_POWER_COUNTRIES
    // If we add it to PAYWALLED_COUNTRIES, paywalled should win
    PAYWALLED_COUNTRIES.add('US');

    expect(getRegionTier('US')).toBe('paywalled');

    // Cleanup
    PAYWALLED_COUNTRIES.delete('US');
  });

  it('getFreeCreditsForTier should return 0 for paywalled', () => {
    expect(getFreeCreditsForTier('paywalled')).toBe(0);
  });

  it('getFreeCreditsForTier should return 3 for restricted', () => {
    expect(getFreeCreditsForTier('restricted')).toBe(3);
  });

  it('getFreeCreditsForTier should return 10 for standard', () => {
    expect(getFreeCreditsForTier('standard')).toBe(10);
  });
});
