'use client';

import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { QUALITY_TIER_CONFIG, QualityTier } from '@shared/types/pixelperfect';
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
      <label className="text-sm font-medium text-slate-700 mb-2 block">Quality Tier</label>

      {/* Selected Value / Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between p-3 rounded-xl border bg-white
          transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20
          ${isOpen ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md' : 'border-slate-200 shadow-sm hover:border-slate-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex flex-col items-start text-left min-w-0 flex-1 mr-3">
          <div className="flex items-center gap-2 w-full">
            <span className="font-semibold text-sm text-slate-900 truncate">
              {currentTierConfig.label}
            </span>
            {tier === 'auto' && (
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium border border-indigo-100 whitespace-nowrap">
                Recommended
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 mt-0.5 truncate w-full">
            {currentTierConfig.bestFor}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/50 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top">
          <div className="p-1.5 space-y-0.5">
            {/* Auto Tier */}
            <button
              onClick={() => handleTierSelect('auto')}
              title={isFreeUser ? 'Paid plans only' : undefined}
              className={`
                w-full flex items-start p-2.5 rounded-lg transition-colors text-left
                ${tier === 'auto' ? 'bg-indigo-50/80 text-indigo-900' : 'hover:bg-slate-50 text-slate-900'}
                ${isFreeUser ? 'opacity-60 bg-slate-50/50 hover:opacity-80 cursor-pointer' : ''}
              `}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Auto</span>
                  {isFreeUser && <Lock className="h-3 w-3 text-amber-500" />}
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium border border-indigo-200/50">
                    Recommended
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                  {QUALITY_TIER_CONFIG.auto.description}
                </div>
              </div>
              <div className="flex flex-col items-end ml-3 shrink-0">
                {tier === 'auto' && <Check className="h-4 w-4 text-indigo-600 mb-1" />}
                <div className="text-[10px] text-slate-400 font-medium bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                  Variable
                </div>
              </div>
            </button>

            <div className="h-px bg-slate-100 mx-2 my-1" />

            {/* Explicit Tiers */}
            {Object.entries(QUALITY_TIER_CONFIG)
              .filter(([id]) => id !== 'auto')
              .map(([id, tierConfig]) => {
                const tierId = id as QualityTier;
                const isSelected = tier === tierId;
                const isLocked = isFreeUser && PREMIUM_TIERS.includes(tierId);

                return (
                  <button
                    key={id}
                    onClick={() => handleTierSelect(tierId)}
                    title={isLocked ? 'Paid plans only' : undefined}
                    className={`
                      w-full flex items-start p-2.5 rounded-lg transition-colors text-left group
                      ${isSelected ? 'bg-indigo-50/80 text-indigo-900' : 'hover:bg-slate-50 text-slate-900'}
                      ${isLocked ? 'opacity-60 bg-slate-50/50 hover:opacity-80 cursor-pointer' : ''}
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{tierConfig.label}</span>
                        {isLocked && <Lock className="h-3 w-3 text-amber-500" />}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate pr-2">
                        {tierConfig.bestFor}
                      </div>
                    </div>
                    <div className="flex flex-col items-end ml-3 shrink-0">
                      {isSelected && <Check className="h-4 w-4 text-indigo-600 mb-1" />}
                      <div
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                          isSelected
                            ? 'text-indigo-600 bg-white border-indigo-100'
                            : 'text-slate-500 bg-slate-50 border-slate-100'
                        }`}
                      >
                        {formatCredits(tierConfig.credits)}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Upgrade Prompt inside dropdown */}
          {isFreeUser && (
            <button
              onClick={() => router.push('/pricing')}
              className="w-full p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-100/50 text-xs text-amber-900 flex items-center justify-between hover:from-amber-100/80 hover:to-orange-100/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="p-1 bg-amber-100 rounded-full">
                  <Lock className="h-3 w-3 text-amber-600" />
                </div>
                <span className="font-medium">Unlock premium tiers</span>
              </div>
              <span className="text-[10px] font-semibold text-amber-700 bg-white/50 px-2 py-0.5 rounded-full border border-amber-100">
                UPGRADE
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
