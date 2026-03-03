'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Search } from 'lucide-react';
import { QualityTier, QUALITY_TIER_CONFIG } from '@/shared/types/coreflow.types';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { BottomSheet } from '@client/components/ui/BottomSheet';
import { ModelCard } from './ModelCard';
import { ModelGallerySearch } from './ModelGallerySearch';

export interface IModelGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: QualityTier;
  isFreeUser: boolean;
  onSelect: (tier: QualityTier) => void;
}

// Use centralized config for tier categorization
const PREMIUM_TIERS = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];
const FREE_TIERS = MODEL_COSTS.FREE_QUALITY_TIERS as readonly QualityTier[];

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
}) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  // All tier entries with their configs
  const allTiers = useMemo(() => {
    return Object.entries(QUALITY_TIER_CONFIG).map(([id, config]) => ({
      id: id as QualityTier,
      ...config,
    }));
  }, []);

  // Filter tiers by search query
  const filteredTiers = useMemo(() => {
    if (!searchQuery.trim()) return allTiers;

    const query = searchQuery.toLowerCase().trim();

    return allTiers.filter(tier => {
      // Match against label
      if (tier.label.toLowerCase().includes(query)) return true;

      // Match against bestFor
      if (tier.bestFor.toLowerCase().includes(query)) return true;

      // Match against useCases
      if (tier.useCases.some(uc => uc.toLowerCase().includes(query))) return true;

      return false;
    });
  }, [allTiers, searchQuery]);

  // Separate into free and premium tiers, sorted by popularity (descending)
  const { freeTiers, premiumTiers } = useMemo(() => {
    const free = filteredTiers
      .filter(t => FREE_TIERS.includes(t.id))
      .sort((a, b) => (b.popularity ?? 50) - (a.popularity ?? 50));
    const premium = filteredTiers
      .filter(t => PREMIUM_TIERS.includes(t.id))
      .sort((a, b) => (b.popularity ?? 50) - (a.popularity ?? 50));
    return { freeTiers: free, premiumTiers: premium };
  }, [filteredTiers]);

  // Handle tier selection
  const handleSelect = useCallback(
    (tier: QualityTier) => {
      onSelect(tier);
      onClose();
    },
    [onSelect, onClose]
  );

  // Handle locked tier click - navigate to pricing
  const handleLockedClick = useCallback(() => {
    router.push('/pricing');
    onClose();
  }, [router, onClose]);

  // Clear search when modal closes
  const handleClose = useCallback(() => {
    setSearchQuery('');
    onClose();
  }, [onClose]);

  const hasResults = freeTiers.length > 0 || premiumTiers.length > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Select Model" className="pb-safe">
      <div className="p-4 md:p-5 space-y-4">
        {/* Search bar */}
        <ModelGallerySearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by name, use case, or feature..."
        />

        {/* Upgrade prompt for free users - top position */}
        {isFreeUser && !searchQuery && (
          <button
            onClick={handleLockedClick}
            className="w-full p-4 bg-gradient-to-r from-secondary/20 to-accent/20 border border-border rounded-xl flex items-center justify-between hover:from-secondary/30 hover:to-accent/30 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary/20 rounded-xl group-hover:scale-110 transition-transform">
                <Lock className="w-4 h-4 text-secondary" />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-bold text-white text-sm">Unlock Premium Models</span>
                <span className="text-[11px] font-medium text-text-muted">
                  Get access to all professional tiers
                </span>
              </div>
            </div>
            <span className="text-[10px] font-black text-white bg-gradient-to-r from-accent to-secondary px-3 py-1.5 rounded-full shadow-lg shadow-accent/20">
              UPGRADE
            </span>
          </button>
        )}

        {/* Results or empty state */}
        {hasResults ? (
          <>
            {/* Free tiers section */}
            {freeTiers.length > 0 && (
              <section>
                <h3 className="text-[11px] font-black text-accent uppercase tracking-widest mb-3 px-1">
                  Available
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {freeTiers.map((tier, index) => (
                    <div
                      key={tier.id}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <ModelCard
                        tier={tier.id}
                        config={QUALITY_TIER_CONFIG[tier.id]}
                        isSelected={currentTier === tier.id}
                        isLocked={false}
                        onSelect={handleSelect}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Divider */}
            {freeTiers.length > 0 && premiumTiers.length > 0 && (
              <div className="flex items-center gap-3 py-2">
                <div className="h-px bg-white/10 flex-1" />
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-secondary">
                  <Lock className="w-3 h-3" />
                  Professional Tiers
                </div>
                <div className="h-px bg-white/10 flex-1" />
              </div>
            )}

            {/* Premium tiers section */}
            {premiumTiers.length > 0 && (
              <section>
                {freeTiers.length === 0 && (
                  <h3 className="text-[11px] font-black text-secondary uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
                    <Lock className="w-3 h-3" />
                    Professional Tiers
                  </h3>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {premiumTiers.map((tier, index) => (
                    <div
                      key={tier.id}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${(freeTiers.length + index) * 50}ms` }}
                    >
                      <ModelCard
                        tier={tier.id}
                        config={QUALITY_TIER_CONFIG[tier.id]}
                        isSelected={currentTier === tier.id}
                        isLocked={isFreeUser && PREMIUM_TIERS.includes(tier.id)}
                        onSelect={handleSelect}
                        onLockedClick={handleLockedClick}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          /* No results state */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-white font-medium mb-2">No models found</p>
            <p className="text-text-muted text-sm mb-4">
              No models match &quot;{searchQuery}&quot;
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-accent text-sm font-medium hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
