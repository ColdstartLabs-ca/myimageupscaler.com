'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Check, ChevronDown, Lock, Search, Sparkles, X } from 'lucide-react';
import { QualityTier, QUALITY_TIER_CONFIG } from '@/shared/types/coreflow.types';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import {
  getCreditDisplayForTier,
  getCreditsForTierAtScale,
  getEnabledCreditPacks,
  getEnabledPlans,
} from '@shared/config/subscription.utils';
import { BottomSheet } from '@client/components/ui/BottomSheet';
import { ModelGallerySearch } from './ModelGallerySearch';
import { analytics } from '@client/analytics/analyticsClient';
import { useExperimentArm } from '@client/hooks/useExperimentArm';
import { useRegionTier } from '@client/hooks/useRegionTier';
import {
  setCheckoutTrackingContext,
  getCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';
import { getVariant } from '@client/utils/abTest';
import { resolveCheapestRegionalPlan } from '@shared/config/subscription.config';
import type { PricingRegion } from '@shared/config/pricing-regions';
import type { IExperimentAssignment } from '@shared/types/experiments.types';

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
  suppressPurchaseCtas?: boolean;
  source?: 'manual' | 'mobile' | 'post_download_explore' | 'first_time_auto';
  selectedScale?: 2 | 4 | 8;
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

interface IModelGateBanditConfig {
  path?: 'direct_checkout' | 'compact_picker';
  defaultKey?: string;
  defaultType?: 'credit_pack' | 'subscription';
  selection?: 'model_cost_based';
  visiblePacks?: string[];
}

function getExperimentAnalyticsProps(assignment: IExperimentAssignment | null) {
  if (!assignment) return {};

  return {
    experimentKey: assignment.experimentKey,
    experimentContextKey: assignment.contextKey,
    experimentArmId: assignment.armId,
    experimentArmKey: assignment.armKey,
    experimentAssignmentKey: assignment.assignmentKey,
  };
}

function resolveUsageBasedPackPriceId(tier: QualityTier | 'banner', selectedScale: 2 | 4 | 8) {
  const packs = getEnabledCreditPacks();
  if (tier === 'banner') return packs.find(pack => pack.key === 'small')?.stripePriceId;

  const requiredCredits = getCreditsForTierAtScale(tier, selectedScale);
  const sortedPacks = [...packs].sort((a, b) => a.credits - b.credits);
  return (
    sortedPacks.find(pack => pack.credits >= requiredCredits)?.stripePriceId ||
    sortedPacks[sortedPacks.length - 1]?.stripePriceId
  );
}

function resolveStarterSubscriptionPriceId() {
  return getEnabledPlans().find(plan => plan.key === 'starter')?.stripePriceId;
}

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
  onUpgradeDirect,
  suppressUpgradeImpression = false,
  suppressPurchaseCtas = false,
  source = 'manual',
  selectedScale = 2,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ModelFilter>('all');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [activeTier, setActiveTier] = useState<QualityTier>(currentTier);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const { pricingRegion } = useRegionTier();
  const copyVariant = getVariant('batch_limit_copy', ['value', 'outcome', 'urgency']);
  const modelGateExperiment = useExperimentArm({
    experimentKey: 'model_gate_purchase_path',
    contextKey: 'global',
    assignmentScope: 'session',
    surface: 'model_gallery',
    enabled: isOpen && isFreeUser,
    metadata: {
      source,
      pricingRegion: pricingRegion || 'standard',
    },
    fallbackArm: {
      armKey: 'direct_small_pack_control',
      armConfig: { path: 'direct_checkout', defaultKey: 'small' },
    },
  });
  const modelGateBanditConfig = modelGateExperiment.armConfig as IModelGateBanditConfig;

  // Track gallery session for analytics
  const galleryOpenedAtRef = useRef<number>(0);
  const originalTierRef = useRef<QualityTier>(currentTier);

  // Reset tracking state when modal opens; fire model_gate prompt for free users (once per session)
  useEffect(() => {
    if (isOpen) {
      galleryOpenedAtRef.current = Date.now();
      originalTierRef.current = currentTier;
      setActiveTier(currentTier);

      if (
        isFreeUser &&
        !suppressUpgradeImpression &&
        !suppressPurchaseCtas &&
        typeof window !== 'undefined'
      ) {
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
  }, [
    copyVariant,
    currentTier,
    isFreeUser,
    isOpen,
    pricingRegion,
    suppressPurchaseCtas,
    suppressUpgradeImpression,
  ]);

  useEffect(() => {
    if (!isFilterMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFilterMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterMenuOpen]);

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

  const activeFilterLabel =
    MODEL_FILTERS.find(filter => filter.id === activeFilter)?.label ?? 'All';

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

  // Handle locked tier click. Prefer direct checkout when the workspace provides it,
  // keeping the model gate as a short path from premium-model intent to payment.
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
        ...getExperimentAnalyticsProps(modelGateExperiment.assignment),
      });

      const experimentProps = getExperimentAnalyticsProps(modelGateExperiment.assignment);
      const purchasePath = modelGateBanditConfig.path || 'direct_checkout';
      analytics.track('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        imageVariant: tier,
        destination:
          purchasePath === 'compact_picker' || !onUpgradeDirect
            ? 'upgrade_plan_modal'
            : 'checkout_direct',
        currentPlan: 'free',
        pricingRegion: pricingRegion || 'standard',
        copyVariant,
        ...(originatingTrigger ? { originatingTrigger } : {}),
        ...experimentProps,
      });
      onClose();

      if (purchasePath === 'compact_picker') {
        onUpgrade();
        return;
      }

      if (onUpgradeDirect) {
        const planId =
          modelGateBanditConfig.defaultType === 'subscription'
            ? resolveStarterSubscriptionPriceId()
            : modelGateBanditConfig.selection === 'model_cost_based'
              ? resolveUsageBasedPackPriceId(tier, selectedScale)
              : resolveCheapestRegionalPlan((pricingRegion as PricingRegion) || 'standard');
        if (!planId) {
          onUpgrade();
          return;
        }
        onUpgradeDirect({ trigger: 'model_gate', planId });
        return;
      }

      analytics.track('checkout_direct_unavailable', {
        trigger: 'model_gate',
        imageVariant: tier,
        currentPlan: 'free',
        pricingRegion: pricingRegion || 'standard',
        fallbackDestination: 'upgrade_plan_modal',
        ...(originatingTrigger ? { originatingTrigger } : {}),
        ...experimentProps,
      });
      onUpgrade();
    },
    [
      onUpgrade,
      onUpgradeDirect,
      onClose,
      pricingRegion,
      copyVariant,
      modelGateBanditConfig,
      modelGateExperiment.assignment,
      selectedScale,
    ]
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
  const upgradeCta =
    isFreeUser && !suppressPurchaseCtas ? (
      <button
        type="button"
        onClick={() => handleLockedClick('banner')}
        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-500/70 via-indigo-500/58 to-blue-500/62 p-3.5 text-left shadow-[0_20px_46px_rgba(79,70,229,0.46),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all hover:border-white/80 hover:from-violet-500/82 hover:to-blue-500/74 focus:outline-none focus:ring-2 focus:ring-violet-200/80 md:p-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-[0_0_28px_rgba(255,255,255,0.28)] transition-transform group-hover:scale-105">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-base font-black text-white drop-shadow-sm">
              Unlock all models
            </span>
            <span className="block truncate text-xs font-bold text-white/88">
              From $4.99 - sharper premium results
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-violet-700 shadow-lg shadow-violet-950/30 transition-transform group-hover:scale-105">
          Upgrade
        </span>
      </button>
    ) : null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      showCloseButton={false}
      className="model-gallery-modal h-[90vh] w-full max-w-none pb-safe border border-white/15 bg-[#090d1c]/95 shadow-[0_24px_90px_rgba(0,0,0,0.65)]"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_34%),linear-gradient(180deg,rgba(12,17,34,0.98),rgba(7,10,22,0.98))] p-4 md:p-5">
        <div className="shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <Image
              src="/logo/horizontal-logo-compact.png"
              alt="MyImageUpscaler"
              width={88}
              height={28}
              className="h-6 w-auto object-contain"
            />
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/18 text-white/55 transition-colors hover:border-white/35 hover:text-white"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-white">
              Choose a model
            </h2>
            <p className="mt-0.5 text-sm text-white/58">
              Pick the model that matches what you want to improve.
            </p>
          </div>
        </div>

        <div className="mt-5 grid min-h-0 flex-1 gap-5 overflow-y-auto pb-4 pr-1 lg:overflow-hidden lg:pb-0 lg:pr-0">
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <ModelGallerySearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="What do you want to fix?"
                />
              </div>
              <div ref={filterMenuRef} className="relative w-32 shrink-0 sm:w-48">
                <button
                  type="button"
                  onClick={() => setIsFilterMenuOpen(open => !open)}
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/12 bg-white/[0.055] px-3 text-left text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none transition-colors hover:border-white/22 hover:bg-white/[0.075] focus:border-indigo-300/70 focus:ring-2 focus:ring-indigo-400/30"
                  aria-haspopup="listbox"
                  aria-expanded={isFilterMenuOpen}
                >
                  <span className="truncate">{activeFilterLabel}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-white/62 transition-transform ${
                      isFilterMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isFilterMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Filter models"
                    className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-xl border border-white/12 bg-[#0c1124] p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  >
                    {MODEL_FILTERS.map(filter => (
                      <button
                        key={filter.id}
                        type="button"
                        role="option"
                        aria-selected={activeFilter === filter.id}
                        onClick={() => {
                          setActiveFilter(filter.id);
                          setIsFilterMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                          activeFilter === filter.id
                            ? 'bg-indigo-500 text-white'
                            : 'text-white/72 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        <span>{filter.label}</span>
                        {activeFilter === filter.id && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {hasResults ? (
              <div className="mt-4 min-h-0 space-y-5 lg:flex-1 lg:overflow-y-auto lg:pb-4 lg:pr-1">
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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {featuredTiers.map(tier => (
                      <GalleryModelCard
                        key={tier.id}
                        tier={tier.id}
                        isSelected={activeTier === tier.id}
                        isLocked={isFreeUser && PREMIUM_TIERS.includes(tier.id)}
                        onSelect={tier => handleSelect(tier, true)}
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
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {moreTiers.map(tier => (
                        <GalleryModelCard
                          key={tier.id}
                          tier={tier.id}
                          isSelected={activeTier === tier.id}
                          isLocked={isFreeUser && PREMIUM_TIERS.includes(tier.id)}
                          onSelect={tier => handleSelect(tier, true)}
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
        </div>

        {upgradeCta && <div className="shrink-0 border-t border-white/10 pt-3">{upgradeCta}</div>}
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

function formatCardCredits(tier: QualityTier): string {
  return getCreditDisplayForTier(tier);
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
