import { EnhancementAspect, IEnhancementSettings } from '@/shared/types/coreflow.types';
import { Eraser, Focus, Grid3X3, Palette, Scan, Sun } from 'lucide-react';
import React from 'react';

export interface IEnhancementPanelProps {
  settings: IEnhancementSettings;
  onChange: (settings: IEnhancementSettings) => void;
  disabled?: boolean;
}

export const EnhancementPanel: React.FC<IEnhancementPanelProps> = ({
  settings,
  onChange,
  disabled,
}) => {
  // Enhancement aspect options with icons and descriptions
  const ENHANCEMENT_ASPECTS: Array<{
    key: EnhancementAspect;
    label: string;
    description: string;
    icon: React.ElementType;
  }> = [
      {
        key: 'clarity',
        label: 'Clarity',
        description: 'Sharpen edges and improve overall clarity',
        icon: Focus,
      },
      {
        key: 'color',
        label: 'Color',
        description: 'Balance color saturation and correct color casts',
        icon: Palette,
      },
      {
        key: 'lighting',
        label: 'Lighting',
        description: 'Optimize exposure and balance lighting',
        icon: Sun,
      },
      {
        key: 'denoise',
        label: 'Denoise',
        description: 'Remove sensor noise and grain',
        icon: Eraser,
      },
      {
        key: 'artifacts',
        label: 'Artifacts',
        description: 'Remove JPEG compression artifacts',
        icon: Grid3X3,
      },
      {
        key: 'details',
        label: 'Details',
        description: 'Enhance fine textures and subtle details',
        icon: Scan,
      },
    ];

  const toggleAspect = (aspectKey: EnhancementAspect) => {
    onChange({
      ...settings,
      [aspectKey]: !settings[aspectKey],
    });
  };

  return (
    <div>
      <label className="text-sm font-medium text-slate-700 mb-3 block">Enhancement Aspects</label>
      <div className="grid grid-cols-3 gap-2">
        {ENHANCEMENT_ASPECTS.map(aspect => {
          const Icon = aspect.icon;
          const isSelected = settings[aspect.key];

          return (
            <button
              key={aspect.key}
              type="button"
              onClick={() => toggleAspect(aspect.key)}
              disabled={disabled}
              title={aspect.description}
              className={`
                p-2 text-xs rounded-lg border-2 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                ${isSelected
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex flex-col items-center gap-1">
                <Icon className="h-4 w-4" />
                <span className="text-center leading-tight">{aspect.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
