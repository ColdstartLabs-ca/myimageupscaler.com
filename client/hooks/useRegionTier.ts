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
let pendingGeoRequest: Promise<IPricingGeoSession | null> | null = null;
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

function normalizeGeo(
  data:
    | Partial<IPricingGeoSession>
    | {
        tier?: RegionTier;
        country?: string | null;
        pricingRegion?: PricingRegion;
        discountPercent?: number;
        banditArmId?: number | null;
      }
): IPricingGeoSession {
  return {
    tier: data.tier ?? 'standard',
    country: data.country ?? null,
    pricingRegion: data.pricingRegion ?? 'standard',
    discountPercent: data.discountPercent ?? 0,
    banditArmId: data.banditArmId ?? null,
  };
}

function areGeoSessionsEqual(a: IPricingGeoSession, b: IPricingGeoSession): boolean {
  return (
    a.tier === b.tier &&
    a.country === b.country &&
    a.pricingRegion === b.pricingRegion &&
    a.discountPercent === b.discountPercent &&
    a.banditArmId === b.banditArmId
  );
}

async function fetchGeo(): Promise<IPricingGeoSession | null> {
  if (pendingGeoRequest) {
    return pendingGeoRequest;
  }

  pendingGeoRequest = fetch('/api/geo', { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Geo request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        tier?: RegionTier;
        country?: string | null;
        pricingRegion?: PricingRegion;
        discountPercent?: number;
        banditArmId?: number | null;
      };

      return normalizeGeo(data);
    })
    .catch(() => null)
    .finally(() => {
      pendingGeoRequest = null;
    });

  return pendingGeoRequest;
}

interface IUseRegionTierOptions {
  initialGeo?: IPricingGeoSession | null;
}

type IUseRegionTierResult = {
  tier: RegionTier | null;
  country: string | null;
  isLoading: boolean;
  isRestricted: boolean;
  isPaywalled: boolean;
  pricingRegion: string;
  discountPercent: number;
  banditArmId: number | null;
};

export function useRegionTier(options?: IUseRegionTierOptions): IUseRegionTierResult {
  const initialGeo = options?.initialGeo ?? null;
  // Always start with null/defaults to match server render and avoid hydration mismatch.
  // The cache/storage is applied in the useEffect below.
  const [tier, setTier] = useState<RegionTier | null>(initialGeo?.tier ?? null);
  const [country, setCountry] = useState<string | null>(initialGeo?.country ?? null);
  const [pricingRegion, setPricingRegion] = useState<string>(
    initialGeo?.pricingRegion ?? 'standard'
  );
  const [discountPercent, setDiscountPercent] = useState<number>(initialGeo?.discountPercent ?? 0);
  const [banditArmId, setBanditArmId] = useState<number | null>(initialGeo?.banditArmId ?? null);
  const [isLoading, setIsLoading] = useState(initialGeo === null);
  // Ref to ensure we only identify once per hook instance
  const hasIdentifiedRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const hydrateGeo = (geo: IPricingGeoSession, persist = true) => {
      cachedGeo = geo;
      if (persist) {
        persistGeo(geo);
      }
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

    const optimisticGeo = initialGeo ?? cachedGeo ?? readStoredGeo();

    if (optimisticGeo !== null) {
      hydrateGeo(optimisticGeo, Boolean(initialGeo));
    }

    fetchGeo().then(nextGeo => {
      if (isCancelled) {
        return;
      }

      if (!nextGeo) {
        if (optimisticGeo === null) {
          setTier('standard');
          setCountry(null);
          setPricingRegion('standard');
          setDiscountPercent(0);
          setBanditArmId(null);
          setIsLoading(false);
        }
        return;
      }

      if (!optimisticGeo || !areGeoSessionsEqual(nextGeo, optimisticGeo)) {
        hydrateGeo(nextGeo);
        return;
      }

      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [initialGeo]);

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
