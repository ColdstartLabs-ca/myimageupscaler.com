'use client';

import { useEffect, useState, useRef } from 'react';
import type { RegionTier } from '@/lib/anti-freeloader/region-classifier';
import { analytics } from '@client/analytics';

interface IGeoCache {
  tier: RegionTier;
  country: string | null;
  pricingRegion: string;
  discountPercent: number;
  isPaywalled: boolean;
}

// Module-level cache — persists for the browser session
let cachedGeo: IGeoCache | null = null;
// Track whether we've identified pricing_region for this session
let hasIdentifiedPricingRegion = false;

export function useRegionTier(): {
  tier: RegionTier | null;
  country: string | null;
  isLoading: boolean;
  isRestricted: boolean;
  isPaywalled: boolean;
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
  // Ref to ensure we only identify once per hook instance
  const hasIdentifiedRef = useRef(false);

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
            isPaywalled: data.tier === 'paywalled',
          };
          setTier(cachedGeo.tier);
          setCountry(cachedGeo.country);
          setPricingRegion(cachedGeo.pricingRegion);
          setDiscountPercent(cachedGeo.discountPercent);

          // Set pricing_region as a user property via $identify
          // Uses $setOnce so it only sets once per user (doesn't overwrite if already set)
          // This enables regional cohort analysis even if individual events are missing data
          if (
            !hasIdentifiedRef.current &&
            !hasIdentifiedPricingRegion &&
            cachedGeo.pricingRegion &&
            analytics.isEnabled()
          ) {
            hasIdentifiedRef.current = true;
            hasIdentifiedPricingRegion = true;
            // Track $identify with pricing_region user property
            // The analytics.track method is used here with $identify event type
            // which the Amplitude SDK recognizes as a user property update
            analytics.track('$identify', {
              $setOnce: { pricing_region: cachedGeo.pricingRegion },
            });
          }
        }
      )
      .catch(() => {
        cachedGeo = {
          tier: 'standard',
          country: null,
          pricingRegion: 'standard',
          discountPercent: 0,
          isPaywalled: false,
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
    isPaywalled: tier === 'paywalled',
    pricingRegion,
    discountPercent,
  };
}
