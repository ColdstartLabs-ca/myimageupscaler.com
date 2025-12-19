'use client';

import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  IAdditionalOptions,
  IEnhancementSettings,
  QualityTier,
} from '@shared/types/pixelperfect';
import { Brain, ChevronDown, Edit3, Sparkles, Type, UserSquare2 } from 'lucide-react';
import React, { useState } from 'react';

export interface IEnhancementOptionsProps {
  options: IAdditionalOptions;
  onChange: (options: IAdditionalOptions) => void;
  onOpenCustomInstructions: () => void;
  selectedTier: QualityTier;
  disabled?: boolean;
  isFreeUser?: boolean;
}

export const EnhancementOptions: React.FC<IEnhancementOptionsProps> = ({
  options,
  onChange,
  onOpenCustomInstructions,
  selectedTier,
  disabled = false,
  isFreeUser = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Smart AI Analysis is hidden when Auto tier is selected (always on implicitly)
  const showSmartAnalysis = selectedTier !== 'auto';

  const handleToggle = (key: keyof IAdditionalOptions, value: boolean | string) => {
    onChange({
      ...options,
      [key]: value,
    });
  };

  const handleEnhancementToggle = (key: keyof IEnhancementSettings, value: boolean) => {
    const currentEnhancement = options.enhancement || DEFAULT_ENHANCEMENT_SETTINGS;
    onChange({
      ...options,
      enhancement: {
        ...currentEnhancement,
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-3">
      {/* Smart AI Analysis - Prominent Card */}
      {showSmartAnalysis && (
        <div
          className={`rounded-lg border overflow-hidden ${
            isFreeUser
              ? 'border-slate-200 bg-slate-50/50 opacity-60'
              : 'border-indigo-100 bg-indigo-50/50'
          }`}
          title={isFreeUser ? 'Paid plans only' : undefined}
        >
          <div className="p-3 flex items-start gap-3">
            <div
              className={`p-1.5 rounded-md shrink-0 ${isFreeUser ? 'bg-slate-200' : 'bg-indigo-100'}`}
            >
              <Brain className={`h-4 w-4 ${isFreeUser ? 'text-slate-500' : 'text-indigo-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="smart-analysis"
                  className={`font-medium text-sm ${isFreeUser ? 'text-slate-600 cursor-not-allowed' : 'text-indigo-900 cursor-pointer'}`}
                >
                  Smart AI Analysis
                </label>
                <input
                  type="checkbox"
                  id="smart-analysis"
                  checked={isFreeUser ? false : options.smartAnalysis}
                  onChange={e => handleToggle('smartAnalysis', e.target.checked)}
                  disabled={disabled || isFreeUser}
                  className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
              <p className={`text-xs mt-1 ${isFreeUser ? 'text-slate-500' : 'text-indigo-700'}`}>
                {isFreeUser
                  ? 'Upgrade to let AI detect content type and optimize settings automatically.'
                  : 'AI automatically detects image content and optimizes parameters for best results.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Auto tier indicator (prominent) */}
      {selectedTier === 'auto' && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-indigo-100 rounded-md shrink-0">
              <Brain className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <div className="font-medium text-sm text-indigo-900">Smart Analysis Active</div>
              <p className="text-xs text-indigo-700 mt-1">
                AI will automatically select the best enhancements for your image.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Options Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-700 group hover:text-slate-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-500 group-hover:text-indigo-500 transition-colors" />
          <span>Additional Enhancements</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Collapsible Content */}
      <div
        className={`space-y-3 overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {/* Enhance Image */}
        <div className="flex flex-col gap-1 pl-1">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enhance-image"
              checked={options.enhance}
              onChange={e => handleToggle('enhance', e.target.checked)}
              disabled={disabled}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <label htmlFor="enhance-image" className="flex items-center gap-2 cursor-pointer">
              <Sparkles className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-sm text-slate-700">Enhance Image</span>
            </label>
          </div>

          {/* Enhancement sub-options */}
          {options.enhance && options.enhancement && (
            <div className="ml-5.5 mt-1 p-2 bg-slate-50 rounded border border-slate-100">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {[
                  { key: 'clarity', label: 'Clarity' },
                  { key: 'color', label: 'Color' },
                  { key: 'lighting', label: 'Lighting' },
                  { key: 'denoise', label: 'Denoise' },
                  { key: 'artifacts', label: 'Artifacts' },
                  { key: 'details', label: 'Details' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={options.enhancement?.[key as keyof IEnhancementSettings] || false}
                      onChange={e =>
                        handleEnhancementToggle(key as keyof IEnhancementSettings, e.target.checked)
                      }
                      disabled={disabled}
                      className="h-3 w-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    <span className="text-slate-600">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Enhance Faces */}
        <div className="flex items-center gap-2 pl-1">
          <input
            type="checkbox"
            id="enhance-faces"
            checked={options.enhanceFaces}
            onChange={e => handleToggle('enhanceFaces', e.target.checked)}
            disabled={disabled}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
          />
          <label htmlFor="enhance-faces" className="flex items-center gap-2 cursor-pointer">
            <UserSquare2 className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-sm text-slate-700">Enhance Faces</span>
          </label>
        </div>

        {/* Preserve Text */}
        <div className="flex items-center gap-2 pl-1">
          <input
            type="checkbox"
            id="preserve-text"
            checked={options.preserveText}
            onChange={e => handleToggle('preserveText', e.target.checked)}
            disabled={disabled}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
          />
          <label htmlFor="preserve-text" className="flex items-center gap-2 cursor-pointer">
            <Type className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-sm text-slate-700">Preserve Text</span>
          </label>
        </div>

        {/* Custom Instructions */}
        <div className="flex items-center gap-2 pl-1">
          <input
            type="checkbox"
            id="custom-instructions"
            checked={!!options.customInstructions}
            onChange={e => {
              if (e.target.checked) {
                onOpenCustomInstructions();
              } else {
                handleToggle('customInstructions', '');
              }
            }}
            disabled={disabled}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
          />
          <label htmlFor="custom-instructions" className="flex items-center gap-2 cursor-pointer">
            <Edit3 className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-sm text-slate-700">Custom Instructions</span>
            {options.customInstructions && (
              <span className="text-xs text-indigo-600 ml-1">
                ({options.customInstructions.length} chars)
              </span>
            )}
          </label>
        </div>
      </div>
    </div>
  );
};
