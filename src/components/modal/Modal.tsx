import React, { forwardRef } from 'react';

interface IModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  isOpen: boolean;
  showCloseButton?: boolean;
}

export const Modal = forwardRef<HTMLDivElement, IModalProps>(
  ({ title, children, onClose, isOpen, showCloseButton = true }, ref) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center font-sans">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onClose} />

        {/* Modal Content */}
        <div
          ref={ref}
          className="relative w-11/12 max-w-md bg-card rounded-2xl shadow-2xl z-[101] max-h-[90vh] overflow-y-auto border border-border"
          role="dialog"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border px-6 py-5 rounded-t-2xl" id="modal-title">
            <h3 className="text-2xl font-bold text-center text-foreground">
              {title}
            </h3>
            {showCloseButton && (
              <button
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 hover:bg-slate-100"
                onClick={onClose}
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-6">{children}</div>

          {/* Footer */}
          {showCloseButton && (
            <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 rounded-b-2xl">
              <button
                className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-foreground font-medium rounded-lg transition-colors"
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
