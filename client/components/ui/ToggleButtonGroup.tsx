import React from 'react';

export interface IToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
  description?: string;
}

export interface IToggleButtonGroupProps<T extends string> {
  options: IToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  columns?: 2 | 3 | 4;
  size?: 'sm' | 'md';
}

export const ToggleButtonGroup = <T extends string>({
  options,
  value,
  onChange,
  disabled,
  columns = 2,
  size = 'md',
}: IToggleButtonGroupProps<T>): JSX.Element => {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  const sizes = {
    sm: 'p-2 text-xs',
    md: 'p-3 text-sm',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-2`}>
      {options.map(option => {
        const Icon = option.icon;
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`
              ${sizes[size]}
              rounded-lg border-2 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface
              ${
                isSelected
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-secondary hover:bg-surface-light hover:text-text-primary'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={option.description}
          >
            <div className="flex flex-col items-center gap-1">
              {Icon && <Icon className="h-4 w-4" />}
              <span className="text-center leading-tight">{option.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
