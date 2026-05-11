'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Check, Lock, Search, Sparkles, X } from 'lucide-react';
import { QualityTier, QUALITY_TIER_CONFIG } from '@/shared/types/coreflow.types';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { getCreditsForTierAtScale } from '@shared/config/subscription.utils';
import { BottomSheet } from '@client/components/ui/BottomSheet';
import { ModelGallerySearch } from './ModelGallerySearch';
import { analytics } from '@client/analytics/analyticsClient';
import { useRegionTier } from '@client/hooks/useRegionTier';
import {
  setCheckoutTrackingContext,
  getCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';
import { getVariant } from '@client/utils/abTest';

const MODEL_GATE_SESSION_KEY = 'upgrade_prompt_shown_model_gate';

export interface IUpgradeDirectParams {
  trigger: string;
  planId: string;
}

export interface IModelGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: QualityTier;
  isFreeUser: boolean;
  onSelect: (tier: QualityTier) => void;
  onUpgrade: () => void;
  /** When provided, clicking a locked model skips intermediate modals and opens checkout directly */
  onUpgradeDirect?: (params: IUpgradeDirectParams) => void;
  /** Prevents auto-opened educational views from being counted as upgrade prompt impressions. */
  suppressUpgradeImpression?: boolean;
  source?: 'manual' | 'mobile' | 'post_download_explore' | 'first_time_auto';
}

// Use centralized config for tier categorization
const PREMIUM_TIERS = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];
const FREE_TIERS = MODEL_COSTS.FREE_QUALITY_TIERS as readonly QualityTier[];
const PURCHASE_INTENT_TIER_ORDER: readonly QualityTier[] = [
  'auto',
  'quick',
  'budget-edit',
  'face-pro',
];
const NICHE_TIER_ORDER: readonly QualityTier[] = ['anime-upscale'];
const MODEL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'free', label: 'Included' },
  { id: 'pro', label: 'Pro' },
  { id: 'upscale', label: 'Upscaling' },
  { id: 'restore', label: 'Photo Restoration' },
  { id: 'portrait', label: 'Portraits' },
  { id: 'product', label: 'Products' },
  { id: 'creative', label: 'Creative Edits' },
] as const;
type ModelFilter = (typeof MODEL_FILTERS)[number]['id'];

const FILTER_TIER_MAP: Record<
  Exclude<ModelFilter, 'all' | 'free' | 'pro'>,
  readonly QualityTier[]
> = {
  upscale: ['quick', 'hd-upscale', 'ultra', 'clarity-pro', 'crisp-upscale', 'anime-upscale'],
  restore: ['face-restore', 'budget-old-photo', 'photo-repair', 'lighting-fix'],
  portrait: ['face-pro', 'face-restore', 'resume-photo', 'budget-edit'],
  product: ['bg-removal', 'budget-edit', 'crisp-upscale', 'clarity-pro', 'hd-upscale'],
  creative: ['fast-edit', 'budget-edit', 'seedream-edit', 'lighting-fix', 'nano-banana-2'],
};

function getSortCreditCost(tier: QualityTier): number {
  const config = QUALITY_TIER_CONFIG[tier];

  if (config.credits !== 'variable') {
    return config.credits;
  }

  if (config.modelId) return getCreditsForTierAtScale(tier, 2);

  // Auto may select expensive models, so do not promote it as a cheap option.
  return 8;
}

function sortByValue(
  a: { id: QualityTier; popularity?: number },
  b: { id: QualityTier; popularity?: number }
) {
  const purchaseIntentDelta =
    PURCHASE_INTENT_TIER_ORDER.indexOf(a.id) - PURCHASE_INTENT_TIER_ORDER.indexOf(b.id);
  const aHasPurchaseIntent = PURCHASE_INTENT_TIER_ORDER.includes(a.id);
  const bHasPurchaseIntent = PURCHASE_INTENT_TIER_ORDER.includes(b.id);

  if (aHasPurchaseIntent && bHasPurchaseIntent) {
    return purchaseIntentDelta;
  }

  if (aHasPurchaseIntent) return -1;
  if (bHasPurchaseIntent) return 1;

  const aIsNiche = NICHE_TIER_ORDER.includes(a.id);
  const bIsNiche = NICHE_TIER_ORDER.includes(b.id);

  if (aIsNiche && !bIsNiche) return 1;
  if (bIsNiche && !aIsNiche) return -1;

  const creditDelta = getSortCreditCost(a.id) - getSortCreditCost(b.id);
  if (creditDelta !== 0) return creditDelta;

  return (b.popularity ?? 50) - (a.popularity ?? 50);
}

