'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';

export interface IPremiumUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  onViewPlans: () => void;
}

const COMPARISON_IMAGES = [
  {
    before: '/before-after/bird-before.webp',
    after: '/before-after/bird-after.webp',
  },
  {
    before: '/before-after/girl-before.webp',
    after: '/before-after/girl-after.webp',
  },
];

export const PremiumUpsellModal: React.FC<IPremiumUpsellModalProps> = ({
  isOpen,
  onClose,
  onProceed,
  onViewPlans,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(() =>
    Math.floor(Math.random() * COMPARISON_IMAGES.length)
  );

  // Preload all images when modal opens
  useEffect(() => {
    if (isOpen) {
      COMPARISON_IMAGES.forEach(({ before, after }) => {
        const imgBefore = new Image();
        const imgAfter = new Image();
        imgBefore.src = before;
        imgAfter.src = after;
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentImages = COMPARISON_IMAGES[currentImageIndex];

  const handleNext = () => {
    setCurrentImageIndex(prev => (prev + 1) % COMPARISON_IMAGES.length);
  };

  const handlePrev = () => {
    setCurrentImageIndex(prev => (prev - 1 + COMPARISON_IMAGES.length) % COMPARISON_IMAGES.length);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl rounded-2xl bg-surface shadow-2xl overflow-hidden">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 p-1 rounded-full bg-surface/80 text-muted-foreground transition-colors hover:text-muted-foreground hover:bg-surface"
          >
            <X size={20} />
          </button>

          {/* Image Comparison Section */}
          <div className="relative aspect-[4/3] bg-surface-light">
            <BeforeAfterSlider
              beforeUrl={currentImages.before}
              afterUrl={currentImages.after}
              beforeLabel="Original"
              afterLabel="Premium"
              className="w-full h-full"
            />

            {/* Navigation arrows */}
            {COMPARISON_IMAGES.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/90 shadow-lg text-muted-foreground hover:text-primary hover:bg-surface transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/90 shadow-lg text-muted-foreground hover:text-primary hover:bg-surface transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Image indicators */}
            {COMPARISON_IMAGES.length > 1 && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5">
                {COMPARISON_IMAGES.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentImageIndex
                        ? 'bg-surface w-4'
                        : 'bg-surface/50 hover:bg-surface/75'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="p-6">
            {/* Header */}
            <div className="text-center mb-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 text-sm font-medium mb-3">
                <Sparkles size={14} />
                Premium Quality Available
              </div>
              <h2 className="text-xl font-bold text-primary mb-2">
                Unlock Premium Enhancement Models
              </h2>
              <p className="text-muted-foreground text-sm">
                Drag the slider above to see the difference. Premium models deliver sharper details,
                better face restoration, and superior color accuracy.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onProceed}
                className="flex-1 px-5 py-3 rounded-xl border border-border text-muted-foreground font-medium hover:bg-surface transition-colors"
              >
                Continue with Free
              </button>
              <button
                onClick={onViewPlans}
                className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
              >
                View Premium Plans
                <ArrowRight size={16} />
              </button>
            </div>

            {/* Features hint */}
            <p className="text-center text-xs text-muted-foreground mt-4">
              Premium includes HD Upscale, Face Pro, and Ultra quality tiers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
