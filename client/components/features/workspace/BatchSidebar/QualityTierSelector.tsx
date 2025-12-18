'use client';

import { QUALITY_TIER_CONFIG, QualityTier } from '@shared/types/pixelperfect';
import { Check, ChevronDown, Lock } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

// Paid tier requirement mapping (UI-only concern)
const PAID_TIER_REQUIRED: Partial<Record<QualityTier, boolean>> = {
  'face-pro': true,
  ultra: true,
};

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

  const handleTierSelect = (selectedTier: QualityTier) => {
    // Check if free user is trying to select paid tier
    if (isFreeUser && PAID_TIER_REQUIRED[selectedTier]) {
      return; // Block selection for free users
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
              className={`
                w-full flex items-start p-2.5 rounded-lg transition-colors text-left
                ${tier === 'auto' ? 'bg-indigo-50/80 text-indigo-900' : 'hover:bg-slate-50 text-slate-900'}
              `}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Auto</span>
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
                const isLocked = isFreeUser && PAID_TIER_REQUIRED[tierId];

                return (
                  <button
                    key={id}
                    onClick={() => handleTierSelect(tierId)}
                    disabled={isLocked}
                    className={`
                      w-full flex items-start p-2.5 rounded-lg transition-colors text-left group
                      ${isSelected ? 'bg-indigo-50/80 text-indigo-900' : 'hover:bg-slate-50 text-slate-900'}
                      ${isLocked ? 'opacity-60 cursor-not-allowed bg-slate-50/50' : ''}
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
            <div className="p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-100/50 text-xs text-amber-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-amber-100 rounded-full">
                  <Lock className="h-3 w-3 text-amber-600" />
                </div>
                <span className="font-medium">Unlock premium tiers</span>
              </div>
              <span className="text-[10px] font-semibold text-amber-700 bg-white/50 px-2 py-0.5 rounded-full border border-amber-100">
                UPGRADE
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
