'use client';

import { QUALITY_TIER_CONFIG, QualityTier } from '@/shared/types/coreflow.types';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

// Use centralized config for premium tier checks
const PREMIUM_TIERS = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];

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
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Default free users to 'quick' if they have a premium tier selected
  useEffect(() => {
    if (isFreeUser && PREMIUM_TIERS.includes(tier)) {
      onChange('quick');
    }
  }, [isFreeUser, tier, onChange]);

  const handleTierSelect = (selectedTier: QualityTier) => {
    // Redirect free users trying to select premium tiers to pricing
    if (isFreeUser && PREMIUM_TIERS.includes(selectedTier)) {
      router.push('/pricing');
      setIsOpen(false);
      return;
    }
    onChange(selectedTier);
    setIsOpen(false);
  };

  const formatCredits = (credits: number | 'variable'): string => {
    if (credits === 'variable') {
      // Auto tier excludes 8-credit models (Studio) to cap costs
      return '1-4 credits';
    }
    return `${credits} credit${credits === 1 ? '' : 's'}`;
  };

  const currentTierConfig = QUALITY_TIER_CONFIG[tier];

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-sm font-medium text-white mb-2 block">Quality Tier</label>

      {/* Selected Value / Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between p-3.5 rounded-xl border bg-surface
          transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent/20
          ${isOpen ? 'border-accent ring-2 ring-accent/20 shadow-lg shadow-accent/5' : 'border-border hover:border-border'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex flex-col items-start text-left min-w-0 flex-1 mr-3">
          <div className="flex items-center gap-2 w-full">
            <span className="font-bold text-sm text-white truncate">{currentTierConfig.label}</span>
          </div>
          <span className="text-[11px] text-white/60 mt-0.5 truncate w-full font-medium">
            {currentTierConfig.bestFor}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-text-muted shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-accent' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-3 glass-dropdown rounded-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          <div className="p-2 space-y-1">
            {/* Sort Tiers: Available first, then Paid */}
            {(() => {
              const allTiers = Object.entries(QUALITY_TIER_CONFIG).map(([id, config]) => ({
                id: id as QualityTier,
                ...config,
              }));

              const freeTiers = allTiers.filter(t => !PREMIUM_TIERS.includes(t.id));
              const paidTiers = allTiers.filter(t => PREMIUM_TIERS.includes(t.id));

              const renderTier = (t: (typeof allTiers)[0]) => {
                const isSelected = tier === t.id;
                const isLocked = isFreeUser && PREMIUM_TIERS.includes(t.id);
                const isAuto = t.id === 'auto';

                return (
                  <button
                    key={t.id}
                    onClick={() => handleTierSelect(t.id)}
                    title={isLocked ? 'Paid plans only' : undefined}
                    className={`
                      w-full flex items-start p-3.5 rounded-xl transition-all text-left group relative overflow-hidden border
                      ${
                        isSelected
                          ? isAuto
                            ? 'bg-secondary/20 text-secondary border-secondary/40 shadow-sm shadow-secondary/10'
                            : 'bg-accent/20 text-accent border-accent/40 shadow-sm shadow-accent/10'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] text-white border-white/[0.05] hover:border-white/10'
                      }
                      ${isLocked ? 'opacity-40 grayscale-[0.8] cursor-not-allowed bg-black/10' : 'opacity-100'}
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-[13px] tracking-tight transition-colors ${
                            isSelected ? (isAuto ? 'text-secondary' : 'text-accent') : 'text-white'
                          }`}
                        >
                          {t.label}
                        </span>
                        {isAuto && (
                          <span className="text-[8px] bg-secondary/30 text-secondary-light px-1.5 py-0.5 rounded-full font-black border border-secondary/30 uppercase tracking-tighter">
                            Smart
                          </span>
                        )}
                        {isLocked && <Lock className="h-3 w-3 text-white/40" />}
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 font-medium truncate pr-2 ${isSelected ? 'text-white/80' : 'text-text-secondary'}`}
                      >
                        {t.bestFor}
                      </div>
                    </div>
                    <div className="flex flex-col items-end ml-3 shrink-0">
                      {isSelected && (
                        <Check
                          className={`h-4 w-4 mb-1.5 ${isAuto ? 'text-secondary' : 'text-accent'}`}
                          strokeWidth={3}
                        />
                      )}
                      <div
                        className={`text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-lg border ${
                          isSelected
                            ? isAuto
                              ? 'text-secondary bg-black/20 border-secondary/30'
                              : 'text-accent bg-black/20 border-accent/30'
                            : 'text-text-muted bg-black/20 border-white/10'
                        }`}
                      >
                        {formatCredits(t.credits)
                          .replace(' credits', ' CR')
                          .replace(' credit', ' CR')}
                      </div>
                    </div>
                  </button>
                );
              };

              return (
                <>
                  <div className="px-3 pb-1.5 pt-1 text-[10px] font-black text-accent uppercase tracking-widest">
                    Available
                  </div>
                  <div className="space-y-1.5">{freeTiers.map(renderTier)}</div>

                  <div className="flex items-center gap-3 my-4">
                    <div className="h-px bg-white/10 flex-1"></div>
                    <div
                      className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isFreeUser ? 'text-white/30' : 'text-secondary'}`}
                    >
                      Professional Tiers <Lock className="h-2.5 w-2.5" />
                    </div>
                    <div className="h-px bg-white/10 flex-1"></div>
                  </div>

                  <div className="space-y-1.5">{paidTiers.map(renderTier)}</div>
                </>
              );
            })()}
          </div>

          {/* Upgrade Prompt inside dropdown */}
          {isFreeUser && (
            <button
              onClick={() => router.push('/pricing')}
              className="w-full p-4 bg-gradient-to-r from-secondary/30 to-accent/30 border-t border-border text-text-muted flex items-center justify-between hover:from-secondary/40 hover:to-accent/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-secondary/20 rounded-xl group-hover:scale-110 transition-transform">
                  <Lock className="h-4 w-4 text-secondary" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-bold text-white text-xs">Unlock Premium</span>
                  <span className="text-[10px] font-medium text-text-muted">
                    Pro & Studio Tiers
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black text-white bg-gradient-to-r from-accent to-secondary px-3 py-1 rounded-full shadow-lg shadow-accent/20">
                UPGRADE
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
