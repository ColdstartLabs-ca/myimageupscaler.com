'use client';

import { QUALITY_TIER_CONFIG, QualityTier } from '@/shared/types/coreflow.types';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { LayoutGrid } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ModelGalleryModal } from '../ModelGalleryModal';
import { analytics } from '@client/analytics/analyticsClient';

// Use centralized config for premium tier checks
const PREMIUM_TIERS = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];
const FREE_TIERS = MODEL_COSTS.FREE_QUALITY_TIERS as readonly QualityTier[];

export interface IQualityTierSelectorProps {
  tier: QualityTier;
  onChange: (tier: QualityTier) => void;
  disabled?: boolean;
  isFreeUser?: boolean;
}

export const QualityTierSelector: React.FC<IQualityTierSelectorProps> = ({
  tier,
  onChange,
  disabled = false,
  isFreeUser = false,
}) => {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Default free users to 'quick' if they have a premium tier selected
  useEffect(() => {
    if (isFreeUser && PREMIUM_TIERS.includes(tier)) {
      onChange('quick');
    }
  }, [isFreeUser, tier, onChange]);

  const currentTierConfig = QUALITY_TIER_CONFIG[tier];

  const formatCredits = (credits: number | 'variable'): string => {
    if (credits === 'variable') {
      return '1-4 credits';
    }
    return `${credits} credit${credits === 1 ? '' : 's'}`;
  };

  const handleOpenGallery = () => {
    if (disabled) return;

    // Track gallery opened event
    analytics.track('model_gallery_opened', {
      currentTier: tier,
      isDefault: FREE_TIERS.includes(tier) && tier === 'quick',
      isFreeUser,
    });

    setIsGalleryOpen(true);
  };

  return (
    <div className="relative">
      <label className="text-sm font-medium text-white mb-2 block">Quality Tier</label>

      {/* Trigger Button - opens gallery modal */}
      <button
        type="button"
        onClick={handleOpenGallery}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between p-3.5 rounded-xl border bg-surface
          transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent/20
          border-border hover:border-border
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex flex-col items-start text-left min-w-0 flex-1 mr-3">
          <div className="flex items-center gap-2 w-full">
            <span className="font-bold text-sm text-white truncate">{currentTierConfig.label}</span>
            <span className="text-[9px] font-black tracking-widest uppercase text-text-muted bg-black/20 border border-white/10 px-2 py-0.5 rounded-lg">
              {formatCredits(currentTierConfig.credits)
                .replace(' credits', ' CR')
                .replace(' credit', ' CR')}
            </span>
          </div>
          <span className="text-[11px] text-white/60 mt-0.5 truncate w-full font-medium">
            {currentTierConfig.bestFor}
          </span>
        </div>
        <LayoutGrid className="h-4 w-4 text-text-muted shrink-0" />
      </button>

      {/* Gallery Modal */}
      <ModelGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        currentTier={tier}
        isFreeUser={isFreeUser}
        onSelect={onChange}
      />
    </div>
  );
};
