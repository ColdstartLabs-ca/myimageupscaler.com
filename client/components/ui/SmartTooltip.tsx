'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface ISmartTooltipProps {
  /** The content to display inside the tooltip */
  content: ReactNode;
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** Additional classes for the wrapper div */
  className?: string;
  /** Whether the tooltip is enabled (default: true) */
  enabled?: boolean;
}

/**
 * A smart tooltip component that automatically positions itself based on available viewport space.
 *
 * Priority order: top → bottom → right → left
 *
 * Usage:
 * ```tsx
 * <SmartTooltip content={<div>Tooltip content here</div>}>
 *   <button>Hover me</button>
 * </SmartTooltip>
 * ```
 */
export function SmartTooltip({
  content,
  children,
  className = '',
  enabled = true,
}: ISmartTooltipProps): JSX.Element {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>('top');
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate best tooltip position based on available space
  const calculateTooltipPosition = useCallback(() => {
    if (!containerRef.current || !enabled) return;

    const rect = containerRef.current.getBoundingClientRect();
    const tooltipHeight = 80; // Approximate tooltip height
    const tooltipWidth = 200; // Approximate tooltip width
    const margin = 10;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;

    // Prefer top, then bottom, then right, then left
    if (spaceAbove >= tooltipHeight + margin) {
      setTooltipPosition('top');
    } else if (spaceBelow >= tooltipHeight + margin) {
      setTooltipPosition('bottom');
    } else if (spaceRight >= tooltipWidth + margin) {
      setTooltipPosition('right');
    } else if (spaceLeft >= tooltipWidth + margin) {
      setTooltipPosition('left');
    } else {
      // Default to bottom if no good space
      setTooltipPosition('bottom');
    }
  }, [enabled]);

  // Get tooltip position classes
  const getTooltipClasses = (): string => {
    const base =
      'absolute px-3 py-2 bg-surface text-text-primary text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto whitespace-nowrap z-50';

    switch (tooltipPosition) {
      case 'top':
        return `${base} bottom-full left-1/2 transform -translate-x-1/2 mb-2`;
      case 'bottom':
        return `${base} top-full left-1/2 transform -translate-x-1/2 mt-2`;
      case 'left':
        return `${base} right-full top-1/2 transform -translate-y-1/2 mr-2`;
      case 'right':
        return `${base} left-full top-1/2 transform -translate-y-1/2 ml-2`;
      default:
        return `${base} bottom-full left-1/2 transform -translate-x-1/2 mb-2`;
    }
  };

  // Get arrow classes based on position
  const getArrowClasses = (): string => {
    const base = 'absolute w-0 h-0';

    switch (tooltipPosition) {
      case 'top':
        return `${base} top-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-surface`;
      case 'bottom':
        return `${base} bottom-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-transparent border-b-surface`;
      case 'left':
        return `${base} left-full top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-transparent border-l-surface`;
      case 'right':
        return `${base} right-full top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-transparent border-r-surface`;
      default:
        return `${base} top-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-surface`;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`group relative ${className}`}
      onMouseEnter={calculateTooltipPosition}
    >
      {children}

      {enabled && (
        <div className={getTooltipClasses()}>
          <div className={getArrowClasses()}></div>
          {content}
        </div>
      )}
    </div>
  );
}
