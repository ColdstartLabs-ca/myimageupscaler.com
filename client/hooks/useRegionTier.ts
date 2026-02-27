'use client';

import { useEffect, useState } from 'react';
import type { RegionTier } from '@/lib/anti-freeloader/region-classifier';

interface IGeoCache {
  tier: RegionTier;
  country: string | null;
}

// Module-level cache — persists for the browser session
let cachedGeo: IGeoCache | null = null;

export function useRegionTier(): {
  tier: RegionTier | null;
  country: string | null;
  isLoading: boolean;
  isRestricted: boolean;
} {
  const [tier, setTier] = useState<RegionTier | null>(cachedGeo?.tier ?? null);
  const [country, setCountry] = useState<string | null>(cachedGeo?.country ?? null);
  const [isLoading, setIsLoading] = useState(cachedGeo === null);

  useEffect(() => {
    if (cachedGeo !== null) return;
    fetch('/api/geo')
      .then(r => r.json())
      .then((data: { tier?: RegionTier; country?: string | null }) => {
        cachedGeo = { tier: data.tier ?? 'standard', country: data.country ?? null };
        setTier(cachedGeo.tier);
        setCountry(cachedGeo.country);
      })
      .catch(() => {
        cachedGeo = { tier: 'standard', country: null }; // safe default on network failure
        setTier('standard');
        setCountry(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return { tier, country, isLoading, isRestricted: tier === 'restricted' };
}
