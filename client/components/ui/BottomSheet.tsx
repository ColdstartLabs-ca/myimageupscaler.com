'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@client/utils/cn';

export interface IBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional title shown in header on mobile */
  title?: string;
  /** Show close button in header */
  showCloseButton?: boolean;
  /** Additional class names for the content container */
  className?: string;
}

/**
 * Responsive modal that displays as a bottom sheet on mobile and a centered modal on desktop.
 * Includes backdrop blur, focus trap, and keyboard handling.
 */
export const BottomSheet: React.FC<IBottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  showCloseButton = true,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  // Focus trap and body scroll lock
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Lock body scroll
      document.body.style.overflow = 'hidden';

      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown);

      // Focus the container
      if (containerRef.current) {
        containerRef.current.focus();
      }

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'unset';

        // Restore focus to the previously focused element
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
      />

      {/* Content container */}
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn(
          // Base styles
          'relative w-full bg-surface rounded-t-3xl md:rounded-2xl shadow-2xl',
          'max-h-[90vh] overflow-hidden flex flex-col',
          // Mobile: slide up animation
          'animate-slide-up md:animate-scale-in',
          // Desktop: centered modal
          'md:max-w-4xl md:mx-4',
          className
        )}
      >
        {/* Header - always visible on mobile, only if title or closeButton on desktop */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-border shrink-0">
            {/* Mobile drag handle */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full md:hidden" />

            {title && <h2 className="text-lg font-bold text-text-primary mt-2 md:mt-0">{title}</h2>}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="ml-auto p-2 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Scrollable content area */}
        <div className="overflow-y-auto overscroll-contain flex-1">{children}</div>
      </div>
    </div>
  );
};
