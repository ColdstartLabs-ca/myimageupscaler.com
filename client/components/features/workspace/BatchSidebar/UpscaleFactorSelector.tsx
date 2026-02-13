import React, { useEffect } from 'react';
import { ToggleButtonGroup, IToggleOption } from '@client/components/ui/ToggleButtonGroup';

export interface IUpscaleFactorSelectorProps {
  scale: 2 | 4 | 8;
  onChange: (scale: 2 | 4 | 8) => void;
  disabled?: boolean;
  /** Available scales for the selected quality tier (filters the options shown) */
  availableScales?: (2 | 4 | 8)[];
}

const ALL_SCALE_OPTIONS: IToggleOption<string>[] = [
  { value: '2', label: '2x' },
  { value: '4', label: '4x' },
  { value: '8', label: '8x' },
];

export const UpscaleFactorSelector: React.FC<IUpscaleFactorSelectorProps> = ({
  scale,
  onChange,
  disabled,
  availableScales,
}) => {
  // Filter scale options based on availableScales prop
  const scaleOptions = availableScales
    ? ALL_SCALE_OPTIONS.filter(option =>
        availableScales.includes(parseInt(option.value, 10) as 2 | 4 | 8)
      )
    : ALL_SCALE_OPTIONS;

  // Auto-reset scale if current value is not in available scales
  useEffect(() => {
    // Skip for enhancement-only tiers (empty availableScales)
    if (!availableScales || availableScales.length === 0) {
      return;
    }
    // Only reset if current scale is not available
    if (!availableScales.includes(scale)) {
      // Select the first available scale (prefer 4x, then 2x, then 8x in that order of preference)
      const preferredOrder: (2 | 4 | 8)[] = [4, 2, 8];
      const newScale = preferredOrder.find(s => availableScales.includes(s)) ?? availableScales[0];
      onChange(newScale);
    }
  }, [availableScales, scale, onChange]);

  // If no scales available (enhancement-only tier), don't render the selector
  if (availableScales && availableScales.length === 0) {
    return (
      <div>
        <label className="text-sm font-medium text-white mb-3 block">Upscale Factor</label>
        <div className="text-sm text-text-muted">
          This tier is enhancement-only and does not change image dimensions.
        </div>
      </div>
    );
  }

  const handleChange = (value: string) => {
    const scaleValue = parseInt(value, 10) as 2 | 4 | 8;
    onChange(scaleValue);
  };

  // Adjust columns based on number of available options (only 2, 3, or 4 are valid)
  const columns = scaleOptions.length === 1 ? 2 : scaleOptions.length === 2 ? 2 : 3;

  return (
    <div>
      <label className="text-sm font-medium text-white mb-3 block">Upscale Factor</label>
      <ToggleButtonGroup
        options={scaleOptions}
        value={scale.toString()}
        onChange={handleChange}
        disabled={disabled}
        columns={columns}
      />
    </div>
  );
};
