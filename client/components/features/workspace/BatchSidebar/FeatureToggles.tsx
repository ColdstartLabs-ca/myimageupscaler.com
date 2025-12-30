import React from 'react';
import { Type, UserSquare2 } from 'lucide-react';

export interface IFeatureTogglesProps {
  preserveText: boolean;
  enhanceFace: boolean;
  onPreserveTextChange: (value: boolean) => void;
  onEnhanceFaceChange: (value: boolean) => void;
  disabled?: boolean;
}

export const FeatureToggles: React.FC<IFeatureTogglesProps> = ({
  preserveText,
  enhanceFace,
  onPreserveTextChange,
  onEnhanceFaceChange,
  disabled,
}) => {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground">Additional Options</label>

      <label className="flex items-center space-x-3 cursor-pointer">
        <input
          type="checkbox"
          checked={preserveText}
          onChange={e => onPreserveTextChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent disabled:opacity-50"
        />
        <Type className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Preserve Text</span>
      </label>

      <label className="flex items-center space-x-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enhanceFace}
          onChange={e => onEnhanceFaceChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent disabled:opacity-50"
        />
        <UserSquare2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Enhance Face</span>
      </label>
    </div>
  );
};
