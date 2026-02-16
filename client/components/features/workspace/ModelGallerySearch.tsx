'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@client/utils/cn';

export interface IModelGallerySearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Search input component with debounced input handling.
 * Features a search icon, clear button, and glass morphism styling.
 */
export const ModelGallerySearch: React.FC<IModelGallerySearchProps> = ({
  value,
  onChange,
  placeholder = 'Search models...',
}) => {
  const [localValue, setLocalValue] = useState(value);

  // Sync external value changes to local state
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce input changes (150ms)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [localValue, onChange, value]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <div className="relative w-full">
      {/* Search icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <Search
          className={cn(
            'w-4 h-4 transition-colors',
            localValue ? 'text-accent' : 'text-text-muted'
          )}
        />
      </div>

      {/* Input field */}
      <input
        type="text"
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          // Base styles
          'w-full h-10 pl-10 pr-8',
          'rounded-xl text-sm text-white placeholder:text-text-muted',
          // Glass morphism background
          'bg-white/5 border-0',
          // Focus state
          'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:bg-white/[0.08]',
          // Transition
          'transition-all duration-200'
        )}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Clear button */}
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-white rounded-md transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
