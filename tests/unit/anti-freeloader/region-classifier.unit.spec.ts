import { describe, it, expect } from 'vitest';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';

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
