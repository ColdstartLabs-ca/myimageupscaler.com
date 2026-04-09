'use client';

import { useEffect } from 'react';

/**
 * Generic modal behavior hook.
 * - Calls onEscape() when the Escape key is pressed.
 * - Locks body scroll on mount and restores original overflow on unmount.
 *
 * No return value — side-effects only.
 */
export function useModalBehavior(onEscape: () => void): void {
  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape]);

  // Body scroll lock
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);
}
