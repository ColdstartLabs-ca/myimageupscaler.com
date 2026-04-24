import { describe, it, expect } from 'vitest';
import {
  getRegionTier,
  getFreeCreditsForTier,
  PAYWALLED_COUNTRIES,
} from '@/lib/anti-freeloader/region-classifier';
import { CREDIT_COSTS } from '@shared/config/credits.config';

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

  it('should return paywalled for PH', () => {
    expect(getRegionTier('PH')).toBe('paywalled');
  });

  it('should return paywalled for VN (Vietnam)', () => {
    expect(getRegionTier('VN')).toBe('paywalled');
  });

  it('should return paywalled for BD (Bangladesh)', () => {
    expect(getRegionTier('BD')).toBe('paywalled');
  });

  it('should return paywalled for ID (Indonesia)', () => {
    expect(getRegionTier('ID')).toBe('paywalled');
  });

  it('should return paywalled for TH (Thailand)', () => {
    expect(getRegionTier('TH')).toBe('paywalled');
  });

  it('should return paywalled for PK (Pakistan)', () => {
    expect(getRegionTier('PK')).toBe('paywalled');
  });

  it('should return paywalled for NG (Nigeria)', () => {
    expect(getRegionTier('NG')).toBe('paywalled');
  });

  it('should return paywalled for KE (Kenya)', () => {
    expect(getRegionTier('KE')).toBe('paywalled');
  });

  it('should return paywalled for IN (India)', () => {
    expect(getRegionTier('IN')).toBe('paywalled');
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
    expect(getFreeCreditsForTier('paywalled')).toBe(CREDIT_COSTS.PAYWALLED_FREE_CREDITS);
  });

  it('getFreeCreditsForTier should return 3 for restricted', () => {
    expect(getFreeCreditsForTier('restricted')).toBe(CREDIT_COSTS.RESTRICTED_FREE_CREDITS);
  });

  it('getFreeCreditsForTier should return 5 for standard', () => {
    expect(getFreeCreditsForTier('standard')).toBe(CREDIT_COSTS.DEFAULT_FREE_CREDITS);
  });
});
