'use client';

import { useEffect, useState } from 'react';
import type { RegionTier } from '@/lib/anti-freeloader/region-classifier';

interface IGeoCache {
  tier: RegionTier;
  country: string | null;
  pricingRegion: string;
  discountPercent: number;
}

// Module-level cache — persists for the browser session
let cachedGeo: IGeoCache | null = null;

export function useRegionTier(): {
  tier: RegionTier | null;
  country: string | null;
  isLoading: boolean;
  isRestricted: boolean;
  pricingRegion: string;
  discountPercent: number;
} {
  const [tier, setTier] = useState<RegionTier | null>(cachedGeo?.tier ?? null);
  const [country, setCountry] = useState<string | null>(cachedGeo?.country ?? null);
  const [pricingRegion, setPricingRegion] = useState<string>(
    cachedGeo?.pricingRegion ?? 'standard'
  );
  const [discountPercent, setDiscountPercent] = useState<number>(cachedGeo?.discountPercent ?? 0);
  const [isLoading, setIsLoading] = useState(cachedGeo === null);

  useEffect(() => {
    if (cachedGeo !== null) return;
    fetch('/api/geo')
      .then(r => r.json())
      .then(
        (data: {
          tier?: RegionTier;
          country?: string | null;
          pricingRegion?: string;
          discountPercent?: number;
        }) => {
          cachedGeo = {
            tier: data.tier ?? 'standard',
            country: data.country ?? null,
            pricingRegion: data.pricingRegion ?? 'standard',
            discountPercent: data.discountPercent ?? 0,
          };
          setTier(cachedGeo.tier);
          setCountry(cachedGeo.country);
          setPricingRegion(cachedGeo.pricingRegion);
          setDiscountPercent(cachedGeo.discountPercent);
        }
      )
      .catch(() => {
        cachedGeo = {
          tier: 'standard',
          country: null,
          pricingRegion: 'standard',
          discountPercent: 0,
        };
        setTier('standard');
        setCountry(null);
        setPricingRegion('standard');
        setDiscountPercent(0);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return {
    tier,
    country,
    isLoading,
    isRestricted: tier === 'restricted',
    pricingRegion,
    discountPercent,
  };
}
