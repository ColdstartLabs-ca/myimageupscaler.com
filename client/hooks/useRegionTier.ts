'use client';

import { useEffect, useState } from 'react';
import type { RegionTier } from '@/lib/anti-freeloader/region-classifier';

// Module-level cache — persists for the browser session
let cachedTier: RegionTier | null = null;

export function useRegionTier(): {
  tier: RegionTier | null;
  isLoading: boolean;
  isRestricted: boolean;
} {
  const [tier, setTier] = useState<RegionTier | null>(cachedTier);
  const [isLoading, setIsLoading] = useState(cachedTier === null);

  useEffect(() => {
    if (cachedTier !== null) return;
    fetch('/api/geo')
      .then(r => r.json())
      .then((data: { tier?: RegionTier }) => {
        cachedTier = data.tier ?? 'standard';
        setTier(cachedTier);
      })
      .catch(() => {
        cachedTier = 'standard'; // safe default on network failure
        setTier('standard');
      })
      .finally(() => setIsLoading(false));
  }, []);

  return { tier, isLoading, isRestricted: tier === 'restricted' };
}
