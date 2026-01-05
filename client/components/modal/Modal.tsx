'use client';

import React, { forwardRef, useEffect, useState } from 'react';

interface IModalProps {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  children: React.ReactNode;
  onClose: () => void;
  isOpen: boolean;
  showCloseButton?: boolean;
  modalId?: string;
}

export const Modal = forwardRef<HTMLDivElement, IModalProps>(
  (
    {
      title,
      subtitle,
      showLogo = false,
      children,
      onClose,
      isOpen,
      showCloseButton = true,
      modalId,
    },
    ref
  ) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(isOpen);

    useEffect(() => {
      if (isOpen) {
        setShouldRender(true);
        // Small delay to ensure DOM is ready before animation
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });

        // Add escape key handler
        const handleEscape = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            onClose();
          }
        };
        document.addEventListener('keydown', handleEscape);

        return () => {
          document.removeEventListener('keydown', handleEscape);
        };
      } else {
        setIsAnimating(false);
        // Wait for animation to complete before removing from DOM
        const timer = setTimeout(() => setShouldRender(false), 200);
        return () => clearTimeout(timer);
      }
    }, [isOpen, onClose]);

    if (!shouldRender) return null;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center font-sans">
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            isAnimating ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onClose}
        />

        {/* Modal Content */}
        <div
          ref={ref}
          id={modalId}
          className={`relative w-11/12 max-w-md bg-card rounded-2xl shadow-2xl z-[101] max-h-[90vh] overflow-hidden border border-border/50 transition-all duration-200 ${
            isAnimating ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
          }`}
          role="dialog"
          aria-labelledby="modal-title"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border/50 px-6 py-5 z-10"
            id="modal-title"
          >
            {showLogo && (
              <div className="flex justify-center mb-4">
                <img
                  src="/logo/horizontal-logo-compact.png"
                  alt="MyImageUpscaler"
                  className="h-8 w-auto"
                />
              </div>
            )}
            <h3
              className={`text-2xl font-bold text-center text-foreground ${showCloseButton ? 'pr-8' : ''}`}
            >
              {title}
            </h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground text-center mt-1">{subtitle}</p>
            )}
            {showCloseButton && (
              <button
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-all duration-200 rounded-lg p-1.5 hover:bg-muted/50 active:scale-95"
                onClick={onClose}
                aria-label="Close modal"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-180px)]">{children}</div>

          {/* Footer */}
          {showCloseButton && (
            <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border/50 px-6 py-4 z-10">
              <button
                className="w-full px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-all duration-200 active:scale-98 hover:shadow-sm"
                onClick={onClose}
                aria-label="Close modal"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

Modal.displayName = 'Modal';
