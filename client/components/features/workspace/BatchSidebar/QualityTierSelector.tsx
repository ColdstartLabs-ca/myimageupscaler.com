'use client';

import { QUALITY_TIER_CONFIG, QualityTier } from '@/shared/types/coreflow.types';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { getCreditsForTierAtScale } from '@shared/config/subscription.utils';
import { LayoutGrid } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ModelGalleryModal } from '../ModelGalleryModal';
import { analytics } from '@client/analytics/analyticsClient';

// Use centralized config for premium tier checks
const PREMIUM_TIERS = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];
const FREE_TIERS = MODEL_COSTS.FREE_QUALITY_TIERS as readonly QualityTier[];

export interface IQualityTierSelectorProps {
  tier: QualityTier;
  scale: 2 | 4 | 8;
  smartAnalysisEnabled?: boolean;
  onChange: (tier: QualityTier) => void;
  disabled?: boolean;
  isFreeUser?: boolean;
  onUpgrade: () => void;
}

export const QualityTierSelector: React.FC<IQualityTierSelectorProps> = ({
  tier,
  scale,
  smartAnalysisEnabled = false,
  onChange,
  disabled = false,
  isFreeUser = false,
  onUpgrade,
}) => {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Default free users to 'quick' if they have a premium tier selected
  useEffect(() => {
    if (isFreeUser && PREMIUM_TIERS.includes(tier)) {
      onChange('quick');
    }
  }, [isFreeUser, tier, onChange]);

  const currentTierConfig = QUALITY_TIER_CONFIG[tier];

  const formatCredits = (): string => {
    if (currentTierConfig.credits === 'variable') {
      return '1-8 credits';
    }

    const smartAnalysisCost = tier !== 'auto' && smartAnalysisEnabled ? 1 : 0;
    const credits = getCreditsForTierAtScale(tier, scale) + smartAnalysisCost;
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
    <div className="relative" data-driver="quality-selector">
      <label className="text-sm font-medium text-white mb-2 block">Quality Tier</label>

      {/* Trigger Button - opens gallery modal */}
      <button
        type="button"
        onClick={handleOpenGallery}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between p-3.5 rounded-xl
          bg-gradient-to-r from-accent/15 via-accent/10 to-tertiary/15
          border border-accent/25 hover:border-accent/40
          shine-effect transition-all duration-300
          focus:outline-none focus:ring-2 focus:ring-accent/20
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex flex-col items-start text-left min-w-0 flex-1 relative z-10">
          <span className="font-bold text-sm text-white truncate w-full">
            {currentTierConfig.label}
          </span>
          <span className="text-[11px] text-white/60 mt-0.5 truncate w-full font-medium">
            {currentTierConfig.bestFor}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 relative z-10 ml-2">
          <span className="text-[9px] font-black tracking-widest uppercase text-white/60 bg-black/20 border border-white/10 px-2 py-0.5 rounded-lg">
            {formatCredits()
              .replace(' credits', ' CR')
              .replace(' credit', ' CR')}
          </span>
          <LayoutGrid className="h-4 w-4 text-accent" />
        </div>
      </button>

      {/* Gallery Modal */}
      <ModelGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        currentTier={tier}
        isFreeUser={isFreeUser}
        onSelect={onChange}
        onUpgrade={onUpgrade}
      />
    </div>
  );
};