/**
 * Modal displaying all quality tiers as visual cards with before/after previews.
 * Features search/filter functionality and separates tiers into "Available" and "Professional" sections.
 */
export const ModelGalleryModal: React.FC<IModelGalleryModalProps> = ({
  isOpen,
  onClose,
  currentTier,
  isFreeUser,
  onSelect,
  onUpgrade,
  suppressUpgradeImpression = false,
  source = 'manual',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ModelFilter>('all');
  const [activeTier, setActiveTier] = useState<QualityTier>(currentTier);
  const { pricingRegion } = useRegionTier();
  const copyVariant = getVariant('batch_limit_copy', ['value', 'outcome', 'urgency']);

  // Track gallery session for analytics
  const galleryOpenedAtRef = useRef<number>(0);
  const originalTierRef = useRef<QualityTier>(currentTier);

  // Reset tracking state when modal opens; fire model_gate prompt for free users (once per session)
  useEffect(() => {
    if (isOpen) {
      galleryOpenedAtRef.current = Date.now();
      originalTierRef.current = currentTier;
      setActiveTier(currentTier);

      if (isFreeUser && !suppressUpgradeImpression && typeof window !== 'undefined') {
        const alreadyShown = sessionStorage.getItem(MODEL_GATE_SESSION_KEY);
        if (!alreadyShown) {
          sessionStorage.setItem(MODEL_GATE_SESSION_KEY, 'true');
          analytics.track('upgrade_prompt_shown', {
            trigger: 'model_gate',
            currentPlan: 'free',
            pricingRegion: pricingRegion || 'standard',
            copyVariant,
          });
        }
      }
    }
  }, [copyVariant, currentTier, isFreeUser, isOpen, pricingRegion, suppressUpgradeImpression]);

  // All tier entries with their configs
  const allTiers = useMemo(() => {
    return Object.entries(QUALITY_TIER_CONFIG).map(([id, config]) => ({
      id: id as QualityTier,
      ...config,
    }));
  }, []);

  // Filter tiers by search query
  const filteredTiers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return allTiers.filter(tier => {
      if (activeFilter === 'free' && !FREE_TIERS.includes(tier.id)) return false;
      if (activeFilter === 'pro' && !PREMIUM_TIERS.includes(tier.id)) return false;
      if (
        activeFilter !== 'all' &&
        activeFilter !== 'free' &&
        activeFilter !== 'pro' &&
        !FILTER_TIER_MAP[activeFilter].includes(tier.id)
      ) {
        return false;
      }

      if (!query) return true;

      // Match against label
      if (tier.label.toLowerCase().includes(query)) return true;

      // Match against bestFor
      if (tier.bestFor.toLowerCase().includes(query)) return true;

      // Match against useCases
      if (tier.useCases.some(uc => uc.toLowerCase().includes(query))) return true;

      return false;
    });
  }, [activeFilter, allTiers, searchQuery]);

  // Separate into free and premium tiers. Tiers with strongest Amplitude purchase-intent
  // correlation are pinned first, then the rest are sorted by user value: cheapest first.
  const { freeTiers, premiumTiers } = useMemo(() => {
    const free = filteredTiers.filter(t => FREE_TIERS.includes(t.id)).sort(sortByValue);
    const premium = filteredTiers.filter(t => PREMIUM_TIERS.includes(t.id)).sort(sortByValue);
    return { freeTiers: free, premiumTiers: premium };
  }, [filteredTiers]);

  const visibleTiers = useMemo(() => [...freeTiers, ...premiumTiers], [freeTiers, premiumTiers]);

  const featuredTiers = useMemo(() => visibleTiers.slice(0, 3), [visibleTiers]);

  const featuredIds = useMemo(() => new Set(featuredTiers.map(tier => tier.id)), [featuredTiers]);

  const moreTiers = useMemo(
    () => visibleTiers.filter(tier => !featuredIds.has(tier.id)),
    [featuredIds, visibleTiers]
  );

  const selectedTier = useMemo(
    () => visibleTiers.find(tier => tier.id === activeTier) ?? visibleTiers[0] ?? allTiers[0],
    [activeTier, allTiers, visibleTiers]
  );
  const selectedTierIsLocked = isFreeUser && PREMIUM_TIERS.includes(selectedTier.id);

  // Handle tier selection
  const handleSelect = useCallback(
    (tier: QualityTier, closeAfterSelect = false) => {
      const previousTier = originalTierRef.current;
      setActiveTier(tier);

      // Track model selection change
      if (tier !== previousTier) {
        analytics.track('model_selection_changed', {
          fromTier: previousTier,
          toTier: tier,
          isFreeUser,
          isPremiumTier: PREMIUM_TIERS.includes(tier),
          timeInGalleryMs: Date.now() - galleryOpenedAtRef.current,
        });
      }

      onSelect(tier);
      if (closeAfterSelect) {
        onClose();
      }
    },
    [onSelect, onClose, isFreeUser]
  );

  // Handle locked tier click through the plan picker so users can choose credits or a plan
  // before the embedded Stripe checkout opens.
  const handleLockedClick = useCallback(
    (tier: QualityTier | 'banner') => {
      const existingContext = getCheckoutTrackingContext();
      const originatingTrigger = existingContext?.originatingTrigger;
      const attributionChain = [...(existingContext?.attributionChain ?? [])];

      if (
        originatingTrigger &&
        attributionChain[attributionChain.length - 1] !== originatingTrigger
      ) {
        attributionChain.push(originatingTrigger);
      }
      if (attributionChain[attributionChain.length - 1] !== 'model_gate') {
        attributionChain.push('model_gate');
      }

      setCheckoutTrackingContext({
        trigger: 'model_gate',
        originatingModel: tier !== 'banner' ? tier : undefined,
        ...(originatingTrigger ? { originatingTrigger } : {}),
        attributionChain: attributionChain.slice(-5),
      });

      analytics.track('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        imageVariant: tier,
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        pricingRegion: pricingRegion || 'standard',
        copyVariant,
        ...(originatingTrigger ? { originatingTrigger } : {}),
      });
      onClose();
      onUpgrade();
    },
    [onUpgrade, onClose, pricingRegion, copyVariant]
  );

  // Clear search when modal closes
  const handleClose = useCallback(() => {
    // Guard: only fire model_gallery_closed if gallery was actually opened.
    // galleryOpenedAtRef.current is 0 until the isOpen useEffect runs.
    // This prevents double-fires from rapid close clicks before state commits.
    if (galleryOpenedAtRef.current > 0) {
      const selectedTier = currentTier;
      const originalTier = originalTierRef.current;

      const visibleFreeTierIds = freeTiers.map(t => t.id);
      const visiblePremiumTierIds = premiumTiers.map(t => t.id);
      const allVisibleTiers = [...visibleFreeTierIds, ...visiblePremiumTierIds];

      analytics.track('model_gallery_closed', {
        changed: selectedTier !== originalTier,
        visibleTiers: allVisibleTiers,
        visibleFreeTiersCount: visibleFreeTierIds.length,
        visiblePremiumTiersCount: visiblePremiumTierIds.length,
        timeInGalleryMs: Date.now() - galleryOpenedAtRef.current,
        isFreeUser,
        hadSearchQuery: searchQuery.length > 0,
        source,
      });

      if (source === 'first_time_auto' && selectedTier === originalTier) {
        analytics.track('first_time_model_picker_dismissed', {
          currentTier,
          isFreeUser,
          hadSearchQuery: searchQuery.length > 0,
          timeInGalleryMs: Date.now() - galleryOpenedAtRef.current,
          visibleFreeTiersCount: visibleFreeTierIds.length,
          visiblePremiumTiersCount: visiblePremiumTierIds.length,
        });
      }

      // Reset so any re-entry after fast double-click doesn't double-fire
      galleryOpenedAtRef.current = 0;
    }

    setSearchQuery('');
    onClose();
  }, [onClose, currentTier, isFreeUser, freeTiers, premiumTiers, searchQuery, source]);

  const hasResults = freeTiers.length > 0 || premiumTiers.length > 0;
  const upgradeCta = isFreeUser ? (
    <button
      type="button"
      onClick={() => handleLockedClick('banner')}
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-violet-300/45 bg-gradient-to-r from-violet-500/34 via-indigo-500/24 to-blue-500/30 p-3.5 text-left shadow-[0_18px_42px_rgba(79,70,229,0.32),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all hover:border-violet-200/70 hover:from-violet-500/42 hover:to-blue-500/38 focus:outline-none focus:ring-2 focus:ring-violet-300/70 md:p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/14 text-white shadow-[0_0_24px_rgba(167,139,250,0.35)] transition-transform group-hover:scale-105">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-base font-black text-white">Unlock all models</span>
          <span className="block truncate text-xs font-semibold text-white/78">
            From $4.99 - sharper premium results
          </span>
        </div>
      </div>
      <span className="shrink-0 rounded-lg bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-wide text-violet-700 shadow-lg shadow-violet-950/25 transition-transform group-hover:scale-105">
        Upgrade
      </span>
    </button>
  ) : null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      showCloseButton={false}
      className="h-[90vh] pb-safe border border-white/15 bg-[#090d1c]/95 shadow-[0_24px_90px_rgba(0,0,0,0.65)] md:h-[min(90vh,720px)] md:max-w-[min(1040px,calc(100vw-48px))] lg:max-w-[min(1040px,calc(100vw-48px))]"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_34%),linear-gradient(180deg,rgba(12,17,34,0.98),rgba(7,10,22,0.98))] p-4 md:p-5">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 text-violet-300 shadow-[0_0_28px_rgba(139,92,246,0.24)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold leading-tight text-white">Choose a model</h2>
              <p className="mt-0.5 text-sm text-white/58">
                Pick the model that matches what you want to improve.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-white/55 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 gap-5 overflow-y-auto pb-4 pr-1 lg:grid-cols-[minmax(0,1fr)_270px] lg:overflow-hidden lg:pb-0 lg:pr-0">
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="shrink-0 space-y-3">
              <div className="max-w-sm">
                <ModelGallerySearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by name, use case, or feature..."
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MODEL_FILTERS.map(filter => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveFilter(filter.id)}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                      activeFilter === filter.id
                        ? 'border-indigo-400/50 bg-indigo-500 text-white shadow-[0_0_22px_rgba(99,102,241,0.34)]'
                        : 'border-white/10 bg-white/[0.035] text-white/70 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {filter.id === 'pro' ? (
                      <span className="inline-flex items-center gap-1">
                        Pro <Lock className="h-3 w-3 text-amber-300" />
                      </span>
                    ) : (
                      filter.label
                    )}
                  </button>
                ))}
              </div>
            </div>

            {hasResults ? (
              <div className="mt-5 min-h-0 space-y-5 lg:flex-1 lg:overflow-y-auto lg:pb-4 lg:pr-1">
                <section>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Sparkles className="h-4 w-4 text-violet-400" />
                      Popular starting points
                    </div>
                  </div>
                  <p className="mb-3 max-w-[620px] text-xs text-white/52">
                    Start here if you are unsure, or use the category filters above for a specific
                    task.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {featuredTiers.map(tier => (
                      <GalleryModelCard
                        key={tier.id}
                        tier={tier.id}
                        isSelected={activeTier === tier.id}
                        isLocked={isFreeUser && PREMIUM_TIERS.includes(tier.id)}
                        onSelect={handleSelect}
                        onLockedClick={() => handleLockedClick(tier.id)}
                      />
                    ))}
                  </div>
                </section>

                {moreTiers.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                      <Sparkles className="h-4 w-4 text-violet-400" />
                      More models
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {moreTiers.map(tier => (
                        <GalleryModelCard
                          key={tier.id}
                          tier={tier.id}
                          isSelected={activeTier === tier.id}
                          isLocked={isFreeUser && PREMIUM_TIERS.includes(tier.id)}
                          onSelect={handleSelect}
                          onLockedClick={() => handleLockedClick(tier.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                  <Search className="h-8 w-8 text-text-muted" />
                </div>
                <p className="mb-2 font-medium text-white">No models found</p>
                <p className="mb-4 text-sm text-text-muted">
                  No models match &quot;{searchQuery}&quot;
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveFilter('all');
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>

          <ModelDetailPanel
            tier={selectedTier.id}
            isLocked={selectedTierIsLocked}
            onPreview={() => handleSelect(selectedTier.id, true)}
            onUpgrade={() => handleLockedClick(selectedTier.id)}
          />
        </div>

        {upgradeCta && <div className="shrink-0 border-t border-white/10 pt-3">{upgradeCta}</div>}

        <div className="flex shrink-0 flex-col gap-3 border-t border-white/10 pt-3 text-xs text-white/48 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-white/48" />
            <span>Select a model now. You can change it before processing.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                selectedTierIsLocked
                  ? handleLockedClick(selectedTier.id)
                  : handleSelect(selectedTier.id, true)
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-600 px-3 py-2 text-xs font-bold text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)] lg:hidden"
            >
              {selectedTierIsLocked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {selectedTierIsLocked ? 'Get credits' : 'Use this model'}
            </button>
            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-semibold text-indigo-300">
              <span className="h-3 w-3 rounded-full border border-indigo-300/70" />
              12 credits
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};

interface IGalleryModelCardProps {
  tier: QualityTier;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: (tier: QualityTier) => void;
  onLockedClick: () => void;
}

const GalleryModelCard: React.FC<IGalleryModelCardProps> = ({
  tier,
  isSelected,
  isLocked,
  onSelect,
  onLockedClick,
}) => {
  const config = QUALITY_TIER_CONFIG[tier];
  const isPremium = PREMIUM_TIERS.includes(tier);
  const creditLabel = formatCardCredits(tier);

  const handleClick = () => {
    if (isLocked) {
      onLockedClick();
      return;
    }

    onSelect(tier);
  };

  return (
    <button
      data-tier={tier}
      data-testid={isLocked ? `locked-${tier}` : `select-${tier}`}
      onClick={handleClick}
      className={`group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? 'border-accent/50 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.55),0_0_28px_rgba(139,92,246,0.38)]'
          : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]'
      } ${isLocked ? 'opacity-80' : ''}`}
    >
      <div className="relative aspect-[1.72/1] overflow-hidden">
        {config.previewImages ? (
          <GalleryBeforeAfterSlider
            previewImages={config.previewImages}
            label={config.label}
            compact
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-indigo-500/20 to-violet-500/10" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0b1022] to-transparent" />
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white ${
            isPremium ? 'bg-violet-600/90' : 'bg-emerald-500/90'
          }`}
        >
          {isPremium ? (
            <>
              Pro <Lock className="h-3 w-3" />
            </>
          ) : (
            'Included'
          )}
        </span>
        <span className="absolute right-2 top-2 h-4 w-4 rounded-full border border-white/85 bg-black/20" />
        {isSelected && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-violet-600 shadow-lg">
            <Check className="h-3.5 w-3.5" data-testid="check-icon" strokeWidth={4} />
          </span>
        )}
        {isLocked && (
          <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">
            <Lock className="h-3 w-3" data-testid="lock-icon" />
            Pro only
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`font-bold text-xs truncate min-w-0 leading-tight ${
              isSelected ? 'text-violet-200' : 'text-white'
            }`}
          >
            {config.label}
          </span>
          <span
            className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
              isSelected
                ? 'border-violet-400/45 bg-black/25 text-violet-200'
                : 'border-white/10 bg-black/20 text-white/58'
            }`}
          >
            {creditLabel}
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-[10px] font-medium text-white/58">{config.bestFor}</p>
      </div>
    </button>
  );
};

interface IModelDetailPanelProps {
  tier: QualityTier;
  isLocked: boolean;
  onPreview: () => void;
  onUpgrade: () => void;
}

const ModelDetailPanel: React.FC<IModelDetailPanelProps> = ({
  tier,
  isLocked,
  onPreview,
  onUpgrade,
}) => {
  const config = QUALITY_TIER_CONFIG[tier];
  const isPremium = PREMIUM_TIERS.includes(tier);
  const preview = config.previewImages;
  const useCaseTags = config.useCases.slice(0, 4);

  return (
    <aside className="hidden rounded-xl border border-white/10 bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:sticky lg:top-0 lg:block lg:self-start">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white ${
          isPremium ? 'bg-violet-600/90' : 'bg-emerald-500/90'
        }`}
      >
        {isPremium ? (
          <>
            Pro <Lock className="h-3 w-3" />
          </>
        ) : (
          'Included'
        )}
      </span>
      <h3 className="mt-3 text-lg font-bold text-white">{config.label}</h3>
      <ul className="mt-2 space-y-1.5 text-[11px] font-medium text-white/74">
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
          <span className="line-clamp-1">{config.description}</span>
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
          <span className="line-clamp-1">{config.bestFor}</span>
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
          {config.smartAnalysisAlwaysOn ? 'Automatic model choice' : 'Focused model'}
        </li>
      </ul>

      <div className="relative mt-3 aspect-[2/0.72] overflow-hidden rounded-lg bg-black/30">
        {preview ? (
          <GalleryBeforeAfterSlider previewImages={preview} label={config.label} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/50">
            Preview unavailable
          </div>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-white/10 text-[10px] text-white/72">
        {[
          ['Access', isPremium ? 'Pro model' : 'Included model'],
          ['Credits', formatCardCredits(tier)],
          ['Model', config.modelId ?? 'Automatic selection'],
        ].map(row => (
          <div
            key={row[0]}
            className="grid grid-cols-[82px_1fr] border-b border-white/10 last:border-b-0"
          >
            <span className="px-2.5 py-1.5 font-semibold text-white/58">{row[0]}</span>
            <span className="truncate border-l border-white/10 px-2.5 py-1.5 font-semibold text-white/82">
              {row[1]}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {useCaseTags.map(tag => (
          <span
            key={tag}
            className="rounded-md border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[9px] font-medium text-white/58"
          >
            {tag}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={isLocked ? onUpgrade : onPreview}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)] transition-transform hover:translate-y-[-1px]"
      >
        {isLocked ? <Lock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {isLocked ? 'Get credits' : 'Use this model'}
      </button>
    </aside>
  );
};

function formatCardCredits(tier: QualityTier): string {
  const config = QUALITY_TIER_CONFIG[tier];
  if (config.credits === 'variable') {
    if (tier === 'clarity-pro' && config.modelId) {
      return `${getCreditsForTierAtScale(tier, 2)} credits`;
    }

    return '1-8 credits';
  }

  return `${config.credits} credit${config.credits === 1 ? '' : 's'}`;
}

interface IGalleryBeforeAfterSliderProps {
  previewImages: NonNullable<(typeof QUALITY_TIER_CONFIG)[QualityTier]['previewImages']>;
  label: string;
  compact?: boolean;
}

const GalleryBeforeAfterSlider: React.FC<IGalleryBeforeAfterSliderProps> = ({
  previewImages,
  label,
  compact = false,
}) => {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    setSliderPos(Math.max(8, Math.min(92, (x / rect.width) * 100)));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      updatePosition(event.clientX);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [updatePosition]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      updatePosition(event.clientX);
    },
    [updatePosition]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const objectPosition = previewImages.objectPosition ?? 'center';

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <img
        src={previewImages.before}
        alt={`${label} before`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition }}
        loading="lazy"
        draggable={false}
      />
      <div
        className="absolute inset-y-0 right-0 overflow-hidden"
        style={{ width: `${100 - sliderPos}%` }}
      >
        <img
          src={previewImages.after}
          alt={`${label} after`}
          className="absolute inset-y-0 right-0 h-full max-w-none object-cover"
          style={{
            objectPosition,
            width: `${10000 / Math.max(1, 100 - sliderPos)}%`,
          }}
          loading="lazy"
          draggable={false}
        />
      </div>
      <div
        className="absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
        style={{ left: `${sliderPos}%` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={event => event.stopPropagation()}
        aria-label={`Adjust ${label} before and after comparison`}
        role="slider"
        aria-valuemin={8}
        aria-valuemax={92}
        aria-valuenow={Math.round(sliderPos)}
        tabIndex={0}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/85" />
        <div
          className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg ${
            compact ? 'h-4 w-4' : 'h-5 w-5'
          }`}
        >
          <div className="h-2 w-px bg-black/35" />
          <div className="ml-px h-2 w-px bg-black/35" />
        </div>
      </div>
      <span
        className={`absolute bottom-2 left-2 rounded bg-black/70 font-bold text-white ${
          compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[9px]'
        }`}
      >
        Before
      </span>
      <span
        className={`absolute bottom-2 right-2 rounded bg-black/70 font-bold text-white ${
          compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[9px]'
        }`}
      >
        After
      </span>
    </div>
  );
};
