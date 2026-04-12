import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { IPricingGeoSession } from '@shared/utils/pricing-geo-session';

const { mockTrack, mockIsEnabled } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockIsEnabled: vi.fn(() => false),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: mockIsEnabled,
  },
}));

const STALE_STANDARD_GEO: IPricingGeoSession = {
  tier: 'standard',
  country: 'US',
  pricingRegion: 'standard',
  discountPercent: 0,
  banditArmId: null,
};

const RUSSIA_GEO: IPricingGeoSession = {
  tier: 'restricted',
  country: 'RU',
  pricingRegion: 'eastern_europe',
  discountPercent: 40,
  banditArmId: null,
};

async function importHook() {
  const { useRegionTier } = await import('@client/hooks/useRegionTier');
  return useRegionTier;
}

describe('useRegionTier', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsEnabled.mockReturnValue(false);
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps server-provided geo when sessionStorage is stale and revalidation fails', async () => {
    sessionStorage.setItem('pricing_geo_v1', JSON.stringify(STALE_STANDARD_GEO));
    vi.mocked(fetch).mockRejectedValueOnce(new Error('geo unavailable'));

    const useRegionTier = await importHook();
    const { result } = renderHook(() => useRegionTier({ initialGeo: RUSSIA_GEO }));

    expect(result.current.pricingRegion).toBe('eastern_europe');
    expect(result.current.discountPercent).toBe(40);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pricingRegion).toBe('eastern_europe');
    expect(result.current.discountPercent).toBe(40);
    expect(sessionStorage.getItem('pricing_geo_v1')).toContain('"pricingRegion":"eastern_europe"');
  });

  it('revalidates stale stored geo when no server geo is available', async () => {
    sessionStorage.setItem('pricing_geo_v1', JSON.stringify(STALE_STANDARD_GEO));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => RUSSIA_GEO,
    } as Response);

    const useRegionTier = await importHook();
    const { result } = renderHook(() => useRegionTier());

    expect(result.current.pricingRegion).toBe('standard');
    expect(result.current.discountPercent).toBe(0);

    await waitFor(() => {
      expect(result.current.pricingRegion).toBe('eastern_europe');
    });

    expect(result.current.discountPercent).toBe(40);
    expect(sessionStorage.getItem('pricing_geo_v1')).toContain('"country":"RU"');
  });
});
