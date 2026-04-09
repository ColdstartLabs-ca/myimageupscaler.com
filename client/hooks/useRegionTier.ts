'use client';

import { useEffect, useState, useRef } from 'react';
import type { RegionTier } from '@/lib/anti-freeloader/region-classifier';
import { analytics } from '@client/analytics';
import {
  PRICING_GEO_SESSION_KEY,
  parsePricingGeoSession,
  serializePricingGeoSession,
  type IPricingGeoSession,
} from '@shared/utils/pricing-geo-session';
import type { PricingRegion } from '@shared/config/pricing-regions';

// Module-level cache avoids duplicate geo fetches within a single runtime.
let cachedGeo: IPricingGeoSession | null = null;
// Track whether we've identified pricing_region for this session
let hasIdentifiedPricingRegion = false;

function applyGeoState(
  geo: IPricingGeoSession,
  setters: {
    setTier: (value: RegionTier) => void;
    setCountry: (value: string | null) => void;
    setPricingRegion: (value: string) => void;
    setDiscountPercent: (value: number) => void;
    setBanditArmId: (value: number | null) => void;
  }
): void {
  setters.setTier(geo.tier);
  setters.setCountry(geo.country);
  setters.setPricingRegion(geo.pricingRegion);
  setters.setDiscountPercent(geo.discountPercent);
  setters.setBanditArmId(geo.banditArmId);
}

function persistGeo(geo: IPricingGeoSession): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(PRICING_GEO_SESSION_KEY, serializePricingGeoSession(geo));
  } catch {
    // Ignore storage failures and fall back to in-memory caching.
  }
}

function readStoredGeo(): IPricingGeoSession | null {
  if (typeof window === 'undefined') return null;

  try {
    return parsePricingGeoSession(sessionStorage.getItem(PRICING_GEO_SESSION_KEY));
  } catch {
    return null;
  }
}

function maybeIdentifyPricingRegion(
  geo: IPricingGeoSession,
  hasIdentifiedRef: { current: boolean }
): void {
  if (
    !hasIdentifiedRef.current &&
    !hasIdentifiedPricingRegion &&
    geo.pricingRegion &&
    analytics.isEnabled()
  ) {
    hasIdentifiedRef.current = true;
    hasIdentifiedPricingRegion = true;
    analytics.track('$identify', {
      $setOnce: { pricing_region: geo.pricingRegion },
    });
  }
}

export function useRegionTier(): {
  tier: RegionTier | null;
  country: string | null;
  isLoading: boolean;
  isRestricted: boolean;
  isPaywalled: boolean;
  pricingRegion: string;
  discountPercent: number;
  banditArmId: number | null;
} {
  // Always start with null/defaults to match server render and avoid hydration mismatch.
  // The cache is applied in the useEffect below.
  const [tier, setTier] = useState<RegionTier | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [pricingRegion, setPricingRegion] = useState<string>('standard');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [banditArmId, setBanditArmId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Ref to ensure we only identify once per hook instance
  const hasIdentifiedRef = useRef(false);

  useEffect(() => {
    const hydrateGeo = (geo: IPricingGeoSession) => {
      cachedGeo = geo;
      applyGeoState(geo, {
        setTier,
        setCountry,
        setPricingRegion,
        setDiscountPercent,
        setBanditArmId,
      });
      maybeIdentifyPricingRegion(geo, hasIdentifiedRef);
      setIsLoading(false);
    };

    if (cachedGeo !== null) {
      hydrateGeo(cachedGeo);
      return;
    }

    const storedGeo = readStoredGeo();
    if (storedGeo !== null) {
      hydrateGeo(storedGeo);
      return;
    }

    fetch('/api/geo')
      .then(r => r.json())
      .then(
        (data: {
          tier?: RegionTier;
          country?: string | null;
          pricingRegion?: PricingRegion;
          discountPercent?: number;
          banditArmId?: number | null;
        }) => {
          const nextGeo: IPricingGeoSession = {
            tier: data.tier ?? 'standard',
            country: data.country ?? null,
            pricingRegion: data.pricingRegion ?? 'standard',
            discountPercent: data.discountPercent ?? 0,
            banditArmId: data.banditArmId ?? null,
          };
          persistGeo(nextGeo);
          hydrateGeo(nextGeo);
        }
      )
      .catch(() => {
        const fallbackGeo: IPricingGeoSession = {
          tier: 'standard',
          country: null,
          pricingRegion: 'standard',
          discountPercent: 0,
          banditArmId: null,
        };
        persistGeo(fallbackGeo);
        hydrateGeo(fallbackGeo);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return {
    tier,
    country,
    isLoading,
    isRestricted: tier === 'restricted',
    isPaywalled: tier === 'paywalled',
    pricingRegion,
    discountPercent,
    banditArmId,
  };
}
